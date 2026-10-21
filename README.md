# Oficina virtual

Panel local (`127.0.0.1:4777`) con las sesiones de Claude Code, sus subagentes y las tareas de ClickUp.
Panel local para seguir tus sesiones de Claude Code y tus tareas de ClickUp.

## Hooks (Fase 1)

```bash
node scripts/instalar-hooks.js          # respalda ~/.claude/settings.json y fusiona los hooks
node scripts/instalar-hooks.js --quitar # quita solo los hooks de la oficina (también respalda)
```

`hooks/hook.sh <Evento>` agrega `{ts, evento, payload}` a `~/.local/share/oficina-virtual/raw-events.jsonl`.
No escribe en stdout, usa `timeout 2` y siempre termina con `exit 0`.

### Campos reales (Claude Code 2.1.304, capturados el 2026-10-20)

Comunes a todos: `session_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `hook_event_name`.
Desde `UserPromptSubmit`: `prompt_id`; casi todos traen `permission_mode` y `effort.level`.

| Evento | Campos propios |
|---|---|
| SessionStart | `source` (`startup`, …) |
| UserPromptSubmit | `prompt` |
| PreToolUse (Agent) | `tool_name`, `tool_use_id`, `tool_input.{description, prompt, subagent_type, run_in_background}` |
| PostToolUse (Agent) | lo de PreToolUse + `duration_ms`, `tool_response.{status, agentId, agentType, content[], totalDurationMs, totalTokens, totalToolUseCount, resolvedModel, usage}` |
| SubagentStart | `agent_id`, `agent_type` (sin `tool_use_id` ni `description`) |
| SubagentStop | `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`, `stop_hook_active`, `background_tasks[]`, `session_crons[]` |
| Stop | `last_assistant_message`, `stop_hook_active`, `background_tasks[]`, `session_crons[]` |
| SessionEnd | `reason` (`other`, …) |
| Notification | `message`, `notification_type`: `permission_prompt` ("Claude needs your permission to use Write") o `idle_prompt` ("Claude is waiting for your input") |

Notas para el diseño:
- `SubagentStop.agent_id` **no** es el `tool_use_id`. El enlace es `PostToolUse.tool_response.agentId`;
  en PreToolUse solo se conoce `tool_use_id`. `SubagentStart` da el `agent_id` al arrancar pero tampoco
  trae `tool_use_id`: se liga al PreToolUse previo de la misma sesión por orden. Si el subagente termina antes del PostToolUse,
  `SubagentStop` llega primero (visto en la captura).
- `Stop.last_assistant_message` trae el texto final: de ahí salen `BLOQUEO:` y `DUDA:` sin leer el transcript.
- **Rechazar un permiso no dispara ningún hook**: ni Stop, ni PostToolUse, ni `idle_prompt`. El turno queda
  interrumpido y en el transcript se escribe `[Request interrupted by user for tool use]`. Para no dejar la
  sesión pegada en `necesita_permiso`, el estado se limpia con el siguiente evento de esa sesión, o
  cuando el `transcript_path` se modifica después de la Notification.
- `idle_prompt` ("Claude is waiting for your input") llega ~1 min después de un Stop si no contestas;
  no llega con un permiso pendiente ni después de rechazarlo.
- UserPromptSubmit también llega con avisos de tareas en segundo plano (`<task-notification>…`) y
  mensajes de subagentes (`<agent-message …>`): no son mensajes del usuario.
- `Stop.background_tasks[]` trae lo que sigue corriendo (`id`, `type` subagent/shell/monitor, `status`,
  `description`, `agent_type`). `SubagentStop.agent_type` puede venir vacío.
- No llega la rama git ni el título de la sesión: la rama se calcula desde `cwd`.

## Servidor (Fase 2)

```bash
npm start   # http://127.0.0.1:4777 (OFICINA_PUERTO y OFICINA_DATOS para cambiar puerto y carpeta)
npm test    # máquina de estados con los eventos reales de test/eventos-fase1.jsonl
```

SQLite con `node:sqlite` (incluido en Node ≥ 22.13, sin dependencias) en `~/.local/share/oficina-virtual/oficina.db`.
Cada evento de los hooks avisa a la página al momento (no espera al ciclo de 5 s). Si el servidor no responde, `hook.sh` deja el evento en `pendientes.jsonl` y el servidor lo procesa al arrancar y cada 5 s.

| Endpoint | Uso |
|---|---|
| `POST /api/eventos` | lo llama `hook.sh` con `{ts, evento, payload}` |
| `GET /api/estado` | sesiones (las cerradas, solo 2 h), subagentes, tareas y comentarios |
| `GET /api/stream` | SSE `event: estado` con el estado completo en cada cambio (ráfagas juntas en ~60 ms, sin repetir un estado idéntico), `retry: 3000` y un comentario `: ka` cada 15 s |
| `POST /api/roles/:rol/encargo` | `{texto, de_sesion?, cwd?}`: encarga trabajo a la sesión de un rol (ver «Roles y encargos») |
| `POST /api/roles/:rol/sesion` | `{cwd}`: abre la sesión de un rol sin encargo (solo con tu cookie) |
| `POST /api/comentarios/:id/visto` | marca un comentario como visto |
| `POST /api/sesiones/:id/tarea` | `{tarea_id}` liga la sesión a mano (`null` la desliga) |

Seguridad: escucha solo en `127.0.0.1`, rechaza `Host` distinto de `127.0.0.1:4777`/`localhost:4777`
(DNS rebinding) y todo POST exige `Content-Type: application/json`, sin CORS.

## ClickUp (Fase 4)

Token en `~/.config/oficina-virtual/.env` (ver `.env.example`, `chmod 600`). La oficina **solo lee** ClickUp.

- Al arrancar y cada 5 min (o `POST /api/sincronizar`): tareas abiertas asignadas a ti que vencen en ≤ 30 días
  (incluye vencidas), sus comentarios (los 25 más recientes por tarea) y las respuestas de cada hilo.
- Cola de una solicitud cada 650 ms (≈ 90/min); ante 429 espera hasta `X-RateLimit-Reset`.
- **Sin responder**: comentario de otra persona sin ningún comentario o respuesta tuya posterior en la tarea.
- **Tipo**: empieza con `FICHA TÉCNICA` → `ficha`; contiene `CORRECCIÓN` → `correccion`; el resto → `otro`.
  De la ficha más reciente salen `HORARIO VIGENTE:` y `CHOQUE:` (el valor llega hasta la siguiente ` · ETIQUETA:`).
- El estado de la sincronización va en `sync` de `/api/estado` (`ultima_ts`, `error`, `tareas`, `comentarios`).

## Sesión ↔ tarea (Fase 3)

`server/tarea-link.js` liga cada sesión, en este orden:

1. `CLICKUP_TASK=<id> claude` (el hook hereda el entorno y lo manda como `tarea_env`);
2. la rama git del `cwd` (`feature/factura-duplicada-k7p2tfedr`);
3. la carpeta (`mi-erp.worktrees/k7p2tfedd`, sirve con HEAD separado);
4. el primer prompt tuyo con un ID: `/agil k7p2jvu77`, `app.clickup.com/t/<id>` o `CU-<id>`
   (se ignoran `<task-notification>` y `<agent-message>`);
5. a mano desde la página (`POST /api/sesiones/:id/tarea`; `null` desliga y vuelve el ligado automático).

Del 2 al 5 el ID debe existir en `tareas` (abiertas, vencen en ≤ 30 días); así "proyectos" o "conflicto",
que también tienen 9 caracteres, no se ligan. Lo manual y la variable no se pisan; tras cada sincronización
se reintenta con las sesiones sin ligar.

## La página

`http://127.0.0.1:4777`, en vivo por SSE. Está en `web/`: Vite + React 19 + TypeScript, Tailwind CSS 4 y shadcn/ui (Radix).
El servidor sirve el build (`web/dist`) y solo los archivos de esa carpeta.

