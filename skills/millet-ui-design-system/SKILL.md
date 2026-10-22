---
name: millet-ui-design-system
description: Usar al crear o modificar pantallas, componentes o estilos del frontend del Millet ERP (frontend/, Tailwind 4 + shadcn/ui): tokens, tipografía Plex 13px, Badge de estados, tablas, sheet, master-detail, inline forms, accesibilidad y prácticas prohibidas (hex sueltos, paleta default de Tailwind).
---

# Millet ERP: design system y patrones de UI

Leer **completo** antes de crear/modificar UI: `design-system/DESIGN.md`, luego `design-system/FIGMA.md` y `design-system/README.md`; seguir `frontend/AGENTS.md`. Patrones exemplar: `frontend/docs/patrones-compras.md`. Esta skill es un resumen operativo; si difiere de DESIGN.md, manda DESIGN.md (y el canvas Figma manda sobre ambos). La guía visual no cambia permisos, reglas de negocio ni estados reales del backend.

## Stack y archivos
- Vite + React 19 + TanStack Router/Query + RHF + Zod + shadcn/ui (Radix) + `lucide-react` + Tailwind **4**.
- Tokens: `design-system/tokens.json` (valores), `tokens.css` (variables), expuestos en `frontend/src/index.css` vía `@theme inline`. **La config efectiva es `index.css`**; `design-system/tailwind.config.ts` es solo referencia: no copiarlo al proyecto ni instalar `tailwindcss-animate` (ya existe `tw-animate-css`).
- Componentes: reutilizar `frontend/src/components/ui/` (shadcn con variantes Millet) y `frontend/src/components/erp/` (índice `components/erp/index.ts`: `PageHeader`, `MasterDetail`, `Breadcrumbs`, `PaginacionTabla`, `MoneyField`, selectores, `ReporteShell`...). Crear uno nuevo solo si no existe.

## Reglas duras
- Solo tokens: `bg-surface-page|card|subtle|muted|selected`, `text-ink|ink-secondary|ink-strong|ink-muted|ink-subtle`, `border-line|line-control|line-divider|line-row`, `bg-brand`/`brand-hover`, estados `bg-{success|warning|danger|info|neutral}-bg text-{...}-fg`. Prohibido hex suelto y paleta default (`blue-600`, `gray-500`, `slate-*`, `amber-*`). Falta un token => proponerlo en DESIGN.md + tokens antes de usarlo.
- Fuente **IBM Plex Sans**; **IBM Plex Mono** para folios, UUID, RFC, atajos. Nunca Inter/Roboto/Arial.
- Cuerpo **`text-sm` = 13px**; escala `text-2xs 11 / xs 12 / sm 13 / md 14 / lg 15 / xl 16 / 2xl 18 / 3xl 22 / 4xl 24`; pesos solo 400/500/600 (nunca 700).
- Montos: `tabular-nums`, alineados a la derecha, `$412,875.40` (KPI resumido `$642.9 k`, `$1.24 M`). Fechas lista `21 sep`, completa `21 sep 2026`, form `29/09/2026`. Porcentaje `82 %`.
- Tarjetas: `rounded-lg shadow-card` o `shadow-card-flat` (ring de 1px, no `border`). Sombras permitidas: card, card-flat, dialog, sheet.
- Radios: 4 kbd, 6 controles chicos, 8 controles 32-36, 10 tarjetas/tablas, 12 paneles de Inicio, 14 diálogos, full badges.
- Espaciado base 4px. Íconos `lucide-react` `strokeWidth={1.6}` (rail 2), de trazo, tamaños 20/18/16/14.
- Español de México, sentence case ("Registrar factura"), verbos específicos en infinitivo; nunca "Aceptar/OK/Enviar" genéricos; sin lorem ipsum: placeholders `[MAYÚSCULAS]`.
- Ancho: aprovechar el ancho disponible (el shell ya da el margen). **No** topar detalles ni tablas con `max-w-*` angostos (`max-w-3xl`...); los topes valen solo para texto corrido, sheets y diálogos (regla del owner, 19-oct-2026, `frontend/AGENTS.md`).

