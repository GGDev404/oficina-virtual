---
name: millet-modular-monolith
description: Usar al crear o modificar backend del Millet ERP (.NET 10, backend/src): agregar command, query, endpoint, evento, puerto I*ReadPort, DbContext/migración o stub NoOp con PLATFORM-TODO. Cubre fronteras de módulo, hexagonal + CQRS con MediatR, un esquema por módulo, Outbox y checklist.
---

# Millet ERP: monolito modular (hexagonal + CQRS)

Fuente: `CLAUDE.md` (Decisiones arquitectónicas, Convenciones C#, Deuda de plataforma), ADR-0005, 0009, 0030, 0031 en `docs/decisiones/`.
Las invariantes de una línea viven también en `CLAUDE.md`; esta skill es el detalle.

## Invariantes (no negociables)
- Un esquema PostgreSQL por módulo; **nadie escribe en el esquema de otro** (ni lee sus tablas con DbContext ajeno).
- Entre módulos solo: (a) eventos por Outbox + Service Bus, o (b) puertos `I*ReadPort`.
- Hexagonal dentro del módulo (Domain / Application / Infrastructure) + CQRS con MediatR (command/query/handler).
- C#: Nullable activo; `async/await` (nunca `.Result`/`.Wait()`); DTOs como `record`; clases `sealed`; **FluentValidation** (no Data Annotations); **Mapster** (no AutoMapper); **Serilog**.
- Fechas: `IClock.UtcNow`; `DateTime.Now/UtcNow` y `DateTimeOffset.Now` están prohibidos (`backend/BannedSymbols.txt`, ADR-0013).
- Sin repositorios genéricos: el handler usa el `DbContext` de su módulo (ver `CancelarOrdenCompraHandler`).
- Idioma: docs y nombres de módulo en español; código y comandos en inglés (identificadores de dominio ya existentes están en español, p. ej. `OrdenCompra`; seguir el existente).

## Dónde va cada cosa (paths reales, ejemplo Compras)
| Pieza | Ruta |
|---|---|
| Command/Query + Handler + Validator | `backend/src/<Modulo>/Application/<Caso>/` (ej. `Compras/Application/Oc/Cancelar/CancelarOrdenCompraCommand.cs`, `...Handler.cs`, `...Validator.cs`) |
| Agregados, eventos de dominio | `backend/src/<Modulo>/Domain/` (ej. `Compras/Domain/Oc/Events/OrdenCompraAutorizadaEvent.cs`) |
| Puertos de lectura | `Domain/Ports/` o `Application/PublicPorts/` (el repo usa ambos: copiar el del módulo) |
| DbContext, configuraciones EF, migraciones | `<Modulo>/Infrastructure/` (`ComprasDbContext.cs`, `Configurations/`, `Migrations/`) |
| Adaptadores que implementan puertos de OTRO módulo | `<Modulo>/Infrastructure/PublicAdapters/` |
| Workers (Outbox, listeners Service Bus) | `<Modulo>/Infrastructure/Workers/` |
| Endpoints HTTP (Minimal API) | `backend/src/Api/Endpoints/<Modulo>/` |
| Permisos canónicos | `backend/src/Identidad/Domain/PermisosCanonicos.cs` (+ mirror FE `frontend/src/lib/auth/permission-codes.ts`) |
| Outbox transversal | `backend/src/SharedKernel/Infrastructure/Outbox/` y `.../Persistence/Interceptors/OutboxSaveChangesInterceptor.cs` |
| Tests | `backend/tests/<Modulo>.UnitTests/`, `Api.IntegrationTests/`, `Compras.IntegrationTests/` |
| Contextos para migraciones/validación | `tools/migration-contexts.txt` |

## Agregar un command (receta)
1. `record <Verbo><Agregado>Command(...) : IRequest` + `<...>Validator : AbstractValidator<...>` con `WithErrorCode("CODIGO_EN_MAYUSCULAS")`.
2. Handler `sealed`: valida usuario (`ICurrentUserContext`), carga agregado (`EntityNotFoundException`), reglas con `BusinessRuleException(code, msg)`, ejecuta método del agregado, publica evento con `IPublisher.Publish(...)`, **un solo** `SaveChangesAsync`.
3. Estado y evento van en la misma transacción: el `OutboxSaveChangesInterceptor` inserta la fila en `integration_events_outbox` del DbContext que guarda (ADR-0009). No publicar a Service Bus directo.
4. Endpoint en `Api/Endpoints/<Modulo>/...Endpoints.cs`: `.RequireAuthorization(PermissionPolicyProvider.Prefix + PermisosCanonicos.X)`, `.WithName/.WithTags/.WithSummary/.Produces/.ProducesProblem(401/403)`.
5. Mutaciones HTTP: `Idempotency-Key` (ADR-0020); concurrencia con ETag/`If-Match` (ADR-0012); errores Problem Details (ADR-0010); ruta `/api/v1/<modulo>/...` (ADR-0021).
6. Permiso nuevo: declararlo en `PermisosCanonicos`, sembrarlo y reflejarlo en `permission-codes.ts`; granularidad por operación (ADR-0041: un GET no hereda un permiso de gestión).
7. Si la entidad es por sucursal, aplicar la skill `millet-sucursales`.

## Agregar una query / endpoint de lectura
- Query `record : IRequest<T>`; handler con `AsNoTracking()`; DTO `record` (no la entidad).
- Filtro por sucursal: `ISucursalScopedQuery` o `*SucursalScope.VerificarAsync` (skill `millet-sucursales`).
- Búsqueda textual sin extensiones PG (ADR-0045).

## Eventos e integración entre módulos
- Nombre canónico `{Agregado}{Verbo}Event` (CLAUDE.md). Wire name en el bus: `modulo.entidad.accion.v1` (ej. `cuentas_por_pagar.factura.registrada.v1`, visto en `Almacen/Application/EventListeners/FacturaProveedorRegistradaHandler.cs`).
- Consumidor idempotente: Service Bus es at-least-once. Patrón existente: tabla `<esquema>.eventos_procesados` (`Almacen/Domain/Idempotencia/EventoProcesado.cs`), INSERT en la misma TX que el efecto.
- Un puerto `I*ReadPort` se implementa en el módulo dueño del dato (`PublicAdapters/`) y se consume en el otro; nunca un `ProjectReference` que cree ciclo (Compartido no referencia Identidad/Facturación; por eso `SucursalScopeGuardPermisos` duplica literales de permisos).
- Workers de fondo: `IHostedService` dentro de `Millet.Api` (no Azure Functions). Deben poder apagarse por flag (ver skill `millet-qa`).
- DTOs enriquecidos con nombres de otro módulo: ADR-0042.

## Stubs NoOp y PLATFORM-TODO (ADR-0031)
Cuando falta infraestructura compartida, usar `NoOp`/stub con:
```csharp
// PLATFORM-TODO(<identificador>): reemplazar por <X> cuando <Y> esté disponible. Ver ADR-NNNN.
```
- `<identificador>` = ID de ticket o nombre descriptivo entre `<>` consistente con la tabla del doc.
- Fila en la sección **"Dependencias de plataforma pendientes"** de `docs/modulos/<modulo>/01-diseno.md` (Pieza · Ticket · NoOp en uso · Cómo se wirea).
- Al cerrar la deuda: reemplazar el NoOp, borrar el comentario y la fila.
- Auditar: `rg "PLATFORM-TODO" backend/src`.

## Migraciones
- Un DbContext por módulo (ADR-0030, ver Contradicciones). Migración: `dotnet ef migrations add <Nombre> --context <Modulo>DbContext` (patrón de ADR-0030; ajustar proyecto con `--project`).
- Nunca aplicar migraciones a la BD de dev compartida ni dejar que el backend lo haga al arrancar sin permiso del owner.
- Antes de actualizar una BD con datos: respaldo y prueba en copia (`backend/README.md`).

## Checklist antes de cerrar
- [ ] Ningún INSERT/UPDATE/DELETE ni DbContext cruzado a otro esquema (`rg` sobre el diff).
- [ ] Evento nuevo: nombre `{Agregado}{Verbo}Event`, emitido vía Outbox, consumidor idempotente.
- [ ] Validación server-side por cada campo editable (el servidor rechaza lo que el cliente dejó pasar).
- [ ] Permiso canónico + mirror frontend + `RequireAuthorization`.
- [ ] Sucursal: `SucursalId` + guard + permiso bypass si aplica.
- [ ] Flujos hermanos de la misma entidad alineados (crear/editar/listar/mostrar/eliminar; backend, frontend, validaciones, tests). Si alguno se omite a propósito, decirlo en el reporte.
- [ ] Todo NoOp con `PLATFORM-TODO` y fila en el doc.
- [ ] Tests: unit del dominio/handler + integración si toca EF/Outbox (skill `millet-qa`).
- [ ] No commit sin permiso explícito del owner; ramas `feature/ fix/ chore/ docs/`, nunca en `main`.

## Contradicciones en los docs (marcadas, no resueltas)
- ADR-0030 figura "Pendiente de ratificación" pero `CLAUDE.md` y el código ya lo tratan como regla (un DbContext por módulo).
- ADR-0009 ubica eventos en `Application/IntegrationEvents/` y nombra `{Sustantivo}{Verbo}Event`; el código los pone en `Domain/.../Events` o `Domain/Ports/...` y `CLAUDE.md` fija `{Agregado}{Verbo}Event`. Seguir `CLAUDE.md` + el módulo vecino.
- ADR-0005 dice esquemas en kebab-case plural; los reales son snake_case (`integraciones_aw`, `cuentas_por_pagar`).
- ADR-0036 menciona .NET 8; `backend/README.md` indica .NET 10 (`global.json`).
