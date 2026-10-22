# Design system de la oficina

Todo vive en `web/src/oficina.css` (capa `components` de Tailwind) y `web/src/index.css` (los nombres de shadcn y las
utilidades de Tailwind apuntan a estos tokens). Regla: si falta un valor, se agrega como token aquí; nunca un hex o
un `px` suelto en un componente. `style={{}}` solo para valores calculados (anchos de medidores, tamaño del retrato).

## Modo y temas

| Atributo en `<html>` | Lo pone | Efecto |
|---|---|---|
| `data-modo="claro\|oscuro"` | `lib/tema.ts` | `color-scheme`, que resuelve cada `light-dark(claro, oscuro)`; también la variante `dark:` de Tailwind |
| `data-tema="halo\|cyberpunk\|doom\|minecraft\|claro\|oscuro"` | `lib/tema.ts` (Armería → Tema) | los temas de juego reemplazan valores; sin atributo = automático |

El tema se guarda en `localStorage` (`oficina-tema`) de cada navegador. Al cambiarlo se dispara `oficina-tema` y la
escena vuelve a leer su paleta y repinta el fondo.

## Tokens

| Grupo | Tokens |
|---|---|
| Superficies | `--fondo --panel --hundido --borde --borde-fuerte --borde-control` (3:1 en controles) |
| Texto | `--texto --suave` |
| Acento | `--acento --acento-suave --acento-texto` |
| Estado (texto / fondo) | `--rojo(-bg) --naranja(-bg) --amarillo(-bg) --verde(-bg) --azul(-bg) --gris(-bg) --resalte` |
| Sólidos | `--verde-solido --rojo-solido` con `--sobre-solido` encima |
| Foco y capas | `--foco --velo --sombra-1 --sombra` · `--z-barra --z-ventana --z-encima` |
| Espacio | `--s1..--s6` = 4 / 8 / 12 / 16 / 24 / 32 px |
| Radio | `--r1..--r5` = 4 / 8 / 10 / 12 / 16 px, `--r-pill` (Minecraft los pone en 0) |
| Letra | `--t-xs 12 · --t-sm 12.5 · --t-md 13 · --t-base 14 · --t-lg 16 · --t-xl 18`; familias `--letra --pixel --mono` |
| Controles | `--control` 32 px, `--control-alto` 36 px (campos y selects) |
| Movimiento | `--dur-rapida 120 · --dur-media 200 · --dur-lenta 320 ms · --dur-pulso`; `--curva-entrada` (desacelera) y `--curva-salida` (acelera). Con movimiento reducido valen 0 |
| Escena | `--escenario` y `--esc-*`: tinta, papel, velo, resalte, alerta, aviso, ok, info, insignias, sombra; y la paleta del lienzo (pasillo, muros, pisos por cuarto, monitor, código) que `escena.ts` lee con `getComputedStyle` |

Letra de píxel (`--pixel`) solo en títulos, etiquetas de la escena, insignias y números: en el cuerpo baja la legibilidad.

## Piezas

| Pieza | Clase | Notas |
|---|---|---|
| Botón | `button`, `.primario`, `.boton-chico`, `.icono-boton(.chico)`, `.enlace` | 32 px mínimo |
| Peligro | `.peligro` (suave), `.peligro-solido` (confirmar), `.contorno-rojo` (cabecera) | |
| Aprobar | `.aprobar` | `--verde-solido` |
| Chip / cuenta | `.chip` + `.rojo .naranja .amarillo .verde .azul-suave`, `.cuenta(.rojo .aviso)`, `.marca` | |
| Medidor | `.medidor` + `<i>` (`.medio`, `.lleno`); `.medidor.nivel` arranca en verde | `role="meter"` con `aria-valuenow` |
| Pestañas | `.vo-tabs` (subrayado), `.va-tabs` (pastilla) | base común de foco, hover y seleccionada |
| Contenedores | `.bloque` (con `h4`), `.tarjeta`, `.proc`, `fieldset.pregunta`, `.aviso-caja(.rojo)` | |
| Campos | `input` (text, search, password, number, email, date, url), `select`, `textarea`, `input[type=color]` | hover, disabled, `aria-invalid` |
| Opciones | `.opcion[aria-pressed]`, `.opcion-pregunta` (radio/checkbox) | |
| Maquetación | `.pila(-chica/-media/-grande)`, `.fila`, `.acciones`, `.sin-margen`, `.subtitulo`, `.una-linea`, `.crece`, `.empuja`, `.relleno(-chico)` | |
| Juego | `.retrato` (sprite), `.arm-hotbar` (9 casillas), `.arm-insignia` (nivel), `.logro` (aviso de logro) | |

## Accesibilidad (no negociable)

- Contraste: 4.5:1 en texto, 3:1 en bordes de controles y medidores, en cada tema.
- Foco visible (`:focus-visible` con `--foco`); en la escena, doble anillo amarillo y oscuro.
- `prefers-reduced-motion`: sin animaciones ni transiciones; la escena teletransporta en vez de caminar.
- Nada parpadea más de 3 veces por segundo; los avisos se anuncian con `role="status"` sin robar el foco.
- Textos de agentes y comentarios siempre como nodos de texto, nunca HTML.