## Prohibido
Gradientes (salvo corte duro de barras de avance), glassmorphism, sombras grandes, bordes laterales de color en tarjetas (única excepción: selección de la lista maestra, 3px azul), emoji, ilustraciones, logo en el rail, rojo/verde como único diferenciador, `onClick` en `div`, datos inventados, quitar el outline de foco, colores "parecidos" a uno existente.

## Estados: Badge
`Badge` (`components/ui/badge.tsx`) variantes: `success | warning | danger | info | neutral` (+ alias `default`=info, `secondary`=neutral, `destructive`=danger, `outline`). Un estado = un color en todo el ERP, con texto visible y el **nombre exacto** (DESIGN.md §7.2):
| Entidad | Flujo |
|---|---|
| Factura proveedor | Capturada(neutral) -> Por conciliar(warning) -> Por autorizar(info) -> Autorizada(success) · Rechazada(danger) |
| Orden de compra | Por autorizar(warning) -> Autorizada(info) -> Cerrada(success) · Cancelada(neutral) |
| Recepción | Parcial(info) -> Factura pendiente(warning) -> Registrada(success) · Con diferencia(danger) |
| Pago | Por programar(warning) -> Programado(info) -> Layout enviado(info) -> Pagado(success) · Rechazado por banco(danger, inferido) |
| Centro de costo | En rango(success) · Cerca del límite >=90 %(warning) · Excedido >100 %(danger) |
Compras usa `EstadoBadge` (`components/erp/display/EstadoBadge.tsx`) con sus labels y glosarios; Compras-OC además muestra sub-estados Recepción/Facturación/Pago en 3 barras de 6px (info -> success al 100 %).

## Layout y plantillas (DESIGN.md §3 y §5)
- App Shell: rail oscuro 76px (sin logo, Admin al fondo) + panel de módulo 240px (opcional) + topbar 56px + contenido `p-[20px_24px]`. Referencia 1440x900, mínimo 1280.
- Plantillas: Listado (§5.1: H1 + descripción + KPIs `grid-cols-4` + tarjeta de tabla con tabs/filtros/10 filas/footer), Detalle (§5.2), Inicio (§5.3), overlay (§5.4), móvil (§5.5, objetivos táctiles >= 44px, solo consulta/aprobación).
- Botones: una acción primaria por zona; `secondary`, `ghost`, `icon` (con `aria-label`), `sm`; en formularios/sheets `size="lg"` (36px). **Botón deshabilitado siempre explica el motivo** (tooltip o texto cercano).
- Inputs: `<Label htmlFor>` visible arriba, `h-ctl-xl`; opcional con "(opcional)". Formularios en sheet en `<fieldset>` numerados, grid de 2 columnas.

