#!/usr/bin/env bash
# Hook de Claude Code: manda el evento a la oficina. Si el servidor no responde, lo deja en
# pendientes.jsonl y el servidor lo procesa después.
# Nunca bloquea ni rompe a Claude: sin stdout, timeouts cortos, siempre exit 0.
ev="${1:-desconocido}"
dir="${OFICINA_DATOS:-$HOME/.local/share/oficina-virtual}"
{
  # CLICKUP_TASK=<id> al lanzar la sesión la liga a esa tarea (el hook hereda el entorno de Claude).
  linea=$(timeout 1 cat | timeout 1 jq -c --arg ts "$(date +%FT%T.%3N%:z)" --arg ev "$ev" \
    --arg tarea "${CLICKUP_TASK:-}" --arg tmux "${OFICINA_TMUX:-}" --arg rol "${OFICINA_ROL:-}" \
    '{ts:$ts, evento:$ev, payload:.} + (if $tarea != "" then {tarea_env:$tarea} else {} end)
      + (if $tmux != "" then {tmux_env:$tmux} else {} end) + (if $rol != "" then {rol_env:$rol} else {} end)') || exit 0
  printf '%s' "$linea" | curl -sf -H "X-Oficina-Token: $(cat "${OFICINA_DATOS:-$HOME/.local/share/oficina-virtual}/token" 2>/dev/null)" -m 1 -H 'Content-Type: application/json' --data-binary @- \
    http://127.0.0.1:4777/api/eventos \
    || { mkdir -p "$dir"; printf '%s\n' "$linea" >> "$dir/pendientes.jsonl"; }
} >/dev/null 2>&1
exit 0
