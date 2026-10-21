# Plan: office input that counts as terminal input

Status (2026-10-21): Phases 1, 3 and 2 implemented and verified end to end (Phase 2 approved by Geovany in manual
permission mode after the auto-mode classifier flagged it as an auto-mode bypass). Not committed.

## Problem

Messages sent from the office reach a session through `SendMessage` (the one-shot `claude -p` "mensajero").
Claude Code treats them as messages from another session, never as the user's own input. Consequences:

1. Writing "yes, do it" from the office does not approve anything (auto-mode denials, agent questions).
2. Permission requests can be approved from the office card only for 120 s (`ESPERA_MS`); after that the
   dialog moves to the terminal and the office can no longer resolve it.
3. There is no "always allow" option in the office; only allow/deny once.

Goal: what Geovany types in the office reaches the session exactly as if typed in its terminal, and
permission prompts can be fully handled from the office, without weakening the safety model.

Non-goals: `bypassPermissions`, auto-approving anything, forwarding text that did not come from Geovany.

## Ground rules for every task

- Each task is one small diff plus its test; `npm test` must stay green after every task.
- Any change to `~/.claude/settings.json` (hooks, timeouts) is applied only after Geovany confirms it
  **typed directly in a terminal session**, not from an office message.
- Phase 3 (token + origin check) must be deployed **before** Phase 2's keystroke route is enabled.
- No commits without Geovany's explicit permission.

Recommended order: Phase 1 → Phase 3 → Phase 2.

---

## Phase 1: permission prompts that do not expire, plus "always allow"

### T1.1 Make the office wait time configurable and longer
- Files: `server/permisos.js`.
- Change `export const ESPERA_MS = 120_000;` to
  `export const ESPERA_MS = Number(process.env.OFICINA_PERMISO_ESPERA_MS ?? 15 * 60_000);`
- Keep the existing behavior: when time runs out, respond `null` so Claude Code shows its normal dialog.
- Test: `crearPermisos` with an injected `reloj` still closes with `null` after `espera` ms (existing test
  pattern), and the default is 900 000 ms when the env var is unset.

### T1.2 Align the hook's HTTP timeout
- Files: `hooks/permiso.sh`.
- Change `curl -sf -m 125` to read the same budget: `-m "${OFICINA_PERMISO_ESPERA_S:-905}"`
  (server wait + 5 s margin).
- Test: manual. Run the hook with a fake payload against a server started with
  `OFICINA_PERMISO_ESPERA_MS=3000` and confirm it exits 0 with empty output after ~3 s.

### T1.3 Raise the Claude Code hook timeout (needs terminal confirmation)
- Files: `~/.claude/settings.json`, entry `PermissionRequest` → `permiso.sh`, `timeout: 130`.
- Change to `timeout: 910` (hook budget + margin). Without this, Claude Code kills the hook at 130 s
  regardless of T1.1/T1.2.
- Also update the matching line in `README.md` (install section) so new installs get the same value.
- Acceptance: a permission request left untouched for 5 min is still pending in the office and can be
  approved there.

### T1.4 "Decide in the terminal" button
- Why: while the hook waits, the terminal shows no dialog. With a 15-min wait, Geovany needs a way to
  release the prompt to the terminal on demand.
- Files: `server/index.js`, `public/index.html`.
- Add `POST /api/permisos/:id/terminal` → `permisos.abandonar(id)`; 404 if not pending.
- In `decisionPermiso()` add a secondary button "Decidir en la terminal".
- Test: route returns 204 and the pending list no longer contains the id; the hook receives `null`.

### T1.5 Keep Claude Code's permission suggestions with each pending request
- Files: `server/permisos.js`.
- In `pedir()`, store `sugerencias`: only items of `payload.permission_suggestions` with
  `type === 'addRules'` and `behavior === 'allow'`. Drop `addDirectories`, `setMode` and anything else.
- Expose a readable summary in `lista()`: `reglas: ['Bash(npx vitest *)', ...]` (toolName + ruleContent).
- Never accept rules from the page; the page only says "use the suggestions Claude Code offered".
- Test: given a payload with mixed suggestions, `lista()` shows only the allow `addRules` ones.

### T1.6 "Always allow" decision
- Files: `server/permisos.js`, `server/index.js`.
- Verify first against the current Claude Code hooks docs the exact field name for persisting rules
  from a `PermissionRequest` hook (expected: `decision.updatedPermissions`). If it does not exist, stop
  and report; do not write settings files directly.
