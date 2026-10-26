# Planos · requerimientos y plan (2026-10-26)

Ventana «Planos» de la oficina: tablero de mis 7 módulos y detalle por módulo (hecho, falta, necesita, dudas, % y calendario al 15-dic), alimentada por la bóveda Millet-ERP. ClickUp solo complementa.

## Fuentes (raíz `/home/devgeo/Obsidian/Millet-ERP/`)

| Dato | Fuente principal | Complemento |
|---|---|---|
| Hecho | `14 Estado por módulo/<Módulo> · estado y brechas <fecha>.md` §2 «Qué ya tenemos» (filas Construido) | expedientes `12 …` con `estado: terminada`; `brechas-abiertas.md` filas `cerrada` |
| Falta | misma nota §3 «Qué falta» (marca «SIN TAREA», Tamaño) | `brechas-abiertas.md` `abierta`/`en curso`; vencimiento y estado de la tarea en ClickUp |
| Necesita · decisiones | `00 · Panorama…` tabla «Decisiones que tengo que pedir»; `04 Decisiones/D*.md` por `Afecta:`; preguntas con `Bloquea = sí` | |
| Necesita · insumos | `00 · Panorama…` viñetas «Insumos que faltan» | `05 …/INS-*.md` (hoy sin módulo) |
| Necesita · dependencias | `02 …/Planos 1.7.1/NN · <Módulo>.md` §11 y `00 · Mapa de conexiones…` | |
| Dudas | `preguntas.md` (no respondida ni descartada), ligadas por `Tarea` → módulo | |
| Calendario | `14 …/01 · Plan de entrega al 15-dic.md` | |
| Para saber más | enlaces a `06`, `07`, `08`, `10`, `docs/modulos/<modulo>` del repo, por nombre o wikilink | |

- Nota de estado vigente: `tipo: estado-modulo` + `modulo` + la `fecha` más nueva, no el nombre de archivo.
- Clave de módulo: `frontmatter.modulo` normalizado (`MOD-ALM` = `ALM`), luego wikilink `[[MOD-ALM]]`, luego ID de tarea `86e3…`. Sin adivinar por palabras.

## % de cumplimiento

Pondera por el tamaño de la brecha (decisión 2). Cada ficha de §2 vale su peso: S = 1, M = 2, L = 3 (sin tamaño = M). Parcial resta el peso de sus brechas abiertas de §3 ligadas a la ficha; si no se puede ligar, Parcial vale la mitad del peso de la ficha. `% = Σ peso hecho / Σ peso total`. «Solo en rama local» cuenta como Parcial.
- Base: el plano funcional (lo que Millet acepta). No ClickUp: 47 brechas sin tarea, cerrada ≠ función completa y hoy la sincronía no trae cerradas.
- Barras aparte, informativas: «Aceptado» (casos §14 con Millet, hoy 0) y tareas ClickUp abiertas con vencimiento antes del 11-dic.

## Arquitectura

- `server/boveda.js`: `indice(raiz)` → `{ruta, titulo, frontmatter, mtime, enlaces[]}` con caché por `mtimeMs` (1163 notas, ~50 ms el primer barrido). Excluye `.obsidian`, `_respaldos*`, `videos-flujos`, `evidencias`, `Datos y scripts`. Sin `fs.watch` en el MVP.
- `server/planos.js`: parseo de §2/§3/§4 y líneas de conteo; cruce con `leerBandeja` (`server/bandeja.js`) y la tabla `tareas`. Si una nota no trae el formato esperado, el módulo dice «nota sin formato esperado» y no truena.
- Rutas en `server/index.js`: `GET /api/planos`, `GET /api/planos/:id`, `GET /api/boveda/nota?ruta=`. Esta última valida `realpath` dentro de la raíz y extensión `.md`.
- No se lee la bóveda dentro de `estadoCompleto` (viaja por SSE en cada evento).
- Web: `web/src/vistas/planos.tsx` (tablero + detalle con `Pestanas`), `tipo: 'planos'` en `App.tsx`, botón en la barra, `abrirPlanos` en `contexto.ts`. Reusa `Ventana`, `Chip`, `.pz-linea` y las variables de tono, así que respeta los temas. El semáforo siempre lleva texto o icono, nunca solo color.
- Abrir nota: enlace `obsidian://open?vault=Millet-ERP&file=<ruta>`; la vista previa interna con `lib/markdown.tsx` queda para la fase 2.

