// /api/siguiente: vencidas primero, hoy marcado, y lo que cambia el plan de un agente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrir } from '../server/db.js';
import { siguiente } from '../server/siguiente.js';

test('orden por vencimiento con horario, choque, agente y comentarios pendientes', () => {
  const db = abrir(':memory:');
  const ahora = new Date(2026, 9, 20, 12, 0).getTime();
  const h = 3600_000;
  const tarea = db.prepare(`INSERT INTO tareas (id, nombre, estado, due_ts, lista, url, horario, choque) VALUES (?, ?, 'en espera', ?, 'Sprint 02', ?, ?, ?)`);
  tarea.run('k7p2jvu77', 'Entregas parciales', ahora + 30 * h, 'u1', null, null);
  tarea.run('k7p2tfedd', 'Requisición: filtro', ahora + 3 * h, 'u2', 'mar 20, 14:00–18:00', 'comparte el editor de líneas');
  tarea.run('k7p2tfedr', 'Factura con recepción', ahora - 2 * h, 'u3', null, null);
  db.prepare(`INSERT INTO sesiones (id, cwd, rama_git, tarea_id, estado, estado_desde_ts, ultimo_evento_ts, iniciada_ts)
              VALUES ('s1', '/wt/k7p2tfedr', 'feature/x-k7p2tfedr', 'k7p2tfedr', 'trabajando', 0, 0, 0)`).run();
  const com = db.prepare(`INSERT INTO comentarios (id, tarea_id, autor, texto, ts, es_mio, respondido, visto_local, tipo) VALUES (?, ?, 'Ana', ?, 1, 0, ?, ?, ?)`);
  com.run('c1', 'k7p2tfedd', 'CORRECCIÓN a mi ficha: sólo el filtro', 0, 0, 'correccion');
  com.run('c2', 'k7p2tfedd', 'FICHA TÉCNICA · HORARIO VIGENTE: mar 20', 0, 0, 'ficha');
  com.run('c3', 'k7p2tfedd', 'ya respondido', 1, 0, 'otro');
  com.run('c4', 'k7p2tfedd', 'marcado visto', 0, 1, 'otro');

  const txt = siguiente(db, { ahora, sync: { ultima_ts: ahora } });
  const ids = [...txt.matchAll(/^\d+\. (?:\[\w+\] )?(\w+)/gm)].map((m) => m[1]);
  assert.deepEqual(ids, ['k7p2tfedr', 'k7p2tfedd', 'k7p2jvu77']);
  assert.match(txt, /^1\. \[VENCIDA\] k7p2tfedr/m);
  assert.match(txt, /^2\. \[HOY\] k7p2tfedd/m);
  assert.match(txt, /^3\. k7p2jvu77/m);
  assert.match(txt, /Ya hay un agente en ella: trabajando en \/wt\/k7p2tfedr \(rama feature\/x-k7p2tfedr\)/);
  assert.match(txt, /Horario: mar 20, 14:00–18:00\n   Choque: comparte el editor de líneas/);
  assert.match(txt, /CORRECCIÓN sin responder de Ana: CORRECCIÓN a mi ficha: sólo el filtro/);
  assert.doesNotMatch(txt, /FICHA TÉCNICA|ya respondido|marcado visto/);
  assert.match(siguiente(abrir(':memory:')), /SIN SINCRONIZAR[\s\S]*No hay tareas abiertas/);
});
