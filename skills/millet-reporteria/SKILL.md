---
name: millet-reporteria
description: Usar al agregar o modificar un reporte operativo del Millet ERP (ADR-0036): endpoint JSON GET /api/v1/<modulo>/reportes/<nombre>, ReporteShell, exportación PDF (@react-pdf/renderer) y Excel (exceljs), impresión CSS y permisos <modulo>.reportes.<nombre>. No es BI analítico.
---

# Reportería operativa (ADR-0036)

Fuentes: `docs/decisiones/0036-estrategia-de-reporteria.md`, `CLAUDE.md` (sección Reportería), `.claude/project-test-rules.md` (sección Reportería), código existente de Almacén/CxP.

## Decisión
- **Motor nativo**: endpoint JSON + componente React + exportación client-side. **No** Crystal, SSRS, JsReport/Carbone ni QuestPDF como motor (QuestPDF solo para PDFs no-reporte puntuales: acuses, comprobantes).
- La **plantilla es código React** versionado en git (no archivos binarios).
- Alcance: reportes operativos hasta ~5k filas con virtualización. Cubos / >50k filas / dashboards = módulo 10 Reportes y BI (posterior, Power BI Embedded u otro). No mezclar.

## Backend (datos, sin presentación)
- Ruta `GET /api/v1/<modulo>/reportes/<nombre>` (ej. `/api/v1/almacen/reportes/alfak-historial-almacen`, `/mp-cnk`). Endpoints existentes: `Api/Endpoints/{Almacen/Reportes,CuentasPorPagar,Facturacion,Tesoreria}/ReportesEndpoints.cs`.
- Respuesta estructurada (`Almacen/Application/Reportes/ReporteShape.cs`):
  `ReporteResponse<TFila>(Titulo, GeneradoEn, FiltrosAplicados, Columnas[ColumnaDescriptor(Clave, Etiqueta, Tipo "texto|numero|moneda|fecha", Alineacion?, AnchoPx?)], Filas, Totales?)`.
- Permiso canónico `<modulo>.reportes.<nombre>` en `PermisosCanonicos` (ej. `almacen.reportes.alfak`, `almacen.reportes.mp-cnk`; `compras.ordenes.reportes-partidas-abiertas`), sembrado y espejado en `frontend/src/lib/auth/permission-codes.ts`.
- Datos por sucursal: query con `ISucursalScopedQuery` y permiso `<modulo>.reportes.leer-todas-sucursales` (ver skill `millet-sucursales`).
- Vista previa limitada (100 filas) y versión completa (paginada/stream) según ADR; la exportación usa el reporte completo.

## Frontend
- Componente `frontend/src/components/erp/reportes/ReporteShell.tsx` (también exportado en `components/erp/index.ts`). Props clave: `reporte`, `isLoading`, `error`, `onRetry`, `filtrosUi` (inyecta selectores), `nombreArchivo`, `accionFila`, `filasVisibles`. PDF y Excel se cargan lazy con `import()`.
- Exportadores: `components/erp/reportes/exporters/reporte-pdf-exporter.tsx` (`ReporteDocument.tsx`, `@react-pdf/renderer`) y `reporte-excel-exporter.ts` (`exceljs`, celdas tipificadas, no CSV).
- Páginas ejemplo: `features/almacen/pages/ReporteAlfakPage.tsx`, `ReporteMpCnkPage.tsx`, `features/cxp/api/useReportes.ts`, `features/cxc/lib/reporte-cxc-adapter.ts`.
- Impresión: CSS `@media print` en `frontend/src/index.css` + `data-print="hidden"` en filtros, acciones y asides (oculta shell, sidebar y toasts; A4 con margen 1.5 cm).
- UI según `millet-ui-design-system` (tokens, tabular-nums, formato de moneda/fecha).

## Receta para un reporte nuevo
1. Query + handler en `<Modulo>/Application/Reportes/` devolviendo `ReporteResponse<TFila>`.
2. Endpoint `GET .../reportes/<nombre>` con `RequireAuthorization` del permiso del reporte + filtros por query string validados (FluentValidation).
3. Permiso canónico + seed + mirror FE.
4. Hook de TanStack Query en `features/<modulo>/api/` y página con `<ReporteShell>`; registrar la card en `lib/nav.ts`.
5. Tests: handler (xUnit), hook/página (Vitest + MSW), exportación.

## Checklist de verificación
- [ ] Usa `<ReporteShell>` (sin renderers propios de PDF/Excel).
- [ ] PDF y Excel **se descargan y se valida su contenido** (no basta con que exista el botón).
- [ ] Vista de impresión limpia (`data-print="hidden"`).
- [ ] Permiso `<modulo>.reportes.<nombre>` y rechazo 403 sin él (UI y endpoint directo).
- [ ] Alcance por sucursal probado con y sin bypass.

## Contradicciones en los docs
- ADR-0036 y `CLAUDE.md` ubican los reportes en `frontend/src/components/reportes/<modulo>/`; el código real vive en `frontend/src/components/erp/reportes/` (shell, exporters) y las páginas en `features/<modulo>/pages/`. Seguir el código.
- ADR-0036 define columnas `{key, label, tipo, alineacion}`; el código usa `{clave, etiqueta, tipo, alineacion, anchoPx}` (español).
- `ReporteResponse<TFila>` está definido dentro de Almacén (`Millet.Almacen.Application.Reportes`), no en SharedKernel, aunque el comentario dice que CxP/Compras comparten la convención. Verificar si el módulo vecino lo duplica antes de crear otro.
- ADR-0036 y ADR-0025 piden alinear PDFs: `@react-pdf/renderer` para reportes, QuestPDF opcional para no-reporte; ADR-0025 aún no refleja el cambio (según el propio ADR-0036).
