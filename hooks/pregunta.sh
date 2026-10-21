#!/usr/bin/env bash
# Hook PreToolUse de AskUserQuestion: manda la pregunta a la oficina y espera tu respuesta hasta 15 min.
# Si contestas a tiempo, imprime allow + updatedInput con tus respuestas y Claude Code no muestra el diálogo.
# Si no contestas, si el servidor no responde o algo falla, sale sin imprimir nada y la pregunta sale en su
# terminal como siempre. Siempre exit 0.
{
  linea=$(timeout 1 cat | timeout 1 jq -c --arg ts "$(date +%FT%T.%3N%:z)" --arg tarea "${CLICKUP_TASK:-}" \
    '{ts:$ts, evento:"PreToolUse", payload:.} + (if $tarea != "" then {tarea_env:$tarea} else {} end)') || exit 0
  respuesta=$(printf '%s' "$linea" | curl -sf -H "X-Oficina-Token: $(cat "${OFICINA_DATOS:-$HOME/.local/share/oficina-virtual}/token" 2>/dev/null)" -m 905 -H 'Content-Type: application/json' --data-binary @- \
    http://127.0.0.1:4777/api/preguntas) || exit 0
} 2>/dev/null
# Solo se imprime una respuesta válida; cualquier otra cosa se descarta.
printf '%s' "$respuesta" | jq -ce 'select(.hookSpecificOutput.permissionDecision == "allow" and (.hookSpecificOutput.updatedInput.answers | type) == "object")' 2>/dev/null
exit 0
