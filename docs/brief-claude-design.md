# Brief de diseño · Oficina virtual

Documento para rediseñar la Oficina virtual. Describe qué es, cada cuarto y cada vista, qué datos existen de verdad
y qué reglas no se pueden romper. Lo que no esté aquí, la oficina no lo sabe: no diseñar con datos inventados.

## 1. Qué es

Una página web local (`http://127.0.0.1:4777`) para **supervisar a varios agentes de Claude Code** que trabajan en
paralelo en las tareas de ClickUp de una persona (Geovany, desarrollador del ERP de Millet).

- **Un usuario**, en su propia computadora (Linux, navegador Brave/Chromium). Pantalla típica: laptop o monitor ancho;
  a veces la ventana va angosta junto a una terminal.
- **Pregunta que responde de un vistazo:** ¿quién me necesita ahora?, ¿qué vence hoy?, ¿cómo va cada agente?
- **Idioma:** todo en español de México, tono directo. Horas en formato `6:00 p.m.`.
- **Tiempo real:** el servidor empuja el estado completo por SSE; la página se repinta sola, sin botones de refrescar.

## 2. Estructura general de la pantalla

1. **Barra superior** (sticky): título «Oficina virtual», botón primario **Nueva sesión**, estado de sincronización
   con ClickUp («ClickUp hace 2 min» / «Sincronizando…») con botón **Sincronizar ahora**, y chip de conexión
   («en vivo» verde / «desconectado» rojo).
2. **Escena pixel art** (la oficina) a todo el ancho: cada agente es un personaje en el cuarto de su estado.
3. **Tarjetas de resumen** debajo de la escena (rejilla que se acomoda): cada una abre su ventana.
4. **Ventanas** (diálogos modales grandes) para todo lo demás.

## 3. La escena: cuartos (departamentos)

Mundo lógico de **480 × 272 px**, escalado con `image-rendering: pixelated` para llenar el ancho disponible (en
celular se desplaza en horizontal). Fuente de los letreros: **Pixelify Sans**. Cada cuarto tiene un letrero arriba
a la izquierda con su nombre y el conteo de agentes («TALLER · ACTIVOS 3/3»).

| Cuarto | Posición (x, y, w, h) | Quién está ahí | Pose del personaje | Burbuja |
|---|---|---|---|---|
| **Taller** | 0, 0, 272, 128 · 8 escritorios con monitor | Agentes **trabajando** | Teclea | — |
| **Tu puerta** | 304, 0, 176, 128 | Agentes que **te necesitan**: permiso, duda o esperan respuesta. Ordenados por urgencia | Levanta la mano / parado | `!` roja (permiso), `?` naranja (duda), `•••` naranja (te espera) |
| **Bloqueados** | 0, 160, 112, 112 | Agentes **bloqueados** (les falta algo) | Triste | Ícono «alto», roja |
| **Descanso** | 112, 160, 160, 112 · sillón | **Listos para revisar** (terminaron su turno) y **sin señal** | Café / duerme | Palomita amarilla / `zZ` gris |
| **Tu oficina** | 304, 160, 176, 112 · tu escritorio | Tú (no hay agentes) | — | — |

Entre cuartos hay pasillos; los personajes **caminan** de un cuarto a otro cuando cambia su estado (respetar
`prefers-reduced-motion`: sin caminar, aparecen directo).

**Cada personaje** muestra debajo una **etiqueta** con su nombre (máx. ~150 px, con elipsis) y una **barra de
contexto** de 3 px (verde; ámbar desde 80 %; roja desde 95 %). Clic o Enter sobre el personaje → abre su ficha.
Personajes que se cierran se desvanecen al salir. Regla del sprint: **máximo 3 agentes activos** (el letrero del
Taller se pone naranja si se pasa).

**Objetos clicables en Tu oficina:**
- **Tú · entrar** (insignia sobre tu escritorio) → abre «Tu día».
- **Bandeja** (insignia con número) → comentarios de ClickUp dirigidos a ti.
- **Calendario** (insignia «3 hoy» / «2 vencidas» / «al día») → Agenda.
- Si no hay agentes: aviso centrado «Sin agentes de Claude Code activos».

## 4. Tarjetas de resumen (debajo de la escena)

Cada una: ícono en cuadro de color, título en negrita, una línea de detalle con elipsis, flecha. Tono por estado
(alerta roja, aviso naranja, bien verde, neutro).

| Tarjeta | Título / detalle | Abre |
|---|---|---|
| **Te necesitan** | «Te necesitan · 2» / «Nombre: necesita permiso» o «Nadie te espera» | Ventana Te necesitan |
| **Tu día** | Próximo corte «Integración a develop · 13:00» / «En 1 h 16 min · 3 vencen hoy» | Tu día → Agenda |
| **Para ti** | «Para ti · 3» / «Eliam: …primer renglón del comentario» | Tu día → Para ti |
| **Pendientes** | «Pendientes · 3» / «2 sesiones por aprobar» | Tu día → Pendientes |
| **Memoria** | «Memoria bien / alta / casi agotada» / «4.7 GB libres · swap 46 %» | Tu día → Memoria |