```bash
npm --prefix web install   # una vez
npm run build              # compila web/ a web/dist; basta recargar la página, sin reiniciar el servicio
npm --prefix web run dev   # desarrollo en :5173 con recarga al momento; /api va al servidor en :4777
```

- `web/src/oficina.css`: los estilos y tokens de la oficina, en la capa `components` de Tailwind (las utilidades y los
  componentes de shadcn los pueden sobrescribir). `web/src/index.css` apunta los tokens de shadcn (`--primary`,
  `--background`, …) a los de la oficina, así que un componente nuevo de shadcn sale con sus colores, en claro y oscuro.
- Componentes nuevos: `cd web && npx shadcn@latest add <componente>` (quedan en `web/src/components/ui/`). Las ventanas
  usan su Dialog (`components/ventana.tsx`) y los menús de la ficha su Popover; las pestañas, Tabs de Radix.
- La escena (`web/src/escena/escena.ts`) es dibujo en `<canvas>` con su propio bucle; React solo la monta y le pasa los datos.
- Los textos de agentes y comentarios nunca van como HTML: el markdown (`web/src/lib/markdown.tsx`) arma elementos de React.

**Vista general.** La oficina en pixel art ocupa la pantalla y debajo van cuatro tarjetas de un solo ítem:
Te necesitan · Hoy (o «Al día») · Para ti · Próximo corte (daily 9:00, seguimientos 9:35/13:35/17:35,
integración a develop 13:00 y 18:00). Cada tarjeta abre solo lo suyo (Hoy y el corte, tu agenda; Para ti, los
comentarios); la oficina completa se abre desde «Tú · entrar». En las ventanas de dos columnas, lo que queda debajo
de la columna lateral (el cuadro para escribir, los próximos días) usa todo el ancho. Cada sesión es un personaje con su nombre real y su cuarto es su estado:

| Cuarto | Estados | Cómo se ve |
|---|---|---|
| Taller (letrero «activos n/3») | trabajando | de espaldas, tecleando; con reloj de arena y barra de progreso si espera un shell o subagente en fondo; sus subagentes son robots |
| Tu puerta | necesita permiso `!`, duda `?`, te espera `•••` | fila frente a tu puerta, el más urgente junto a ella |
| Bloqueados | bloqueado | alarma roja |
| Descanso | listo para revisar, sin señal | con café o dormido |
| Tu oficina | — | tú («Tú · entrar»), bandeja = comentarios para ti, calendario = vencimientos |

Cada agente lleva una etiqueta del color de su camisa con una barra de **uso de contexto** debajo (verde; ámbar desde
80 %; roja desde 95 %). El uso sale de la última respuesta en su transcript (entrada + caché + salida).
La ventana depende del modelo: 1 M para los que la traen de fábrica (Opus 4.7+, Sonnet 5+, Fable, Haiku 5.5) o si ya
pasó de 200 mil; 200 mil para los demás.

**Ficha del agente** (clic en el personaje): conversación reciente leída de su transcript (las respuestas del agente
con su formato: listas, tablas, código, negritas y enlaces, armado con nodos y nunca como HTML), cuadro para
escribirle y contexto (tarea con horario y choque, rama y carpeta, procesos en segundo plano, subagentes). Con el
contexto alto avisa que conviene `/compact` (escríbelo en su terminal: un mensaje no ejecuta comandos); casi lleno,
ofrece **Pedir resumen de traspaso** para seguir en una sesión nueva. La conversación se actualiza al momento: el
servidor vigila (`fs.watch`) el transcript de cada sesión abierta y avisa a la página (`event: conversacion` en el SSE)
en cada escritura, sin esperar al siguiente hook. El uso de contexto se refresca igual.

