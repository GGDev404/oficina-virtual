#!/usr/bin/env bash
# Hook PermissionRequest de Claude Code: pregunta a la oficina y espera tu decisión hasta 2 min.
# Si decides a tiempo, imprime la decisión (allow/deny) que Claude Code aplica. Si no decides, si el servidor
# no responde o algo falla, sale sin imprimir nada y Claude Code muestra su diálogo de siempre. Siempre exit 0.
{
  linea=$(timeout 1 cat | timeout 1 jq -c --arg ts "$(date +%FT%T.%3N%:z)" --arg tarea "${CLICKUP_TASK:-}" \
    '{ts:$ts, evento:"PermissionRequest", payload:.} + (if $tarea != "" then {tarea_env:$tarea} else {} end)') || exit 0
  respuesta=$(printf '%s' "$linea" | curl -sf -m 125 -H 'Content-Type: application/json' --data-binary @- \
    http://127.0.0.1:4777/api/permisos) || exit 0
} 2>/dev/null
# Solo se imprime una decisión válida; cualquier otra cosa se descarta.
printf '%s' "$respuesta" | jq -ce 'select(.hookSpecificOutput.decision.behavior == "allow" or .hookSpecificOutput.decision.behavior == "deny")' 2>/dev/null
exit 0
