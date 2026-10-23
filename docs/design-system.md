# Design system de la oficina

Todo vive en `web/src/oficina.css` (capa `components` de Tailwind) y `web/src/index.css` (los nombres de shadcn y las
utilidades de Tailwind apuntan a estos tokens). Regla: si falta un valor, se agrega como token aquí; nunca un hex o
un `px` suelto en un componente. `style={{}}` solo para valores calculados (anchos de medidores, tamaño del retrato).

## Modo y temas

| Atributo en `<html>` | Lo pone | Efecto |
|---|---|---|
| `data-modo="claro\|oscuro"` | `lib/tema.ts` | `color-scheme`, que resuelve cada `light-dark(claro, oscuro)`; también la variante `dark:` de Tailwind |
| `data-tema="halo\|cyberpunk\|doom\|minecraft\|claro\|oscuro"` | `lib/tema.ts` (Armería → Tema) | los temas de juego reemplazan valores; sin atributo = automático |

El tema se guarda en `localStorage` (`oficina-tema`) de cada navegador. Al cambiarlo se dispara `oficina-tema`: la
escena rehace su fondo (escenario del tema) y vuelve a hornear las figuras con el reparto del tema, sin mover a nadie.

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
| Controles | `--control` 32 px, `--control-alto` 36 px (campos y selects), `--icono-grande` 24 px (icono de estado de la pizarra) |
| Movimiento | `--dur-rapida 120 · --dur-media 200 · --dur-lenta 320 ms · --dur-pulso`; `--curva-entrada` (desacelera) y `--curva-salida` (acelera). Con movimiento reducido valen 0 |
| Escena | `--escenario` y `--esc-*`: tinta, papel, velo, resalte, alerta, aviso, ok, info, insignias, sombra; y la paleta del escenario (pasillo, muros, pisos por cuarto, monitor, código) que los escenarios usan como `var(--esc-…)` |
| Piel del tema | `--titulo-letra --titulo-mayus --titulo-espaciado --boton-letra` · `--panel-textura --bisel` · `--corte --filete --filete-color` (filete de esquina de `.barra .ventana .bloque`, en un `::before` decorativo) · `--boton-fondo --boton-texto --boton-borde` |
| Letreros de la escena | `--cuarto-fondo --cuarto-texto --cuarto-lleno-fondo --cuarto-lleno-texto --cuarto-letra --cuarto-mayus --cuarto-espaciado --cuarto-radio --cuarto-pad --cuarto-adorno --cuarto-bisel` · `--rotulo-letra --rotulo-radio` (burbujas, etiquetas, insignias) |

Letras: `--pixel` (Pixelify Sans) en títulos de Minecraft y en los letreros de la escena en Claro/Oscuro; `--rajdhani`
(Rajdhani) en títulos y botones de Halo y Cyberpunk; DOOM usa la del sistema en mayúsculas. En el cuerpo, siempre `--letra`.

`--corte` (`clip-path`) va solo en un `::before` sin eventos, nunca en un elemento enfocable: cortaría el anillo de foco.

## Piezas

| Pieza | Clase | Notas |
|---|---|---|
| Botón | `button`, `.primario`, `.boton-chico`, `.icono-boton(.chico)`, `.enlace` | 32 px mínimo |
| Peligro | `.peligro` (suave), `.peligro-solido` (confirmar), `.contorno-rojo` (cabecera) | |
| Aprobar | `.aprobar` | `--verde-solido` |
| Chip / cuenta | `.chip` + `.rojo .naranja .amarillo .verde .azul-suave`, `.cuenta(.rojo .aviso)`, `.marca` | |
| Medidor | `.medidor` + `<i>` (`.medio`, `.lleno`); `.medidor.nivel` arranca en verde | `role="meter"` con `aria-valuenow` |
| Pestañas | `<Pestanas>` + `<Panel>` (`components/pestanas.tsx`, sobre Radix) con `.vo-tabs` (subrayado) o `.va-tabs` (pastilla) | tablist/tab/tabpanel, flechas y Inicio/Fin; base común de foco, hover y seleccionada |
| Contenedores | `.bloque` (con `h4`), `.tarjeta`, `.proc`, `fieldset.pregunta`, `.aviso-caja(.rojo)` | |
| Campos | `input` (text, search, password, number, email, date, url), `select`, `textarea`, `input[type=color]` | hover, disabled, `aria-invalid` |
| Opciones | `.opcion[aria-pressed]`, `.opcion-pregunta` (radio/checkbox) | |
| Maquetación | `.pila(-chica/-media/-grande)`, `.fila`, `.acciones`, `.sin-margen`, `.subtitulo`, `.una-linea`, `.crece`, `.empuja`, `.relleno(-chico)` | |
| Pizarra | `.pz-tarjeta[data-tono=azul\|verde\|naranja]` (estado: franja con icono + frase, `--tono`/`--tono-bg`), `.pz-linea` (pasos como segmentos), `.pz-cols` (Hecho / Falta), `.pz-ti[data-tono]` (qué falta de ti), `.pz-rejilla` | el tono va en `data-tono`, no como clase, para no heredar `.rojo`/`.naranja` globales; siempre icono + texto además del color |
| Juego | `.retrato` (el mismo personaje que la escena, en la pose dada; rol = rasgo en la mano: lupa, martillo, escudo, libro, paleta, enchufe), `.arm-reparto` (Tú y los seis roles en el tema elegido), `.campo.apagado` (color que el personaje del tema no usa; se guarda igual), `.arm-hotbar` (9 casillas), `.arm-insignia` (nivel), `.logro` (aviso de logro) | |

