// Recorre la máquina de estados con los eventos reales capturados en la Fase 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { abrir, estado } from '../server/db.js';
import { aplicar, revisar, fueInterrumpido } from '../server/estados.js';

const REALES = fs.readFileSync(new URL('./eventos-fase1.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').map((l) => JSON.parse(l));
const MIN = 60_000;
const HEADLESS = '3d46df2d-e990-4722-9cf1-39eac49deed8';
const APP = '3e9600a6-ea96-4bb0-800a-4f1f4df5ffd0';
const ERP = '9e31e852-c31f-4a93-8459-2578f939ae12';
const PERMISO = '56736bbe-5462-4064-8b64-f3d1e92094f9';

const real = (evento, sid) => structuredClone(REALES.find((e) => e.evento === evento && (!sid || e.payload.session_id === sid)));
const sesion = (db, id) => db.prepare('SELECT * FROM sesiones WHERE id = ?').get(id);
const sub = (db, agentId) => db.prepare('SELECT * FROM subagentes WHERE agent_id = ?').get(agentId);
const sinArchivos = { mtime: () => null, cola: () => '' };

function reproducir() {
  const db = abrir(':memory:');
  for (const e of REALES) aplicar(db, e);
  return db;
}

// Transcript real tras rechazar un permiso: el aviso y luego líneas de metadatos.
const COLA_RECHAZO = [
  '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"The user doesn\'t want to proceed"}]}}',
  '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user for tool use]"}]}}',
  '{"type":"last-prompt"}', '{"type":"custom-title"}', '{"type":"agent-name"}', '',
].join('\n');
const COLA_ACEPTADO = '{"type":"assistant","message":{"content":[{"type":"text","text":"Listo, creé x.txt"}]}}\n{"type":"last-prompt"}\n';

test('reproducción completa: estado final de cada sesión real', () => {
  const db = reproducir();
  assert.equal(sesion(db, HEADLESS).estado, 'cerrada');
  assert.equal(sesion(db, HEADLESS).fin_razon, 'other');
  assert.equal(sesion(db, PERMISO).estado, 'necesita_permiso');
  assert.equal(sesion(db, PERMISO).ultimo_mensaje, 'Claude needs your permission to use Write');
  assert.equal(sesion(db, ERP).estado, 'trabajando'); // lo último fue un UserPromptSubmit
  assert.equal(db.prepare('SELECT COUNT(*) n FROM eventos').get().n, REALES.length);
});

test('subagente síncrono: PreToolUse + SubagentStop + PostToolUse quedan en una sola fila', () => {
  const db = reproducir();
  const a = sub(db, 'a685852777903c8a0');
  assert.equal(a.tool_use_id, 'toolu_014vVkkADC7gVU2wStULeHSY');
  assert.equal(a.descripcion, 'contar archivos');
  assert.equal(a.tipo, 'general-purpose');
  assert.equal(a.estado, 'terminado');
  assert.equal(a.ultimo_mensaje, 'hola');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM subagentes WHERE sesion_id = ?').get(HEADLESS).n, 1);
});

test('SubagentStart se liga al PreToolUse previo de la misma sesión', () => {
  const db = reproducir();
  const a = sub(db, 'ab011ddc430a7b76d');
  assert.equal(a.tool_use_id, 'toolu_01TZh4wDZxQBtiGmQ8zvS6Ps');
  assert.equal(a.descripcion, 'captura SubagentStart');
  assert.equal(a.estado, 'terminado');
});

test('subagente en segundo plano: async_launched no lo termina, SubagentStop sí', () => {
  const db = abrir(':memory:');
  const hasta = REALES.findIndex((e) => e.evento === 'PostToolUse' && e.payload.session_id === ERP);
  for (const e of REALES.slice(0, hasta + 1)) aplicar(db, e);
  let a = sub(db, 'a5a526fd5008d5f0b');
  assert.equal(a.en_fondo, 1);
  assert.equal(a.estado, 'trabajando');
  assert.equal(a.descripcion, 'P-09 frontend');
  for (const e of REALES.slice(hasta + 1)) aplicar(db, e);
  a = sub(db, 'a5a526fd5008d5f0b');
  assert.equal(a.estado, 'terminado');
});

test('los agentes internos (agent_type vacío) no se registran', () => {
  const db = reproducir();
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM subagentes WHERE tipo = '' OR tipo IS NULL`).get().n, 0);
  assert.equal(sub(db, 'a24559c51b7d5447f'), undefined);
});

test('Stop con subagentes en fondo sigue trabajando', () => {
  const db = abrir(':memory:');
  const stop = REALES.find((e) => e.evento === 'Stop' && e.payload.background_tasks?.some((b) => b.type === 'subagent'));
  stop.payload.last_assistant_message = 'Lancé al worker, sigo esperando.';
  aplicar(db, stop);
  assert.equal(sesion(db, stop.payload.session_id).estado, 'trabajando');
});

test('Stop: BLOQUEO, DUDA y sin marcas', () => {
  const db = abrir(':memory:');
  const stop = real('Stop', HEADLESS);
  stop.payload.last_assistant_message = 'Avancé con la migración.\n\nBLOQUEO: falta la cadena de conexión de dev (Eduardo)';
  assert.deepEqual(aplicar(db, stop).map((c) => c.estado), ['bloqueado']);
  stop.payload.last_assistant_message = 'Dos opciones.\nDUDA: ¿uso la tolerancia por línea o por material?';
  assert.deepEqual(aplicar(db, stop).map((c) => c.estado), ['duda']);
  stop.payload.last_assistant_message = 'Terminé. Nota: el texto BLOQUEO: a mitad de línea no cuenta.';
  assert.deepEqual(aplicar(db, stop).map((c) => c.estado), ['listo_para_revisar']);
});

test('Notification idle_prompt → te_espera; otros tipos no cambian el estado', () => {
  const db = abrir(':memory:');
  const stop = real('Stop', HEADLESS);
  stop.payload.session_id = real('Notification').payload.session_id;
  aplicar(db, stop);
  const n = real('Notification');
  n.payload.notification_type = 'idle_prompt';
  n.payload.message = 'Claude is waiting for your input';
  assert.deepEqual(aplicar(db, n).map((c) => c.estado), ['te_espera']);
  assert.equal(sesion(db, PERMISO).ultimo_mensaje, stop.payload.last_assistant_message);
  n.payload.notification_type = 'auth_success';
  assert.deepEqual(aplicar(db, n), []);
});

test('UserPromptSubmit de sistema no pisa el último prompt del usuario', () => {
  const db = abrir(':memory:');
  const ups = REALES.filter((e) => e.evento === 'UserPromptSubmit' && e.payload.session_id === ERP);
  const humano = ups.find((e) => !e.payload.prompt.startsWith('<'));
  const sistema = ups.find((e) => e.payload.prompt.startsWith('<task-notification>'));
  aplicar(db, humano);
  aplicar(db, sistema);
  assert.equal(sesion(db, ERP).ultimo_prompt, humano.payload.prompt);
});

test('permiso rechazado → te_espera; aceptado → trabajando', () => {
  const t0 = Date.parse(real('Notification').ts);
  for (const [cola, esperado] of [[COLA_RECHAZO, 'te_espera'], [COLA_ACEPTADO, 'trabajando']]) {
    const db = reproducir();
    assert.deepEqual(revisar(db, t0 + 30_000, { mtime: () => t0 - 5000, cola: () => cola }).filter((c) => c.sesion_id === PERMISO), []);
    const cambios = revisar(db, t0 + 60_000, { mtime: () => t0 + 50_000, cola: () => cola });
    assert.equal(cambios.find((c) => c.sesion_id === PERMISO)?.estado, esperado);
  }
  assert.equal(fueInterrumpido(COLA_ACEPTADO + '{"type":"user","message":{"content":"[Request interrupted by user for tool use]"}}\n{"type":"assistant","message":{"content":"siguió"}}'), false);
});

test('sin_señal a los 15 min sin eventos ni cambios en el transcript, y vuelve al moverse', () => {
  const db = abrir(':memory:');
  const ups = real('UserPromptSubmit', HEADLESS);
  aplicar(db, ups);
  const t0 = Date.parse(ups.ts);
  assert.deepEqual(revisar(db, t0 + 14 * MIN, sinArchivos), []);
  // Una corrida larga escribe en el transcript aunque no haya hooks: no es sin_señal.
  assert.deepEqual(revisar(db, t0 + 20 * MIN, { mtime: () => t0 + 10 * MIN, cola: () => '' }), []);
  assert.equal(revisar(db, t0 + 26 * MIN, { mtime: () => t0 + 10 * MIN, cola: () => '' })[0].estado, 'sin_señal');
  assert.equal(revisar(db, t0 + 27 * MIN, { mtime: () => t0 + 26.5 * MIN, cola: () => '' })[0].estado, 'trabajando');
});

test('sesión cerrada se oculta de /api/estado después de 2 h; eventos se purgan a los 7 días', () => {
  const db = reproducir();
  const fin = Date.parse(real('SessionEnd').ts);
  assert.ok(estado(db, fin + MIN).sesiones.some((s) => s.id === HEADLESS));
  assert.ok(!estado(db, fin + 2 * 60 * MIN + 1).sesiones.some((s) => s.id === HEADLESS));
  revisar(db, fin + 8 * 24 * 60 * MIN, sinArchivos);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM eventos').get().n, 0);
});

test('evento sin session_id o con ts inválido se ignora', () => {
  const db = abrir(':memory:');
  assert.deepEqual(aplicar(db, { evento: 'Stop', ts: '2026-10-20T11:00:00Z', payload: {} }), []);
  assert.deepEqual(aplicar(db, { evento: 'Stop', ts: 'mañana', payload: { session_id: 'x' } }), []);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sesiones').get().n, 0);
});
