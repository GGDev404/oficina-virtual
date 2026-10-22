---
description: Contesta la DUDA o el BLOQUEO de un rol al que le encargaste trabajo (oficina virtual local)
argument-hint: <id del encargo> <respuesta>
allowed-tools: Bash(jq -n *), Bash(curl -s -m 30 *)
---
Argumentos: `$ARGUMENTS` (la primera palabra es el número de encargo; el resto, la respuesta).

1. Si falta el número o la respuesta, dilo y no llames a nada.
2. Manda la respuesta. Arma el JSON con `jq` (nunca pegues el texto dentro del comando de shell):

```bash
jq -n --arg texto "<respuesta>" --arg de "${CLAUDE_CODE_SESSION_ID:-}" \
  '{texto:$texto} + (if $de != "" then {de_sesion:$de} else {} end)' \
| curl -s -m 30 -H 'Content-Type: application/json' -H "X-Oficina-Token: $(cat ~/.local/share/oficina-virtual/token)" \
    --data-binary @- http://127.0.0.1:4777/api/encargos/<id>/respuesta
```

3. La respuesta le llega a la sesión del rol y sigue con el encargo; su `ENTREGA:` te llegará como siempre. Si responde `error`, dilo tal cual y no reintentes en bucle.
