// Ligado sesión → tarea con las ramas y worktrees reales del ERP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrir } from '../server/db.js';
import { aplicar } from '../server/estados.js';
import { ligar, religarTodas } from '../server/tarea-link.js';

const ERP = '/home/dev/proyectos/mi-erp';
const TAREAS = ['k7p2tfedr', 'k7p2tfedd', 'k7p2jvu77', 'k7p2qcgyn'];
const T0 = Date.parse('2026-10-20T12:00:00-06:00');

function base(tareas = TAREAS) {
  const db = abrir(':memory:');
  for (const id of tareas) db.prepare('INSERT INTO tareas (id, nombre) VALUES (?, ?)').run(id, id);
  return db;
}
// Sesión con SessionStart en `cwd` (la rama la da el stub, como git) y prompts opcionales.
function sesion(db, sid, { cwd = ERP, rama = 'feature/sprint-general', prompts = [], env = null } = {}) {
  aplicar(db, { evento: 'SessionStart', ts: T0, payload: { session_id: sid, cwd, source: 'startup' } }, { rama: () => rama });
  ligar(db, sid, env);
  prompts.forEach((prompt, i) => {
    aplicar(db, { evento: 'UserPromptSubmit', ts: T0 + i + 1, payload: { session_id: sid, cwd, prompt } });
    ligar(db, sid, env);
  });
  return db.prepare('SELECT tarea_id, tarea_origen FROM sesiones WHERE id = ?').get(sid);
}
const ligada = (r) => ({ tarea_id: r.tarea_id, tarea_origen: r.tarea_origen });

test('rama con el ID al final', () => {
  assert.deepEqual(ligada(sesion(base(), 's1', { rama: 'feature/factura-cfdi-duplicado-recepcion-k7p2tfedr' })),
    { tarea_id: 'k7p2tfedr', tarea_origen: 'rama' });
});

test('worktree con HEAD separado: se liga por la carpeta', () => {
  assert.deepEqual(ligada(sesion(base(), 's2', { cwd: `${ERP}.worktrees/k7p2tfedd`, rama: null })),
    { tarea_id: 'k7p2tfedd', tarea_origen: 'carpeta' });
});

test('prompt con /agil <ID>, URL o CU-; los mensajes de sistema no cuentan', () => {
  assert.deepEqual(ligada(sesion(base(), 's3', { prompts: [
    '<task-notification><summary>Corregir huecos k7p2tfedr</summary></task-notification>',
    'hola, revisa el build',
    '/agil k7p2jvu77',
  ] })), { tarea_id: 'k7p2jvu77', tarea_origen: 'prompt' });
  assert.equal(sesion(base(), 's4', { prompts: ['mira https://app.clickup.com/t/k7p2qcgyn'] }).tarea_id, 'k7p2qcgyn');
  assert.equal(sesion(base(), 's5', { prompts: ['ver CU-k7p2tfedd'] }).tarea_id, 'k7p2tfedd');
});

test('textos de 9 caracteres que no son tareas no se ligan', () => {
  // "proyectos" (ruta) y "conflicto" (rama) tienen 9 caracteres; k7p2pc50z es un ID que no está en las tareas.
  const r = sesion(base(), 's6', { rama: 'feature/conflicto-aw', prompts: ['arregla el worktree k7p2pc50z'] });
  assert.equal(r.tarea_id, null);
});

test('la rama gana sobre el prompt; CLICKUP_TASK gana sobre todo', () => {
  assert.equal(sesion(base(), 's7', { rama: 'feature/adm06-conflictos-aw-k7p2qcgyn', prompts: ['/agil k7p2jvu77'] }).tarea_id, 'k7p2qcgyn');
  assert.deepEqual(ligada(sesion(base(), 's8', { rama: 'feature/adm06-conflictos-aw-k7p2qcgyn', env: 'k7p2tfedr' })),
    { tarea_id: 'k7p2tfedr', tarea_origen: 'env' });
});

test('a mano no se pisa; desligar (null) deja que el ligado automático vuelva', () => {
  const db = base();
  sesion(db, 's9', { rama: 'feature/factura-cfdi-duplicado-recepcion-k7p2tfedr' });
  db.prepare(`UPDATE sesiones SET tarea_id = 'k7p2jvu77', tarea_origen = 'manual' WHERE id = 's9'`).run();
  assert.equal(ligar(db, 's9'), false);
  assert.equal(religarTodas(db), 0);
  db.prepare(`UPDATE sesiones SET tarea_id = NULL, tarea_origen = NULL WHERE id = 's9'`).run();
  assert.equal(ligar(db, 's9'), true);
  assert.equal(db.prepare(`SELECT tarea_id FROM sesiones WHERE id = 's9'`).get().tarea_id, 'k7p2tfedr');
});

test('sesiones que llegaron antes de sincronizar ClickUp se ligan después', () => {
  const db = base([]);
  assert.equal(sesion(db, 's10', { rama: 'feature/factura-cfdi-duplicado-recepcion-k7p2tfedr' }).tarea_id, null);
  db.prepare(`INSERT INTO tareas (id, nombre) VALUES ('k7p2tfedr', 'x')`).run();
  assert.equal(religarTodas(db), 1);
  assert.equal(db.prepare(`SELECT tarea_origen FROM sesiones WHERE id = 's10'`).get().tarea_origen, 'rama');
});