**Imágenes**: en el cuadro de mensaje puedes pegar (Ctrl+V), arrastrar o elegir con **Imagen** hasta 4 imágenes PNG, JPG,
GIF o WebP (5 MB juntas). El servidor revisa sus primeros bytes, las guarda en `~/.local/share/oficina-virtual/adjuntos/`
(600; se borran a los 7 días) y agrega sus rutas al mensaje para que el agente las abra con Read.

**Tú llevas tus mensajes**: tu avatar se levanta de su escritorio, camina hasta el agente con el sobre, espera a que la
entrega se confirme (una X si falla) y regresa; varios mensajes los lleva uno tras otro. Es solo visual: la entrega real
la hace un `claude -p` corto que no aparece como agente y no espera a la animación.

**Salida**: cuando una sesión se cierra, su personaje sale caminando por el pasillo y desaparece en la orilla.

**Mensajes a los agentes.** `server/mensajero.js` lanza `claude -p --model haiku` con solo `ListAgents` y
`SendMessage` (sin tus hooks ni plugins: `--setting-sources project`) que entrega tu texto con la mensajería entre
sesiones de Claude Code. Sesión libre: arranca un turno; ocupada: lo lee entre herramientas. Llega como «mensaje de otra
sesión»: no aprueba permisos ni cambia configuración. Cuesta una llamada corta a Haiku por mensaje. Cada sesión destino tiene su propia cola (varias se entregan en
paralelo; a una sola, en orden) y el límite es 60 s. `claude 2.1.307` no trae un comando para mandar mensajes entre
sesiones sin pasar por un modelo (`claude agents` solo lista; las bandejas son sockets `cc-socks/<pid>.sock` sin
protocolo documentado): lo más rápido es tmux, que no usa LLM.

**Entre sesiones.** Los mensajes que una sesión recibe de otra (`<cross-session-message from-name=…>`, y
`<agent-message from=<sesión>>`; los de subagentes y los que entrega la propia oficina no cuentan) se guardan al llegar
el `UserPromptSubmit` en la tabla `entre_sesiones` (7 días) con quién, a quién, cuándo y el texto, y salen en
`entre_sesiones` de `/api/estado` (últimos 50) para dibujar el envío entre personajes. El origen se resuelve por pid
del socket, nombre o id de sesión; si no se conoce, `de_sesion` es `null` y `de` trae lo que dijo el mensaje.

**Tu oficina**: veredicto (al día / vence hoy / vencidas), agenda con Hoy primero y los próximos 6 días en columnas
(cada tarea se despliega), «Para ti» (@mención, comentario asignado, tu nombre en el texto o corrección de ficha;
casilla para ver todos) y el resumen del turno nocturno (carpeta `OFICINA_NOCHE_DIR` con `AAAA-MM-DD/resumen.md`, solo lectura).

**Te necesitan**: cola de agentes que esperan algo de ti con Responder y Ver ficha.

**Nueva sesión** (botón de la barra, o «Empezar sesión» en una tarea de tu agenda): eliges la tarea en un selector que
agrupa por cuándo vence (vencidas, hoy, mañana, esta semana…) y muestra hora de entrega, estado, prioridad, sprint y
horario de la ficha. Propone el worktree de la tarea (`git worktree list` de tus repos conocidos), `/agil <ID>` como
indicación y un nombre. Arranca `claude` con `CLICKUP_TASK=<ID>` dentro de **su propio tmux** (ver abajo); con
`OFICINA_LANZADOR=bg` vuelve a `claude --bg`. Permisos: auto, aceptar ediciones o manual; nunca `bypassPermissions`
desde la página. Si la carpeta no es de confianza, se abre una terminal adjunta para que aceptes el aviso.