- Extend `decidir(id, behavior, motivo, { siempre })`: when `siempre === true` and `behavior === 'allow'`,
  include the stored `sugerencias` as `updatedPermissions`.
- Route `POST /api/permisos/:id` accepts `{ decision: 'allow', siempre: true }`; reject `siempre` with deny.
- Test: `decisionHook` output contains the exact suggestion objects; `siempre` with no suggestions → 400.

### T1.7 UI for "always allow"
- Files: `public/index.html` (`decisionPermiso`).
- When `p.reglas.length > 0`, show a third button "Permitir siempre" and, under it, the rules in
  monospace so Geovany sees exactly what will be saved and where (`localSettings` of that project).
- Acceptance: approving `npx vitest run` with "Permitir siempre" stops future prompts for `npx vitest *`
  in that project.

---

## Phase 3: lock down the office (before Phase 2)

### T3.1 Per-boot secret token
- Files: `server/index.js`.
- On startup generate `crypto.randomBytes(32).toString('hex')`, write it to
  `~/.local/share/oficina-virtual/token` with mode `0600`.
- Serve `index.html` with the token injected in `<meta name="oficina-token" content="...">`.
- Test: the token file exists with mode 600 after startup.

### T3.2 Require the token on every POST
- Files: `server/index.js`, `public/index.html` (`post()` helper), `hooks/*.sh`.
- Reject any POST without header `X-Oficina-Token` equal to the token (403).
- Page: `post()` adds the header from the meta tag.
- Hooks: read the token file and send the header; if the file is missing, exit 0 silently (Claude Code
  falls back to its normal behavior).
- Test: POST without token → 403; with token → existing behavior.

### T3.3 Origin check
- Files: `server/index.js`.
- For POST requests with an `Origin` header, accept only `http://127.0.0.1:4777` and
  `http://localhost:4777`; otherwise 403. Requests without `Origin` (hooks, curl) rely on the token.
- Test: POST with `Origin: https://evil.example` and a valid token → 403.

### T3.4 Audit log of injected input
- Files: `server/index.js`.
- Every text or key sent to a session (Phase 2) is stored in `eventos` with `tipo = 'teclado'`,
  `sesion_id`, and the text (truncated to 4000 chars).
- Test: after a send, one `teclado` event exists for that session.

### T3.5 Only Geovany's typed text may be injected
- Files: `server/index.js`, `test/`.
- The keystroke path is reachable only from `POST /api/sesiones/:id/mensaje`. No code path may pass
  ClickUp comments, transcripts, agent output or notification text into it.
- Add a test that greps `server/` and fails if `enviarTexto(` (T2.3) is called from anywhere but the
  `/mensaje` route.

---

## Phase 2: office sessions run inside tmux, and messages are typed into them

tmux 3.7c is installed at `/usr/bin/tmux`.

### T2.1 One tmux server per session, inside its own systemd scope
- Files: new `server/tmux.js`.
- `socketDe(nombre)`: `ov-` + slug of the session name (ASCII letters, digits and `-`, max 40) + 4 random
  hex chars. One socket per session (`tmux -L <socket>`) so each tmux server, and every process under it,
  lives in its own scope. A shared tmux server would put all sessions in one cgroup again, which is the
  same problem we hit with the `claude --bg` daemon.
- `lanzar({ socket, cwd, env, args })` runs, through `enScope(spawn)`:
  `tmux -L <socket> new-session -d -s main -c <cwd> -e CLICKUP_TASK=<id> -e OFICINA_TMUX=<socket> claude <args>`.
- Test: with an injected launcher, the exact argv matches; names with spaces or accents are slugged.

### T2.2 Link the Claude session to its tmux socket
- Files: `hooks/hook.sh`, `server/estados.js`, `server/db.js`.
- `hook.sh`: when `OFICINA_TMUX` is set, add `tmux_env` to the event JSON (same pattern as `CLICKUP_TASK`
  → `tarea_env`).
- `db.js`: new column `sesiones.tmux TEXT`.
- `estados.js` (`SessionStart`): store `tmux_env` in `sesiones.tmux`.
- Test: a `SessionStart` event with `tmux_env` sets the column.

