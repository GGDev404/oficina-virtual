---
description: Qué sigue según los vencimientos de ClickUp (oficina virtual local)
allowed-tools: Bash(curl -s -m 3 http://127.0.0.1:4777/api/siguiente*)
---
Orden de prioridad de mis tareas abiertas, según la oficina virtual:

!`curl -s -m 3 http://127.0.0.1:4777/api/siguiente || echo "La oficina virtual no responde en 127.0.0.1:4777 (¿servidor apagado?)."`

Con esa lista:

1. Propón el plan empezando por lo que vence antes: primero VENCIDA, luego HOY y después en orden de fecha.
2. Respeta el «Horario» y los «Choque» de cada ficha: si dos tareas comparten archivos o migraciones, ponlas en secuencia y di por qué.
3. No dupliques trabajo: si una tarea dice «Ya hay un agente en ella», no la propongas para esta sesión salvo que yo lo pida.
4. Si hay una CORRECCIÓN o un comentario sin responder en una tarea, tenlo en cuenta en el plan y dime cuál hay que contestar.
5. Si la oficina no responde, dilo y no inventes prioridades.

$ARGUMENTS