**Sesiones en tmux: lo que escribes cuenta como tecleado.** Cada sesión que abre o retoma la oficina corre en un
servidor tmux propio (`tmux -L ov-<nombre>-<hex>`), lanzado con `systemd-run --user --scope`: un OOM o un cierre se
lleva solo esa sesión. `OFICINA_TMUX` liga la sesión con su socket (columna `sesiones.tmux`). Tus mensajes desde la
ficha se pegan en su terminal (bracketed paste + Enter), así que Claude Code los toma como tuyos: contestar «sí,
hazlo» o una duda funciona igual que en la terminal, sin el mensajero. Si tiene un diálogo abierto, la oficina no
teclea texto encima (409): la ficha muestra su pantalla (`tmux capture-pane`) y contestas con las teclas **1–4** o
**Esc**; no hay otras teclas permitidas. Ojo: elegir en la oficina es tan válido como elegir en la terminal, incluida
la opción de cambiar a modo auto. **Abrir en terminal** hace `tmux -L <socket> attach -t main`; a mano:
`tmux -L <socket> attach`. **Cerrar** hace `kill-server` (Claude Code guarda la conversación). Se teclea el texto que escribes en la ficha y, además,
los encargos y entregas entre sesiones (con su cabecera «Encargo de …»; ver «Roles y encargos»). `test/teclado.test.js` falla si otra fuente se conecta al teclado.

**Sin tarea y traspasos.** La tarea es opcional. En la ficha, **Continuar en sesión nueva** abre «Nueva sesión» con la
misma carpeta (y tarea, si tiene) y el último mensaje del agente como indicación: pídele antes un resumen de traspaso.
Cuando la sesión nueva arranca, la anterior se cierra sola (su conversación queda guardada).
«Dónde se abre»: en segundo plano (`claude --bg`) o en una **terminal nueva** interactiva (`xdg-terminal-exec claude …`),
útil si la carpeta aún no es de confianza para Claude Code (el aviso aparece ahí).

**Permisos.** El hook `PermissionRequest` solo informa (no decide): la ficha y «Te necesitan» muestran qué herramienta
pide permiso y con qué (p. ej. `Write` y la ruta). Si `claude agents` dice que la sesión espera (`waiting`), se queda en
Tu puerta aunque su transcript cambie.

**Aprobar o rechazar desde la oficina.** `hooks/permiso.sh` (hook `PermissionRequest`, timeout 910 s) manda la petición
a `POST /api/permisos`, que queda abierta hasta **15 minutos** (`OFICINA_PERMISO_ESPERA_MS`; el hook usa `OFICINA_PERMISO_ESPERA_S`).
Mientras espera, la terminal no muestra el diálogo: **Decidir en la terminal** lo suelta al momento. **Permitir siempre**
aprueba y guarda las reglas `allow` que el propio Claude Code sugirió (se muestran antes, con su destino), igual que la
opción 2 de su diálogo. En la ficha y en «Te necesitan» ves la herramienta y sus
datos (comando, archivo, contenido…) con una cuenta regresiva y los botones **Aprobar** / **Rechazar** (con motivo
opcional, que recibe el agente). Si no decides a tiempo, o si el servidor no responde, el hook sale sin respuesta y el
diálogo aparece en su terminal como siempre. La página solo aprueba o rechaza: nunca cambia la entrada de la
herramienta. Un mensaje desde la oficina no aprueba permisos: queda en cola.

**Quién puede mandar órdenes a la oficina.** Todo POST exige Host exacto, `application/json`, `Origin` propio (si viene)
y el header `X-Oficina-Token` con el token de este arranque. El servidor lo genera al iniciar y lo escribe en
`~/.local/share/oficina-virtual/token` (0600); la página lo recibe al cargarse y los hooks lo leen de ese archivo
(si el servidor no los acepta, `hook.sh` deja el evento en `pendientes.jsonl`). Tras reiniciar el servicio, recarga la
página. Cada mensaje que la oficina hace llegar a una sesión queda en `eventos` (7 días): `mensaje_oficina` si fue
por el mensajero, `teclado` si se tecleó en su tmux (texto o tecla).