### T2.3 Type text into a session
- Files: `server/tmux.js`.
- `enviarTexto(socket, texto)`:
  1. `tmux -L <socket> load-buffer -b ov -` with `texto` on stdin (no shell, no escaping issues);
  2. `tmux -L <socket> paste-buffer -p -d -b ov -t main` (`-p` = bracketed paste, so newlines do not
     submit early);
  3. `tmux -L <socket> send-keys -t main Enter`.
- `enviarTecla(socket, tecla)`: allow-list only `1`-`9`, `Enter`, `Escape`, `Up`, `Down`.
- Test: with an injected `execFile`, the three calls happen in order with the right argv; disallowed keys throw.

### T2.4 Route messages through tmux when available
- Files: `server/index.js` (`POST /api/sesiones/:id/mensaje`).
- If `sesiones.tmux` is set and the tmux socket answers `tmux -L <socket> has-session -t main`:
  - if the session is in `necesita_permiso`, `duda`, or `vivas.esperando`, reply 409 "tiene un diálogo
    abierto; usa los botones del diálogo" (never type text over a dialog);
  - otherwise `enviarTexto` (T2.3), log it (T3.4), mark the message `entregado`, reply 202.
- Else: keep the current mensajero path unchanged (terminal and Claude Desktop sessions).
- Drop the `AVISO_RESPUESTA` suffix for tmux deliveries (the reply naturally lands in the session).
- Test: tmux session → tmux path; no tmux → mensajero; dialog open → 409.

### T2.5 Answer terminal dialogs from the office
- Files: `server/tmux.js`, `server/index.js`, `public/index.html`.
- `capturar(socket)`: `tmux -L <socket> capture-pane -p -t main -S -25` → last 25 lines.
- `GET /api/sesiones/:id/pantalla` returns them (only for tmux sessions).
- `POST /api/sesiones/:id/tecla { tecla }` → `enviarTecla` (allow-list from T2.3), logged.
- UI: when a tmux session is `necesita_permiso` and no hook decision is pending (the hook already timed
  out), show the captured screen and buttons "1", "2", "3", "Esc".
- Acceptance: a prompt that fell back to the terminal can be answered from the office.

### T2.6 Launch new and resumed sessions in tmux
- Files: `server/control.js`, `server/index.js`.
- `nuevaSesion` builds the same Claude args as today **without** `--bg` and launches via T2.1.
  Keep `claude --bg` behind `OFICINA_LANZADOR=bg` as a fallback switch.
- "Retomar" (Pendientes) uses the same launcher with `--resume <id>`.
- Untrusted folders: tmux shows Claude Code's trust prompt inside the pane; the office surfaces it through
  T2.5 instead of failing like `--bg` does today.
- Test: argv for new and resumed sessions; `OFICINA_LANZADOR=bg` keeps the old path.

### T2.7 Open and close tmux sessions
- Files: `server/control.js`.
- "Abrir terminal": `xdg-terminal-exec tmux -L <socket> attach -t main` (via `enScope`).
- "Cerrar": `tmux -L <socket> kill-server` (Claude Code receives SIGHUP; the conversation is saved).
- Test: argv for both.

### T2.8 Detect tmux sessions as alive
- Files: `server/vivas.js`.
- Interactive sessions in tmux already appear in `claude agents --json` with a pid. Verify this during
  implementation; if they do not, add a fallback that lists `ov-*` sockets in
  `/tmp/tmux-$UID/` and matches them by `sesiones.tmux`.
- Test: covered by existing `aplicarVivas` tests plus one with a tmux-backed session.

### T2.9 Documentation
- Files: `README.md`.
- Explain: office sessions run in tmux; how to attach by hand (`tmux -L <socket> attach`); that office
  messages now count as typed input; the token file; how to fall back with `OFICINA_LANZADOR=bg`.

---

## Risks and how the plan handles them

| Risk | Mitigation |
|---|---|
| Any local process could drive agents with Geovany's authority | T3.1–T3.3 token + origin check, deployed before T2.4 |
| Prompt injection: text from ClickUp/agents turned into "user" input | T3.5 single entry point + test |
| Typing text over an open dialog answers it by accident | T2.4 returns 409 while a dialog is open; dialogs only via T2.5 allow-listed keys |
| All sessions die together under OOM | T2.1 one tmux server per session, each in its own scope |
| Long hook wait blocks the terminal dialog | T1.4 "Decidir en la terminal" button |
| "Always allow" saves broader rules than intended | T1.5 only Claude Code's own `addRules` suggestions, shown verbatim before saving |
