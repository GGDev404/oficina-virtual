---
name: millet-sucursales
description: Usar al exponer o filtrar datos por sucursal en Millet ERP (ADR-0051): entidades con SucursalId, endpoints o queries que listan/leen/modifican por sucursal, permiso de bypass todas-sucursales, SucursalScopeGuard, selector de sucursal en UI y pruebas de acceso entre sucursales.
---

# Segmentación de datos por sucursal (ADR-0051)

Fuente: `CLAUDE.md` (sección "Segmentación de datos por sucursal"), `docs/decisiones/0051-segmentacion-de-datos-por-sucursal.md`, `.claude/project-test-rules.md` (sección Sucursales), ADR-0011 y ADR-0041.

## Modelo (una empresa, varias sucursales)
- Millet = una razón social, varias sucursales (CDMX, Mérida, Cancún...). `empresa_id` + global query filter (ADR-0011) sigue vigente como base técnica, **pero no es el eje de negocio**.
- La entidad expone `SucursalId` (convive con `EmpresaId`, no lo reemplaza).
- **Dos perfiles, mismo mecanismo, sin tablas ni roles nuevos:**
  - Operativo: filas `UsuarioSucursal` activas **sin** el permiso de bypass => ve solo esas sucursales.
  - Corporativo (admin/contador a nivel Millet): tiene el permiso de bypass del recurso => ve todas, sin fila `UsuarioSucursal` por sucursal.
- `UsuarioEmpresaRol` no cambia (un rol por usuario en la empresa = capacidad); `UsuarioSucursal` + guard = alcance de datos. **No** `UsuarioSucursalRol`, **no** `EmpleadoSucursal` N:M; `Empleado.SucursalId` es 1:1 (dato de RH).
- No crear tablas ni roles por sucursal (se revisa con grep en las migraciones del diff).

## Piezas existentes (reusar, no reinventar)
| Pieza | Ruta |
|---|---|
| `SucursalScopeGuard.VerificarAsync` + `SucursalScopeGuardPermisos` | `backend/src/Compartido/Application/Administracion/Abstractions/SucursalScopeGuard.cs` |
| `IUsuarioSucursalReadPort` (`EstaAsociadoAsync`, `ListarIdsAsync`, `EsCorporativoAsync`) | `.../Abstractions/IUsuarioSucursalReadPort.cs` |
| `ISucursalScopedQuery` (`PermisoTodasSucursales`, `SucursalesPermitidas`) | `backend/src/SharedKernel/Application/ISucursalScopedQuery.cs` |
| Pipeline que rellena `SucursalesPermitidas` para queries de lista | `backend/src/Api/Web/SucursalScopeQueryBehavior.cs` |
| Documentos por tipo (`IDocumentoScopedQuery`, `DocumentoSucursalScope`) | `backend/src/Api/Web/DocumentoSucursalScope.cs` |
| Guards por id de documento padre (ejemplos) | `Api/Endpoints/Compras/RqSucursalScope.cs`, `Api/Endpoints/Compras/Oc/OcSucursalScope.cs` |
| Exemplares F1-ADM-01 | `SucursalDepartamento`, `SucursalPuesto`, `UsuarioSucursal` |

Contrato del guard: si el usuario tiene el permiso admin pasa; si no, debe estar asociado a la sucursal; si no => `ForbiddenException` => **403 `SUCURSAL_NO_ASOCIADA`**. Para documentos sin sucursal verificable => 403 `SUCURSAL_NO_DETERMINADA`.

## Aplicar en un endpoint por id (lectura/escritura de un documento)
1. La sucursal se **deriva del documento en BD** (`db.X.Where(id).Select(x => x.SucursalId)`), **nunca de un parámetro del cliente**. Inexistente => 404.
2. Llamar `SucursalScopeGuard.VerificarAsync(currentUser.UserId, <permiso bypass>, permisos, (uid, ct) => usuarioSucursales.EstaAsociadoAsync(uid, sucursalId, ct), ct)`.
3. Granularidad por operación (ADR-0041): lectura usa `...leer-todas-sucursales`; escritura `...gestionar-todas-sucursales` (así lo hacen `RqSucursalScope`/`OcSucursalScope` con `escritura: true`). Un GET no hereda un permiso de gestión.
4. Aplicar el guard a **todos** los endpoints del recurso, también adjuntos, histórico, acciones de workflow y reportes.

