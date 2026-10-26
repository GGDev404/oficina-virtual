# Rediseño de Planos (26-oct)

Solo cambia la web (`web/src/vistas/planos.tsx` y las clases `pl-*` de `oficina.css`). El servidor y el JSON no se tocan.

## Crítica de lo que había

1. **Tablero plano.** Siete tarjetas iguales con cuatro líneas de conteos en texto. Nada dice cuál atender primero ni cuándo cierra cada una. Maestros va primero por su prioridad y los demás por azar.
2. **Las cuatro preguntas no tienen lugar.** No hay un total de bloqueos, ni «qué sigue», ni dónde está lo que nunca se subió (aparece al final del detalle).
3. **Detalle = pared de texto.** Una franja de bloqueos que se come el alto, cuatro columnas largas y recortadas, y todo hay que bajarlo con scroll. Ir de Almacén a Compras obliga a volver al tablero.
4. **Criterio del %** como nota técnica («ponderado: construido 2, parcial 1…») pegada bajo el título.
5. **Dudas sin dueño.** Para saber a quién le toca destrabar hay que leer el «Para …» de cada renglón.
6. **Modal chico** para un trabajo de revisión larga.
7. **Semáforo casi siempre rojo.** Con datos reales 5 de 7 módulos salen rojos o naranja; el color solo no ordena nada. Hace falta un orden explícito.

## Decisiones

- **La ventana de Planos ocupa casi toda la pantalla** (hasta 1440 × 940, y a 600 px usa todo el ancho). Más espacio para el detalle y menos scroll del cuerpo; la cabecera y la navegación se quedan fijas.
- **Tablero: resumen arriba + filas ordenadas.**
  - Cinco datos grandes responden las cuatro preguntas: entrega, avance, bloqueos totales, sin subir y lo que sigue (el próximo cierre).
  - Los módulos pasan de tarjetas a filas comparables: número de orden, nombre y la razón de su lugar, mapa de fichas (una celda por ficha), % grande, fichas hechas/parciales/por hacer en números, chips de bloqueos, sin tarea y sin subir, cierre con días que faltan.
  - Se ordena con tres botones: «Por cierre» (por omisión; la prioridad de Maestros va siempre primero), «Más bloqueado» y «Menor avance». Así «qué atiendo primero» lo decide quien mira.
- **Mapa de fichas sin depender del color:** construida = relleno verde sólido; parcial = rayas; por hacer = vacía con borde. Debajo, los números.
- **Detalle: navegación lateral + pestañas-resumen.**
  - Un riel con los siete módulos (nombre, %, bloqueos) para cambiar sin volver; en angosto se vuelve una tira horizontal.
  - Cabecera: nombre, semáforo con texto, % grande, mapa de fichas, cierre y días, y «Abrir en Obsidian».
  - El criterio del % queda en un `details` «¿Cómo se calcula?» con frases normales.
  - Cinco pestañas que son a la vez tarjetas de resumen: **Hecho**, **Falta**, **Dudas**, **Necesita**, **Sin subir**. Cada una muestra su número y una línea que importa (p. ej. «Eliam 3 · Jorge 1»). Se abre sola en Dudas si algo bloquea; si no, en Falta.
  - **Dudas agrupadas por persona** con chips que filtran: lo que bloquea sale primero y en rojo con texto «bloquea».
  - Textos largos con tope de 2 líneas y «Ver más».
  - Un buscador por módulo filtra la pestaña abierta.
  - «Sin subir» se destaca: banda roja si hay algo, línea verde con texto si no. Su pestaña es roja cuando importa.
- **Movimiento:** solo `opacity` y `transform` con las curvas y duraciones del sistema; `prefers-reduced-motion` ya lo apaga en la raíz.
- **Tokens:** solo variables del tema (`--panel`, `--hundido`, `--rojo`, `--verde`…). Nada de colores sueltos.

## Wireframe · tablero

```
+- Planos ----------------------------------------------- [x] -+
| [ENTREGA 15-dic] [AVANCE 27%]  [BLOQUEAN 21]  [SIN SUBIR 0]   |
| [ 50 días     ] [36/119 fich.] [en 4 módulos] [al día     ]   |
| SIGUE: Compras y Cuentas por pagar · cierre 10–14 nov (19 d)  |
|                                                               |
| Ordenar: (Por cierre) Más bloqueado  Menor avance             |
| 1 Maestros, A+W…  Prioridad  ▮▮▮▮▮▨▨▨▯▯▯  47%  ✖ 3 bloquean   |
|                              14 hechas · 5 parc. · 4 por hacer|
|                                         7 sin tarea · —       |
| 2 Compras        Cierra 10–14 nov ▮▮▮▮▨▨▯  37%  ! sin bloqueos |
| ...                                                           |
+---------------------------------------------------------------+
```

## Wireframe · detalle

```
+- Planos --------------------------------------------- [x] ----+
| [< Tablero]  | Almacén   32%  (✖ Rojo)  ▮▮▮▮▮▨▨▨▨▨▯▯  [Obsidian]|
| Maestros 47% | Cierra 24–28 nov · S07 · faltan 33 días          |
| Compras  37% | ¿Cómo se calcula el %? v                         |
| ▶Almacén 32% | oct26 ---- cierre ---- corte ---- entrega 15-dic |
| Mat. prima   |+--------+--------+---------+--------+----------+|
| Prod. term.  || Hecho  | Falta  | Dudas   |Necesita|Sin subir ||
| CxP          || 5      | 21     | 11      | 7      | 0        ||
| Tesorería    ||+8 parc.|7 s/tar.|5 bloquea|3 decis.| al día   ||
|              |+--------+--------+---------+--------+----------+|
|              | [Buscar…]  Todas · Eliam 3 · Jorge 1 · Millet 1  |
|              | ✖ P-002 bloquea · Eliam                          |
|              |   ¿Validas E07 (PR #215)… Ver más                |
|              | …                                                |
|              | Para saber más (6) v                             |
+--------------+--------------------------------------------------+
```

A 600 px el riel pasa arriba como tira con scroll horizontal y las pestañas-resumen hacen dos filas.

## Datos que me faltarían (no los pedí; no toqué `server/`)

- `dudas.abiertas[].enviada` ya llega pero no se muestra; si se quisiera «hace cuántos días espera» sirve ese campo.
- Para ordenar «lo siguiente» por brecha dentro de un módulo haría falta `falta[].fecha` o el vencimiento de la tarea (`falta[].vence`).
- Para el resumen de bloqueos por persona en el tablero (sin abrir cada módulo) haría falta `modulos[].bloqueanPara: { [persona]: n }`.

## v3 (26-oct, propuestas del dueño)

- Tablero: cinco datos, línea «Cierres hasta la entrega» (Maestros va al corte), tabla real de módulos (tarjetas a menos de 820 px) y alerta de worktrees sin ligar. Orden «Por cierre» / «Por avance».
- Detalle: sin riel; migas con selector de módulo, tarjetas de avance y tiempo, cuatro datos, pestañas (Falta ordenada de L a S) y columna de bloqueos.
- «Recordar» y «Crear tareas» solo copian texto (el segundo es un borrador; no crea nada en ClickUp).
- «Ligar a un módulo»: `POST /api/planos/ligar {rama, modulo}` guarda en la tabla `planos_ligas`; la liga es por nombre de rama y solo aplica a ramas que ningún expediente liga.
