---
description: Encarga trabajo a la sesión de un rol (oficina virtual local) y recibe su ENTREGA
argument-hint: <rol> <texto del encargo>
allowed-tools: Bash(jq -n *), Bash(curl -s -m 30 *)
---
Roles: `analisis-plan`, `implementacion`, `revision-qa`, `docs-entrega`, `diseno`.

Argumentos: `$ARGUMENTS` (la primera palabra es el rol; el resto, el encargo).

1. Si el rol no es uno de la lista o falta el texto, dilo y no llames a nada.
2. Manda el encargo a la oficina. Arma el JSON con `jq` (nunca pegues el texto dentro del comando de shell) y usa el token de la oficina:

```bash
jq -n --arg texto "<texto del encargo>" --arg de "${CLAUDE_CODE_SESSION_ID:-}" --arg cwd "$PWD" \
  '{texto:$texto, cwd:$cwd} + (if $de != "" then {de_sesion:$de} else {} end)' \
| curl -s -m 30 -H 'Content-Type: application/json' -H "X-Oficina-Token: $(cat ~/.local/share/oficina-virtual/token)" \
    --data-binary @- http://127.0.0.1:4777/api/roles/<rol>/encargo
```

3. La oficina entrega el encargo a la sesión viva de ese rol (o arranca una en esta carpeta) y responde `{id, estado, via, sesion}`. Si responde `error`, dilo tal cual y no reintentes en bucle.
4. Sigue con lo tuyo: cuando esa sesión termine, la oficina te reenvía el resultado como un mensaje «Entrega de …». No esperes con sleep ni consultes en bucle.