## Pantallas

```
+- PLANOS · entrega 15-dic (faltan 50 días) ----------------+
| [Compras 58%] [Almacén 60%] [CxP 55%] [Tesorería 45%]     |
|  ▓▓▓▓▓░░░ ● naranja   7 sin tarea   ? 3 bloquean          |
| [Maestros 66%] [MP 30%] [PT 16%]                          |
+-----------------------------------------------------------+

+- Compras 58% · ● naranja · nota 25-oct [Abrir en Obsidian]+
| oct27 ── nov10 ──■cierre nov14── nov24 ── dic11 ─|15-dic   |
| BLOQUEOS: P-002 Eliam · #7 OC→A+W SIN TAREA               |
| HECHO (7) | FALTA (15) | NECESITA        | DUDAS (6)       |
| ✓ COM-03  | ! #7 A+W M | Decisión: D03   | P-002 por enviar|
|           |            | Insumo · Depende| Para saber más… |
+-----------------------------------------------------------+
```

## Fases

1. `server/boveda.js` + `test/boveda.test.js` (dir temporal, 3 notas: frontmatter, exclusión, relectura por mtime).
2. `server/planos.js` + `test/planos.test.js` (fixture recortado de la nota real de Compras: `pct`, `sinTarea`).
3. Rutas en `index.js` + `OFICINA_BOVEDA` en `.env.example`. Va después del commit de la bandeja (choca con el diff staged de `index.js`).
4. `planos.tsx` + registro en `App.tsx`/`contexto.ts` + estilos. Verificar con `npm run build` y a mano en los temas.

MVP fases 1 a 4: ~350 líneas, 1 a 1.5 días.
Fase 2: `fs.watch` + aviso SSE, vista previa con wikilinks, tareas cerradas y tags de ClickUp, histórico del % por fecha de nota.

## Convenciones en la bóveda (para que no se adivine)

1. `modulo: MOD-XXX` en todas las notas; la de Maestros hoy solo tiene `area: transversal`.
2. Estado de §2 solo `Construido` / `Parcial` / `No construido`; el matiz va en Nota. Hoy hay ~20 variantes: el parser las normaliza por prefijo.
3. Columna `Módulo` en `preguntas.md` y `brechas-abiertas.md`.
4. `modulos: [..]` y `estado:` en el frontmatter de `04 Decisiones/D*` y `05 …/INS-*`.
5. `modulo:` en los expedientes de `12`.

## Auditoría: qué ya se hizo y qué nunca se subió

Para no rehacer trabajo ni dejar cambios olvidados (como los de la rama principal).
- Por módulo, sección «Sin subir»: worktrees y checkouts principales de los repos de las sesiones con cambios sin commit, commits sin push (`git rev-list --count HEAD --not --remotes`) y ramas locales sin remoto. Reusa `leerWorktrees` (`server/worktrees.js`), que ya da `sin_commit` y commits frente a develop; se agrega `sin_subir`. La rama se liga al módulo por el expediente (`rama:` + tarea) o por el ID de tarea en el nombre de la rama.
- Por módulo, sección «Hecho por agentes»: expedientes de `12 Implementación de tareas` con su `estado`, rama, PR y la última fila de Historial (fecha, agente y qué cambió). Si un expediente dice `terminada` pero su rama tiene cambios sin subir, sale como alerta.
- En el tablero, cada módulo muestra un contador «sin subir» en rojo cuando es mayor que 0.

## Decisiones (26-oct)

1. Maestros, A+W y arranque es un solo módulo: `MOD-MAE` (planos 01 y 13).
2. El % pondera por el tamaño de la brecha (S/M/L).
3. Solo mis 7 módulos; otro módulo aparece solo si una de mis tareas lo toca (columna Módulo).
4. Columna `Módulo` agregada a `preguntas.md` (12.ª columna) y `brechas-abiertas.md` (5.ª), llena con el mapa tarea→módulo (notas de estado, expedientes, códigos F1 y nombres de ClickUp). Respaldos `*.antes-modulo`. Regla en MI_WORKFLOW (Brechas abiertas, punto 5). Más la sección de auditoría de arriba.
5. ClickUp sin tareas cerradas por ahora; en el futuro, para validar contra la bóveda.
6. Cambios pendientes de la oficina commiteados en `main` (0d72ef2, 73e20de, 9a8214a).