## Aplicar en una query de lista
1. El query record implementa `ISucursalScopedQuery` (`PermisoTodasSucursales` = permiso de bypass de lectura; `SucursalesPermitidas` la rellena el behavior: `null` = todas, lista = solo esas).
2. El handler aplica la lista como filtro de sucursal (`null` = sin filtro). Ejemplo real: `Almacen/Application/Saldos/SaldoQueries.cs` pasa `request.SucursalesPermitidas` al acceso a datos (líneas ~73 y ~169). La forma exacta del `Where` es inferida: copiar la del módulo.
3. Si el usuario elige una sucursal, el behavior valida con el guard y reduce la lista a `[sucursal]` (selección por `ISucursalSeleccionadaQuery` o header `X-Inicio-Sucursal-Id`; GUID inválido => 400).
4. Documentos de otros módulos: tipo registrado en `DocumentoSucursalScope.Puerto(tipo)` + puerto `I*SucursalReadPort` del módulo dueño (no consultar su tabla).

## Permiso de bypass
- Nombre: `{modulo}.{recurso}.leer-todas-sucursales` / `.gestionar-todas-sucursales` (ej. `compras.requisiciones.leer-todas-sucursales`, `almacen.reportes.leer-todas-sucursales`).
- Declararlo en `backend/src/Identidad/Domain/PermisosCanonicos.cs`, sembrarlo, y espejarlo en `frontend/src/lib/auth/permission-codes.ts`.
- `SucursalScopeGuardPermisos` duplica literales (Compartido no referencia Identidad): mantener en sync; los tests de integración cruzan ambos.
- **El scoping NO es automático** (a diferencia del filtro `IPerteneceAEmpresa`): si olvidas declarar el permiso o llamar al guard, queda abierto. Riesgo de omisión => checklist.

## UI
- Selector de sucursal en el topbar (`frontend/src/components/auth/SucursalSelector.tsx`; botón `MapPin`, texto "Millet" + sucursal; `design-system/DESIGN.md` §3.3). Listas dependientes: selector hijo con prop `sucursalId: string | null`, `disabled` + hint "Selecciona primero una sucursal" cuando es null, y reset del hijo al cambiar el padre (`frontend/docs/patrones-compras.md` §6.8).
- El gating de UI por permiso (`useHasPermission`) es solo UX; la barrera real es el backend.
- Mostrar al usuario qué sucursal está viendo; estado vacío con texto, no tabla vacía.

## Checklist
- [ ] Entidad con `SucursalId`; sin tablas/roles por sucursal nuevos.
- [ ] Permiso de bypass declarado (leer y/o gestionar) + mirror FE.
- [ ] `SucursalScopeGuard` en cada endpoint de lectura/escritura del recurso; sucursal derivada de BD.
- [ ] Listas filtradas por `SucursalesPermitidas`.
- [ ] Prueba: usuario de sucursal A **no** ve ni modifica datos de B (UI **y** llamada directa al endpoint => 403/404).
- [ ] Prueba del bypass: con y sin el permiso.
- [ ] Flujos hermanos (crear/editar/listar/mostrar/eliminar/adjuntos/reportes) alineados.

## Contradicciones en los docs
- `CLAUDE.md` y ADR-0051 hablan de una sola empresa; ADR-0049 y las pruebas de aceptación de Entra siguen describiendo usuarios con varias empresas y `cambiar-empresa`. Es la base técnica ADR-0011 todavía activa; no quitar `EmpresaId`.
- ADR-0051 pide permisos `.gestionar-todas-sucursales`/`.leer-todas-sucursales`, pero `SucursalScopeGuardPermisos` aún mezcla permisos `admin.sucursales.*-gestionar` para Departamentos/Puestos/Usuarios. Seguir el patrón del recurso vecino.