**Preguntas con opciones.** Cuando un agente usa `AskUserQuestion`, `hooks/pregunta.sh` (hook `PreToolUse` con matcher
`AskUserQuestion`, timeout 910 s) la manda a `POST /api/preguntas`, que espera hasta **15 minutos**. La sesión pasa a
«Duda» y en su ficha ves cada pregunta con sus opciones como en la app (una o varias, más «Otra respuesta»). Al
responder, el hook devuelve `allow` + `updatedInput.answers` y el agente sigue sin diálogo en la terminal. Si no
respondes a tiempo o el servidor no está, la pregunta sale en su terminal como siempre.

**Orden de la conversación.** Tus mensajes y las respuestas van en una sola línea de tiempo por hora, como en un chat.
Un mensaje entregado se ve aparte («Entregado · lo lee entre pasos») solo hasta que aparece en el transcript.

**Cerrar sesión** (ficha del agente, con confirmación): las de segundo plano con `claude stop <id>`; las interactivas
(terminal o app) con SIGTERM a su proceso, solo si el pid sigue siendo de Claude Code. La conversación queda guardada
(`claude --resume <id>`). Las de tmux se cierran con `kill-server`. Las de segundo plano y las de tmux tienen además
**Abrir en terminal** (`claude attach <id>` o `tmux -L <socket> attach -t main`).

**Sesiones vivas**: cada 5 s `claude agents --json` da nombre, ocupada/libre y bandeja; crea las sesiones abiertas
antes de los hooks, ignora las de claude-mem y cierra las que ya no tienen proceso (20 s de margen).

**Notificaciones** (`notify-send`): una sesión pasa a necesita permiso, bloqueada, duda o te espera, o llega una
corrección nueva. Las del minuto siguiente se juntan; las urgentes no se cierran solas.

## Roles y encargos

Cinco roles fijos: `analisis-plan`, `implementacion`, `revision-qa`, `docs-entrega`, `diseno`. Cada uno es un `.md` en
`agentes/` con formato de subagente de Claude Code (tools mínimas, modelo, instrucciones y formato de salida;
`revision-qa` no edita, `implementacion` aplica diff mínimo, `docs-entrega` nunca agrega atribución de IA).

```bash
node scripts/instalar-agentes.js          # copia agentes/*.md a ~/.claude/agents/ sin pisar los existentes (como cp -n)
node scripts/instalar-agentes.js --quitar # quita solo los que siguen idénticos a los del repo
```

Como **sesión fija**: `POST /api/roles/:rol/encargo` con `{texto, de_sesion?, cwd?}` (texto ≤ 4000, rol de la lista fija,
`cwd` dentro de tu home). Si hay una sesión viva de ese rol (con ese `cwd`, si lo das; nunca la misma sesión que pide)
le entrega el encargo por la vía más rápida: tmux tecleado si su terminal está libre, si no el mensajero. Si no hay,
arranca una en su propio tmux (`cwd` explícito o el de `de_sesion`) con el cuerpo del `.md` como prompt de sistema
(`--append-system-prompt`), el encargo como primer mensaje y `OFICINA_ROL=<rol>`: `hook.sh` lo manda como `rol_env` y
la sesión queda marcada (`sesiones.rol`). El texto entregado empieza con «Encargo de <origen>: …» y pide que la
respuesta final empiece con `ENTREGA:`; cuando esa sesión termina el turno (Stop) así, el resultado vuelve a la sesión
de origen («Entrega de …») por la misma vía y el encargo pasa a `respondido`. Respuestas: 202 `{id, estado, via, sesion}`,
400 (rol/texto/cwd), 409 (ya está arrancando), 422 (no se pudo abrir), 502 (no se pudo entregar).

