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
Si el servidor no responde, `hook.sh` deja el evento en `pendientes.jsonl` y el servidor lo procesa al arrancar y cada 5 s.

| Endpoint | Uso |
|---|---|
| `POST /api/eventos` | lo llama `hook.sh` con `{ts, evento, payload}` |
| `GET /api/estado` | sesiones (las cerradas, solo 2 h), subagentes, tareas y comentarios |
| `GET /api/stream` | SSE `event: estado` con el estado completo en cada cambio |
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

`http://127.0.0.1:4777`: un solo `public/index.html` sin compilación ni imágenes externas, en vivo por SSE.

**Vista general.** La oficina en pixel art ocupa la pantalla y debajo van cuatro tarjetas de un solo ítem:
Te necesitan · Hoy (o «Al día») · Para ti · Próximo corte (daily 9:00, seguimientos 9:35/13:35/17:35,
integración a develop 13:00 y 18:00). Cada sesión es un personaje con su nombre real y su cuarto es su estado:

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
sesión»: no aprueba permisos ni cambia configuración. Cuesta una llamada corta a Haiku por mensaje.

**Tu oficina**: veredicto (al día / vence hoy / vencidas), agenda con Hoy primero y los próximos 6 días en columnas
(cada tarea se despliega), «Para ti» (@mención, comentario asignado, tu nombre en el texto o corrección de ficha;
casilla para ver todos) y el resumen del turno nocturno (carpeta `OFICINA_NOCHE_DIR` con `AAAA-MM-DD/resumen.md`, solo lectura).

**Te necesitan**: cola de agentes que esperan algo de ti con Responder y Ver ficha.

**Nueva sesión** (botón de la barra, o «Empezar sesión» en una tarea de tu agenda): eliges la tarea en un selector que
agrupa por cuándo vence (vencidas, hoy, mañana, esta semana…) y muestra hora de entrega, estado, prioridad, sprint y
horario de la ficha. Propone el worktree de la tarea (`git worktree list` de tus repos conocidos), `/agil <ID>` como
indicación y un nombre. Arranca con `claude --bg` y `CLICKUP_TASK=<ID>` en la carpeta elegida (debe ser de confianza
para Claude Code). Permisos: auto, aceptar ediciones o manual; nunca `bypassPermissions` desde la página.

**Sin tarea y traspasos.** La tarea es opcional. En la ficha, **Continuar en sesión nueva** abre «Nueva sesión» con la
misma carpeta (y tarea, si tiene) y el último mensaje del agente como indicación: pídele antes un resumen de traspaso.
Cuando la sesión nueva arranca, la anterior se cierra sola (su conversación queda guardada).
«Dónde se abre»: en segundo plano (`claude --bg`) o en una **terminal nueva** interactiva (`xdg-terminal-exec claude …`),
útil si la carpeta aún no es de confianza para Claude Code (el aviso aparece ahí).

**Permisos.** El hook `PermissionRequest` solo informa (no decide): la ficha y «Te necesitan» muestran qué herramienta
pide permiso y con qué (p. ej. `Write` y la ruta). Si `claude agents` dice que la sesión espera (`waiting`), se queda en
Tu puerta aunque su transcript cambie.

**Aprobar o rechazar desde la oficina.** `hooks/permiso.sh` (hook `PermissionRequest`, timeout 130 s) manda la petición
a `POST /api/permisos`, que queda abierta hasta **2 minutos**. En la ficha y en «Te necesitan» ves la herramienta y sus
datos (comando, archivo, contenido…) con una cuenta regresiva y los botones **Aprobar** / **Rechazar** (con motivo
opcional, que recibe el agente). Si no decides a tiempo, o si el servidor no responde, el hook sale sin respuesta y el
diálogo aparece en su terminal como siempre. La página solo aprueba o rechaza: nunca cambia la entrada de la
herramienta. Ojo: cualquier programa de tu equipo que hable con 127.0.0.1:4777 podría aprobar; los sitios web no
(Host exacto y `application/json`). Un mensaje desde la oficina no aprueba permisos: queda en cola.

**Cerrar sesión** (ficha del agente, con confirmación): las de segundo plano con `claude stop <id>`; las interactivas
(terminal o app) con SIGTERM a su proceso, solo si el pid sigue siendo de Claude Code. La conversación queda guardada
(`claude --resume <id>`). Las de segundo plano tienen además **Abrir en terminal** (`xdg-terminal-exec claude attach <id>`).

**Sesiones vivas**: cada 5 s `claude agents --json` da nombre, ocupada/libre y bandeja; crea las sesiones abiertas
antes de los hooks, ignora las de claude-mem y cierra las que ya no tienen proceso (20 s de margen).

**Notificaciones** (`notify-send`): una sesión pasa a necesita permiso, bloqueada, duda o te espera, o llega una
corrección nueva. Las del minuto siguiente se juntan; las urgentes no se cierran solas.

## Prioridad para los agentes (Fase 6)

- `GET /api/siguiente[?n=15]`: texto plano con las tareas abiertas por vencimiento (`[VENCIDA]`, `[HOY]`),
  horario y choque de la ficha, si ya hay un agente en ella y las correcciones/comentarios sin responder.
- `commands/siguiente.md` se copia a `~/.claude/commands/siguiente.md` (`cp -n`, no pisa uno existente).
  En cualquier sesión, `/siguiente` mete esa lista en el contexto y pide el plan en ese orden.

## Instalación y operación (Fase 7)

Requisitos: Node ≥ 22.13 (mise), `curl`, `jq`, `notify-send`.

```bash
# 1. Token de ClickUp (solo lectura). Regenerarlo: ClickUp → avatar → Settings → Apps → API Token → Regenerate,
#    y reemplazar la línea en el .env; después reiniciar el servicio.
mkdir -p ~/.config/oficina-virtual && cp -n .env.example ~/.config/oficina-virtual/.env && chmod 600 ~/.config/oficina-virtual/.env   # no pisa uno existente; editar CLICKUP_TOKEN
# 2. Hooks de Claude Code (respalda ~/.claude/settings.json y fusiona)
node scripts/instalar-hooks.js
# 3. Comando /siguiente
cp -n commands/siguiente.md ~/.claude/commands/siguiente.md
# 4. Servicio de usuario (arranca al iniciar sesión y se reinicia si falla)
systemctl --user enable --now ~/Proyectos/Oficina-virtual/systemd/oficina-virtual.service
```

Desinstalar:

```bash
systemctl --user disable --now oficina-virtual
node scripts/instalar-hooks.js --quitar   # solo quita los hooks de la oficina, con respaldo
rm ~/.claude/commands/siguiente.md
```

Problemas comunes:

| Síntoma | Qué revisar |
|---|---|
| La página no carga | `systemctl --user status oficina-virtual` y `journalctl --user -u oficina-virtual -n 50` |
| Una sesión no aparece | ¿La sesión arrancó después de instalar los hooks? `jq '.hooks \| keys' ~/.claude/settings.json`. Con el servidor caído los eventos esperan en `~/.local/share/oficina-virtual/pendientes.jsonl` |
| "ClickUp: HTTP 401" arriba a la derecha | Token vencido o mal copiado: regenerarlo y `systemctl --user restart oficina-virtual` |
| Una sesión no se liga a su tarea | La tarea debe estar abierta y vencer en ≤ 30 días; si no, asígnala a mano en la página |
| No llegan notificaciones | `notify-send prueba` desde una terminal; el servicio usa el bus de la sesión (`/run/user/1000/bus`) |
| Cambié el código | `systemctl --user restart oficina-virtual` (no recarga solo) |