## 5. Vistas (ventanas)

### 5.1 Ficha del agente (la más usada)

Dos versiones según el ancho **de la ventana** (container query a 900 px):

**Completa (≥ 900 px):**
- **Cabecera:** nombre de la sesión; a la derecha: botón ícono **Abrir en terminal**, ícono **Continuar en sesión
  nueva**, botón contorno rojo **Cerrar sesión**, separador, cerrar ventana.
- **Segunda línea:** chip de estado con tiempo («Trabajando · 22 min»), modelo («Opus 5.5»), rama git (mono),
  carpeta abreviada («…/worktrees/86e3tfedd», mono) con botón copiar. A la derecha: «Contexto 461k / 1M», barra y %.
- **Cuerpo izquierdo — conversación** tipo chat: separador de día («Hoy · 11:21 a.m.»), mensajes del agente con
  avatar «AG» y «Agente · hora» (markdown: listas, código, tablas, enlaces), tus mensajes a la derecha con tus
  iniciales, línea de actividad al final («Trabajando…» con punto que late). Encima de la conversación, **avisos**
  cuando aplican (ver 6).
- **Redactor:** caja con texto, botón imagen, pista («Se teclea en su terminal · Ctrl+Enter envía» / «Lo lee entre
  pasos»), botón **Enviar**. Acepta pegar o arrastrar imágenes (miniaturas con botón quitar). El borrador se
  conserva por sesión al salir.
- **Panel derecho (380 px, plegable):** pestañas **Procesos N / Subagentes N / Tarea N**.
  - Procesos: tarjetas desplegables (punto de color, nombre corto, subtítulo, marca «shell»/«agente»); al desplegar,
    el comando completo y, si escribe a un `.log`, sus últimas líneas con «Ver log completo» y «Actualizar».
  - Subagentes: tipo, descripción, «trabajando · 3 min» o «terminó hace 5 min».
  - Tarea: nombre (enlace a ClickUp), vence, estado, prioridad, lista, horario, choque; Cambiar / Desligar /
    Asignar tarea (selector con búsqueda agrupado por vencimiento).

**Reducida (< 900 px):** cabecera con terminal, «…» (menú: continuar, cerrar sesión) y cerrar; segunda línea sin
carpeta y contexto solo barra + %; fila de **chips** («4 procesos», «1 subagente trabajando», tarea) que abren
**menús desplegables** anclados al chip con el mismo contenido del panel; redactor en **una sola línea**.

### 5.2 Tu día (pestañas)

Cabecera «Tu día» + chip de veredicto («3 vencen hoy · la primera a las 6:00 p.m.» / «2 vencidas» rojo / «Al día»
verde) + próximo corte. Pestañas con contador:
- **Agenda:** «Hoy» en lista (hora naranja o «Vencida» roja, código de tarea en mono azul + nombre, chips estado y
  prioridad, a la derecha «Agente trabajando» o **Empezar sesión**). «Próximos días»: botones por día con conteo y
  las tareas de ese día en tarjetas de dos columnas; «Ver N más de este día». Al final, resumen del turno nocturno.
- **Pendientes:** solicitudes de sesión de agentes (Abrir / Rechazar, con carpeta, permisos e indicación completa),
  sesiones que murieron sin cerrarse (Retomar / Descartar) y notas libres (agregar / Hecho).
- **Para ti:** comentarios de ClickUp dirigidos a ti (autor, tarea, texto, «Marcar visto», «Abrir en ClickUp»;
  correcciones resaltadas); casilla «Todos los comentarios».
- **Memoria:** nivel (bien / alta / casi agotada), barras RAM y swap con GB, lista por agente con GB y
  **Pausar / Reanudar**.

### 5.3 Te necesitan

Cola de agentes que esperan algo de ti, el más urgente primero: chip de estado, nombre, «lleva 4 min», tarea,
último mensaje (3 líneas). Acción según el caso: tarjeta de permiso compacta (Aprobar / Rechazar), «Ver el diálogo y
contestar», «Responder», «Ver ficha».

### 5.4 Nueva sesión

Selector de tarea (búsqueda, agrupado: Vencidas, Hoy, Mañana, Esta semana, Después; muestra estado, prioridad,
«un agente en ella»). Campos: ubicación (worktree de la tarea / carpeta aparte en ~/Agentes / carpeta dada),
carpeta con sugerencias, indicación, nombre, permisos (auto / aceptar ediciones / manual), modelo, dónde se abre.
Mensajes de resultado y errores en línea.

### 5.5 Entra a tu oficina

Diálogo pequeño con campo de frase (password) y **Entrar**. Aparece al cargar si no has entrado en ese navegador
(dura 30 días). Mensajes: frase incorrecta, demasiados intentos, «aún no tienes frase».

## 6. Avisos y diálogos dentro de la ficha

Se apilan arriba de la conversación; deben distinguirse sin depender solo del color:
- **Pide permiso** (rojo): herramienta y datos (comando, archivo, contenido) con cuenta regresiva de 15 min,
  **Aprobar**, **Permitir siempre** (muestra la regla exacta y dónde se guarda), **Rechazar** (con motivo opcional),
  **Decidir en la terminal**.