`commands/encargar.md` (`cp -n` a `~/.claude/commands/`): `/encargar <rol> <texto>` hace ese POST con el token. Esta ruta
acepta el token de los agentes **o** tu cookie; abrir la sesión de un rol sin encargo (`/sesion`) solo con tu cookie.
Ojo: a diferencia de `/api/solicitudes`, un encargo no pasa por tu aprobación: puede teclear en la terminal libre de otra
sesión y abrir una de rol (a lo más `acceptEdits`, nunca `bypassPermissions`). Queda en `eventos` (`teclado` / `mensaje_oficina`
con `de`) y no aprueba permisos. En `/api/estado`: `roles`, `encargos` (últimos 30), `Sesion.rol` y los envíos en `entre_sesiones`.

## Prioridad para los agentes (Fase 6)

- `GET /api/siguiente[?n=15]`: texto plano con las tareas abiertas por vencimiento (`[VENCIDA]`, `[HOY]`),
  horario y choque de la ficha, si ya hay un agente en ella y las correcciones/comentarios sin responder.
- `commands/siguiente.md` se copia a `~/.claude/commands/siguiente.md` (`cp -n`, no pisa uno existente).
  En cualquier sesión, `/siguiente` mete esa lista en el contexto y pide el plan en ese orden.

## Instalación y operación (Fase 7)

Requisitos: Node ≥ 22.13 (mise), `curl`, `jq`, `notify-send`. La página se compila una vez: `npm --prefix web install && npm run build`.

```bash
# 1. Token de ClickUp (solo lectura). Regenerarlo: ClickUp → avatar → Settings → Apps → API Token → Regenerate,
#    y reemplazar la línea en el .env; después reiniciar el servicio.
mkdir -p ~/.config/oficina-virtual && cp -n .env.example ~/.config/oficina-virtual/.env && chmod 600 ~/.config/oficina-virtual/.env   # no pisa uno existente; editar CLICKUP_TOKEN
# 2. Hooks de Claude Code (respalda ~/.claude/settings.json y fusiona)
node scripts/instalar-hooks.js
# 3. Comando /siguiente
cp -n commands/siguiente.md ~/.claude/commands/siguiente.md
# 3b. Comando /encargar y subagentes por rol
cp -n commands/encargar.md ~/.claude/commands/encargar.md
node scripts/instalar-agentes.js
# 4. Servicio de usuario (arranca al iniciar sesión y se reinicia si falla)
systemctl --user enable --now ~/Proyectos/Oficina-virtual/systemd/oficina-virtual.service
```

Desinstalar:

```bash
systemctl --user disable --now oficina-virtual
node scripts/instalar-hooks.js --quitar   # solo quita los hooks de la oficina, con respaldo
rm ~/.claude/commands/siguiente.md ~/.claude/commands/encargar.md
node scripts/instalar-agentes.js --quitar
```

Problemas comunes:

| Síntoma | Qué revisar |
|---|---|
| La página no carga | `systemctl --user status oficina-virtual` y `journalctl --user -u oficina-virtual -n 50` |
| Una sesión no aparece | ¿La sesión arrancó después de instalar los hooks? `jq '.hooks \| keys' ~/.claude/settings.json`. Con el servidor caído los eventos esperan en `~/.local/share/oficina-virtual/pendientes.jsonl` |
| "ClickUp: HTTP 401" arriba a la derecha | Token vencido o mal copiado: regenerarlo y `systemctl --user restart oficina-virtual` |
| Una sesión no se liga a su tarea | La tarea debe estar abierta y vencer en ≤ 30 días; si no, asígnala a mano en la página |
| No llegan notificaciones | `notify-send prueba` desde una terminal; el servicio usa el bus de la sesión (`/run/user/1000/bus`) |
| Cambié el código | `server/`: `systemctl --user restart oficina-virtual` (no recarga solo). `web/`: `npm run build` y recarga la página |
| «falta compilar la página» | `npm --prefix web install && npm run build` |