## Escena: escenarios, reparto y poses

- **Escenarios** (`escena/escenarios/<tema>.ts`, contrato en `comun.ts`): misma geometría de cuartos en todos los temas;
  cada uno pone pisos, muros, muebles, su decorado animado y, opcional, `mesa` (tu escritorio, con un grupo `.pila` de 6 hojas).
  Claro/Oscuro/Automático usan la oficina limpia.
- **Reparto** (`escena/kits/<tema>.ts`): en un tema de juego el tema decide quién es cada actor; en Claro, Oscuro y
  Automático manda la clase guardada. Los colores guardados tiñen lo que cada personaje declara en `usa`; sus rasgos
  propios (visor dorado del Jefe Maestro, el ojo de Guilty Spark) no cambian.

| Tema | Tú | Roles (plan, QA, impl, diseño, docs, integ) | Sesiones sin rol |
|---|---|---|---|
| Halo | Jefe Maestro | Cortana, 343 Guilty Spark, Sgt. Johnson, Dra. Halsey, Cap. Keyes, El Arbiter | Spartans |
| Cyberpunk | V | Alt Cunningham, Delamain, Jackie Welles, Judy Alvarez, Misty, T-Bug | Edgerunners |
| DOOM | Doom Slayer | Samuel Hayden, VEGA, Night Sentinel herrero, El Maykr, Guardián del códice, Ingeniero Argent | Marines UAC |
| Minecraft | Steve | Alex, Golem de hierro, aldeanos herrero, cartógrafo y bibliotecario, Allay | Aldeanos |

- **Dibujo**: cada personaje es un rig SVG (o pixel art en Minecraft) que se hornea una vez por pose en una tira de
  cuadros (`escena/hornear.ts`) y se anima solo con `transform`/`opacity`. Homenajes originales: nada de arte, logos ni
  letras oficiales de los juegos.
- **Poses** (`escena/animacion.ts`), por estado de la sesión:

| Estado | Pose | Con movimiento reducido |
|---|---|---|
| trabajando | `teclea` (sentado, de espaldas) | sentado, manos en la mesa |
| trabajando, esperando procesos | `espera` | barra al 50 % |
| necesita permiso, duda | `mano` | brazo arriba |
| te espera | `parado` (respira, parpadea) | de pie |
| bloqueado | `triste` | encorvado |
| listo para revisar | `entrega` (levanta la carpeta) | carpeta arriba |
| sin señal | `duerme` | zZ fijas |
| caminando | `camina` | se teletransporta |

## Accesibilidad (no negociable)

- Contraste: 4.5:1 en texto, 3:1 en bordes de controles y medidores, en cada tema. `test/contraste.test.js` lo comprueba
  en los 7 temas (y en claro y oscuro para Automático) leyendo `oficina.css`; corre con `npm test`.
- Foco visible (`:focus-visible` con `--foco`); en la escena, doble anillo amarillo y oscuro.
- `prefers-reduced-motion`: sin animaciones ni transiciones; la escena teletransporta en vez de caminar.
- Nada parpadea más de 3 veces por segundo; los avisos se anuncian con `role="status"` sin robar el foco.
- Textos de agentes y comentarios siempre como nodos de texto, nunca HTML.