- **Diálogo en su terminal** (rojo): captura de la pantalla de la terminal (texto mono) y botones **1 2 3 4 Esc**.
- **Pregunta con opciones** (como en la app): cada pregunta con opciones (una o varias) y «Otra respuesta».
- **Bloqueado**, **Espera sus procesos**, **Contexto alto / casi lleno** (con «Pedir resumen de traspaso»).
- **Confirmar cierre** de sesión.
- **Mensaje no enviado:** tu mensaje en rojo en la conversación con el motivo.

## 7. Estados y colores (tokens actuales)

| Estado | Etiqueta | Color |
|---|---|---|
| `trabajando` | Trabajando | verde |
| `necesita_permiso` | Necesita permiso | rojo |
| `bloqueado` | Bloqueado | rojo |
| `duda` | Duda | naranja |
| `te_espera` | Te espera | naranja |
| `listo_para_revisar` | Listo para revisar | amarillo |
| `sin_señal`, `cerrada` | Sin señal / Cerrada | gris |

Tokens en `:root` con versión clara y oscura (`prefers-color-scheme`): `--fondo --panel --hundido --borde
--borde-fuerte --texto --suave --acento --acento-suave --rojo/-bg --naranja/-bg --amarillo/-bg --verde/-bg
--gris/-bg`, espaciado `--s1…--s6` (4–32 px). Texto del sistema `system-ui` 14 px; mono `ui-monospace`.
La escena tiene su propia paleta pixel art (pisos por cuarto, insignias con borde oscuro de 2 px y sombra dura).

## 8. Datos que SÍ existen (diseñar con esto)

Por sesión: nombre, estado y desde cuándo, ocupada/libre, modelo, tokens de contexto y límite, rama git, carpeta,
tarea ligada, último mensaje, conversación (últimos ~16 intercambios), procesos en segundo plano (tipo
shell/subagente + descripción o comando), subagentes (tipo, descripción, inicio/fin), si corre en tmux, memoria
(MB del árbol de procesos) y si está pausada. Por tarea (ClickUp): nombre (suele traer código al inicio:
«UI-F4.2 · …»), estado, prioridad, vence, lista, URL, horario, choque, comentarios. Global: memoria de la máquina,
próximo corte del día, sincronización con ClickUp, turno nocturno (texto), pendientes y solicitudes.

## 9. Datos que NO existen (no diseñarlos)

Puerto, «health 200», «vigilante», tiempo transcurrido de cada proceso, progreso de pruebas (12/31), PID de procesos
en segundo plano y por tanto **Reiniciar / Detener proceso**; costo o tokens gastados; historial completo de la
conversación (solo los últimos intercambios); notificaciones de otras personas.

## 10. Reglas que el diseño no puede romper

- **Nunca teclear encima de un diálogo abierto**: con permiso o diálogo pendiente, el redactor bloquea el envío y
  dirige a los botones del diálogo.
- **Aprobar es explícito**: cada permiso se aprueba con un clic visible; «Permitir siempre» muestra la regla antes.
  Nunca existe «aprobar todo» ni modo `bypassPermissions` desde la página.
- **Lo que actúa en tu nombre exige haber entrado** con la frase; sin sesión, las acciones muestran «Entra a tu
  oficina».
- **Abrir sesiones se bloquea con la memoria casi agotada** (mensaje y sugerencia de pausar/cerrar un agente).
- **Accesible:** foco visible, todo operable con teclado, roles ARIA en pestañas, medidores y menús, contraste en
  ambos temas, no depender solo del color, `prefers-reduced-motion`.
- **Funciona angosto:** ficha a 600 px; Tu día y tarjetas en una columna en celular.

## 11. Cómo está hecha (para que el diseño sea implementable)

- **React 19 + TypeScript con Vite** (`web/`), **Tailwind CSS 4** y **shadcn/ui** sobre Radix: se pueden entregar
  componentes React con clases de Tailwind o componentes de shadcn tal cual. Fuente Pixelify Sans de Google Fonts.
  Los textos de agentes van siempre como texto (nunca `dangerouslySetInnerHTML`).
- Tokens de color en `web/src/oficina.css`; los nombres de shadcn (`--primary`, `--background`, `--muted`…) apuntan a ellos.
- Íconos **lucide-react** (sin emoji).
- Ventanas con el **Dialog** de shadcn; menús con su **Popover**; pestañas con **Tabs** de Radix.
- Escena en `<canvas>` 480×272 + una capa HTML encima para personajes, letreros e insignias.

## 12. Qué pedirle a Claude Design

Por cada vista (escena + tarjetas, ficha completa, ficha reducida, Tu día con sus 4 pestañas, Te necesitan, Nueva
sesión, Entrar): versión **clara y oscura**, y los casos límite: sin agentes, 3 agentes en Tu puerta a la vez, nombre
de sesión muy largo, permiso con comando de 20 líneas, contexto al 97 %, memoria casi agotada, ningún pendiente,
día con 15 tareas, sesión cerrada (ficha en solo lectura).
