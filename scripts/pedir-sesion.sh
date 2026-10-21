#!/usr/bin/env bash
# Para agentes: pide a la oficina abrir otra sesión. NO la abre: queda como solicitud y Geovany la abre o la rechaza
# desde la página. Uso:
#   pedir-sesion.sh "<nombre>" "<indicación>" [carpeta] [permiso: manual|acceptEdits|auto] [tarea ClickUp]
# Por omisión: carpeta actual y permiso manual.
set -euo pipefail
nombre="${1:?falta el nombre}"; prompt="${2:?falta la indicación}"
cwd="$(readlink -f "${3:-$PWD}")"; permiso="${4:-manual}"; tarea="${5:-${CLICKUP_TASK:-}}"
token="$(cat "${OFICINA_DATOS:-$HOME/.local/share/oficina-virtual}/token")"
jq -cn --arg n "$nombre" --arg p "$prompt" --arg c "$cwd" --arg m "$permiso" --arg t "$tarea" --arg s "${CLAUDE_SESSION_ID:-}" \
  '{nombre:$n, prompt:$p, cwd:$c, permiso:$m} + (if $t != "" then {tarea_id:$t} else {} end) + (if $s != "" then {de_sesion:$s} else {} end)' \
| curl -sS -m 5 -H 'Content-Type: application/json' -H "X-Oficina-Token: $token" --data-binary @- http://127.0.0.1:4777/api/solicitudes
echo