## Patrones exemplar de Compras (`frontend/docs/patrones-compras.md`)
- **Master-detail**: lista compacta sticky de 320px + detalle; la lista no se desmonta al cambiar de item (conserva scroll y filtros); móvil = drill-down. Rutas `/<modulo>/<recurso>` (bandeja tabular) y `/<modulo>/<recurso>/$id` (master-detail). Construir tabular **y** master-detail en el mismo PR (§6.6). Layouts `RequisicionesLayout`, `OrdenesCompraLayout`; `components/erp/MasterDetail.tsx`.
- **Sheet** (slide-from-right) para "Nueva ...": provider a nivel shell + `useNuevaXxx().abrir()`; el form reporta `isDirty` y se confirma al cerrar; success cierra con `onClose({ force: true })`; acción en `QuickCreateMenu` gateada por `<modulo>.<recurso>.crear`. Componente `components/ui/sheet.tsx` (ancho: ver Contradicciones).
- **Inline forms** (sin modal) para editar/agregar items de un master: agregar = borde dashed de marca; editar = borde de advertencia (`LineaInlineForm`). 5 campos críticos visibles + "+Detalles".
- Topbar global: search contextual por ruta (`SEARCHABLE_ROUTES` en `Topbar.tsx`, debounce 200ms, param `q` con `replace`), Quick Create, ayuda `/<modulo>/ayuda`.
- Sub-topbar sticky del detalle y aside master con `data-print="hidden"` (impresión limpia con CSS print en `index.css`).
- Selectores dependientes: prop `<padre>Id: string | null`, `disabled` + hint, reset del hijo al cambiar el padre (§6.8).
- Mutaciones: `Idempotency-Key` (`useFormIdempotencyKey`), `If-Match`/ETag, 422 => `applyServerErrors(form, error)`, 409 `CONCURRENCY_CONFLICT` => `useConflictDialog()`, otros => `toast.error(title, {description: 'Código: '+traceId})`.
- Permisos: `useHasPermission(canonical)` (solo UX); matriz de acciones en `lib/acciones-disponibles.ts` con `{visible, habilitada, motivoDeshabilitada}`; códigos en `lib/auth/permission-codes.ts`, nunca literales sueltos.
- Search params de bandejas con Zod (`lib/*-search-schema.ts`), query keys `['<modulo>','<recurso>',...]`, nav en `lib/nav.ts` (ADR-0032).

## Accesibilidad (no se simplifica)
Contraste >= 4.5:1 (no usar textos más claros que `ink-subtle` para información); estado nunca solo por color; `aria-current="page"`, `aria-selected` en tabs, `role="dialog"` + `aria-label` en ⌘K y sheet; foco visible (outline 2px `--mt-primary`, offset 2px); botón de ícono con `aria-label` (`Acciones de {folio}`); labels asociados; navegación por teclado (⌘K, atajos `G`/`N`). Test: `axe-core` con `wcag21aa` en al menos una pantalla por release.

## Checklist antes de entregar (DESIGN.md §9 + AGENTS.md)
- [ ] Dentro del shell, rail/panel/breadcrumb correctos; usa plantilla §5.
- [ ] `grep -nE '#[0-9a-fA-F]{3,8}\b'` sobre los archivos tocados = 0; sin clases de la paleta default.
- [ ] Plex 13px; folios/UUID/RFC en mono; montos tabulares a la derecha.
- [ ] Badges con texto exacto de §7.2; una acción primaria por zona; deshabilitados con motivo.
- [ ] Tabla de 10 filas, estirada al alto; estados loading/empty/error/data.
- [ ] `npm run build` (tsc -b + vite build), `npm run lint`, `npm test` de lo afectado, y la pantalla vista en navegador. Preserva impresión, teclado, formularios, navegación y controles de acceso.
- [ ] Migración parcial: listar lo pendiente explícitamente.

## Contradicciones en los docs (no resueltas)
- `DESIGN.md` §10 manda copiar `tailwind.config.ts`; `frontend/AGENTS.md` y `design-system/README.md` dicen que NO (Tailwind 4 usa `@theme inline`). Manda AGENTS/README.
- Sheet: `DESIGN.md` §4.8 = 560px; `patrones-compras.md` §6.2 = `max-w-3xl`. Verificar `components/ui/sheet.tsx` y el sheet vecino antes de fijar ancho.
- Inline form: `patrones-compras.md` §6.3 cita `border-primary/40`, `border-amber-400`, `bg-amber-50/40` (paleta default), contra la regla de tokens. En código nuevo usar tokens de estado (`warning-*`, `brand-soft`).
- Breadcrumbs: `DESIGN.md` §3.3 los pone en el topbar; `patrones-compras.md` §6.7 dice que bandejas y placeholders no los renderizan. `FIGMA.md` indica que el breadcrumb ya está adaptado; seguir el módulo vecino.
- Modo oscuro: sin paleta aprobada (README); no declararlo migrado.
