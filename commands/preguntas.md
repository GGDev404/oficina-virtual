---
description: Repasa las preguntas pendientes (registro del vault) y ayúdame a contestarlas o enviarlas (oficina virtual local)
allowed-tools: Bash(curl -s -m 3 http://127.0.0.1:4777/api/registro-preguntas*), Read, Grep, Glob, Edit
---
Preguntas del registro (`OFICINA_PREGUNTAS`, tabla `preguntas.md` del vault), según la oficina virtual:

!`curl -s -m 3 http://127.0.0.1:4777/api/registro-preguntas || echo "La oficina virtual no responde en 127.0.0.1:4777 (¿servidor apagado?)."`

Ayúdame a resolverlas, empezando por las que bloquean:

1. **Las que decido yo (`por responder`).** Una por una: lee las notas de su columna Fuente (y la ficha o el plano 1.7.1 si hace falta) y dame en 3–5 líneas el contexto, las opciones y tu recomendación con el porqué. Espera mi respuesta antes de pasar a la siguiente.
2. **Las que hay que enviar (`por enviar`).** Agrúpalas por persona y redacta el mensaje listo para copiar, en mi voz (primera persona, breve, sin mencionar agentes ni herramientas). No digas que se envió: eso lo marco yo en la oficina con «Ya las envié».
3. **Las que esperan respuesta (`enviada`)** con más de 3 días: dímelas para dar seguimiento.
4. **Guardar una respuesta** que te dé: edita solo esa fila de `preguntas.md` (columnas Estado = `respondida`, Respuesta y Respondida = fecha de hoy AAAA-MM-DD). Una fila por línea, sin `|` dentro de las celdas. Una pregunta nueva lleva la columna Módulo (`MOD-…`). Nunca borres preguntas. Si la respuesta cambia una decisión, dime en qué expediente o plan hay que anotarla.
5. Si la oficina no responde, dilo y no inventes preguntas.

$ARGUMENTS
