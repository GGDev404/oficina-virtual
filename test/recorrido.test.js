// Piezas del recorrido v2: sesiones vivas, procesos en fondo, conversación, mensajero y «para ti».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { abrir } from '../server/db.js';
import { aplicar, revisar } from '../server/estados.js';
import { aplicarVivas } from '../server/vivas.js';
import { intercambios, rutaValida } from '../server/conversacion.js';
import { crearMensajero, interpretar, promptMensajero } from '../server/mensajero.js';
import { esParaMi } from '../server/clickup.js';

const T0 = Date.parse('2026-10-20T12:00:00-06:00');
const SID = '9e31e852-c31f-4a93-8459-2578f939ae12';
const sesion = (db, id = SID) => db.prepare('SELECT * FROM sesiones WHERE id = ?').get(id);

test('Stop con un shell corriendo sigue trabajando y guarda el proceso; un monitor solo no cuenta', () => {
  const db = abrir(':memory:');
  const stop = (tareas) => aplicar(db, { evento: 'Stop', ts: T0, payload: { session_id: SID, last_assistant_message: 'Esperando a que terminen las pruebas.', background_tasks: tareas } });
  stop([{ id: 'b1', type: 'shell', status: 'running', description: 'dotnet test Compras' },
    { id: 'm1', type: 'monitor', status: 'running', description: 'live updates for artifact' }]);
  assert.equal(sesion(db).estado, 'trabajando');
  assert.deepEqual(JSON.parse(sesion(db).procesos_json), [{ tipo: 'shell', descripcion: 'dotnet test Compras', agente: null }]);
  stop([{ id: 'm1', type: 'monitor', status: 'running', description: 'live updates for artifact' }]);
  assert.equal(sesion(db).estado, 'listo_para_revisar');
  assert.equal(sesion(db).procesos_json, null);
});

test('idle_prompt con un shell corriendo no saca al agente del Taller', () => {
  const db = abrir(':memory:');
  aplicar(db, { evento: 'Stop', ts: T0, payload: { session_id: SID, last_assistant_message: 'Corre la suite completa en segundo plano, unos 14 minutos.',
    background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'validate-integration-isolated.sh' }] } });
  assert.deepEqual(aplicar(db, { evento: 'Notification', ts: T0 + 60_000, payload: { session_id: SID, notification_type: 'idle_prompt', message: 'Claude is waiting for your input' } }), []);
  assert.equal(sesion(db).estado, 'trabajando');
});

test('claude agents: crea sesiones sin hooks, pone nombre, ignora claude-mem y cierra las que ya no existen', () => {
  const db = abrir(':memory:');
  aplicar(db, { evento: 'UserPromptSubmit', ts: T0, payload: { session_id: SID, prompt: 'hola' } });
  const vieja = '00586ce9-1d26-4507-ba66-a986cbece582';
  aplicar(db, { evento: 'SessionStart', ts: T0, payload: { session_id: vieja } });
  const { vivas, cambios } = aplicarVivas(db, [
    { sessionId: SID, pid: 6352, cwd: '/x/mi-erp', name: 'mi-erp-2f', status: 'busy' },
    { sessionId: 'c1e2a95a-6088-4570-87ba-2e14e64594c9', pid: 189820, cwd: '/x/mi-erp', name: 'UX/UI refactor y accesibilidad', status: 'idle', startedAt: T0 - 3600_000 },
    { sessionId: 'afd31579-dd7e-478e-84ed-9d2b0859b360', pid: 1, cwd: `${os.homedir()}/.claude-mem/observer-sessions`, name: 'obs', status: 'busy' },
  ], T0 + 60_000, { bandeja: (pid) => pid === 6352 });
  assert.equal(sesion(db).nombre, 'mi-erp-2f');
  assert.equal(sesion(db, 'c1e2a95a-6088-4570-87ba-2e14e64594c9').estado, 'listo_para_revisar');
  assert.equal(sesion(db, 'afd31579-dd7e-478e-84ed-9d2b0859b360'), undefined);
  assert.equal(sesion(db, vieja).estado, 'cerrada');
  assert.equal(sesion(db, vieja).fin_razon, 'proceso terminado');
  assert.deepEqual(vivas.get(SID), { pid: 6352, nombre: 'mi-erp-2f', ocupada: true, bandeja: true });
  assert.ok(cambios.some((c) => c.sesion_id === vieja && c.estado === 'cerrada'));
  // Una sesión recién abierta no se cierra aunque todavía no salga en la lista.
  const nueva = '11111111-2222-3333-4444-555555555555';
  aplicar(db, { evento: 'SessionStart', ts: T0 + 59_000, payload: { session_id: nueva } });
  aplicarVivas(db, [], T0 + 60_000);
  assert.equal(sesion(db, nueva).estado, 'trabajando');
});

test('sin_señal no aplica si claude agents dice que la sesión está ocupada', () => {
  const db = abrir(':memory:');
  aplicar(db, { evento: 'UserPromptSubmit', ts: T0, payload: { session_id: SID, prompt: 'corre todo' } });
  const sinArchivos = { mtime: () => null, cola: () => '' };
  assert.deepEqual(revisar(db, T0 + 20 * 60_000, { ...sinArchivos, ocupada: () => true }), []);
  assert.equal(revisar(db, T0 + 20 * 60_000, { ...sinArchivos, ocupada: () => false })[0].estado, 'sin_señal');
});

test('conversación: tus prompts, cada texto del agente, mensajes entre sesiones; sin herramientas ni sistema', () => {
  const l = (o) => JSON.stringify({ timestamp: '2026-10-20T18:00:00Z', ...o });
  const lineas = [
    l({ type: 'user', message: { content: 'arregla el filtro' } }),
    l({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'x' }] } }),
    l({ type: 'assistant', message: { content: [{ type: 'text', text: 'Reviso el filtro.' }] } }),
    l({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } }),
    l({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } }),
    l({ type: 'assistant', message: { content: [{ type: 'text', text: 'Listo.' }] } }),
    l({ type: 'user', isMeta: true, message: { content: 'meta' } }),
    l({ type: 'user', message: { content: '<task-notification>fin</task-notification>' } }),
    l({ type: 'user', message: { content: '<cross-session-message from="x">Mensaje de Dev: ¿ya?</cross-session-message>' } }),
    l({ type: 'user', isSidechain: true, message: { content: 'de un subagente' } }),
    '{roto',
  ];
  assert.deepEqual(intercambios(lineas).map((m) => [m.rol, m.texto]), [
    ['tu', 'arregla el filtro'], ['agente', 'Reviso el filtro.'], ['agente', 'Listo.'], ['mensaje', 'Mensaje de Dev: ¿ya?'],
  ]);
  assert.equal(rutaValida(`${os.homedir()}/.claude/projects/x/a.jsonl`), true);
  assert.equal(rutaValida(`${os.homedir()}/.claude/projects/../../.ssh/id_rsa.jsonl`), false);
  assert.equal(rutaValida('/etc/passwd'), false);
});

test('mensajero: arma el prompt, interpreta la respuesta y avisa cada cambio de estado', async () => {
  const p = promptMensajero({ nombre: 'mi-erp-2f', cwd: '/x/mi-erp', texto: '¿Ya corriste las pruebas?', firma: 'Dev' });
  assert.match(p, /«mi-erp-2f»/);
  assert.match(p, /<<<INICIO>>>\nMensaje de Dev desde la oficina virtual:\n¿Ya corriste las pruebas\?\n<<<FIN>>>/);
  assert.deepEqual(interpretar('ENVIADO\n'), { ok: true, detalle: null });
  assert.deepEqual(interpretar('NO ENVIADO: la sesión no aparece'), { ok: false, detalle: 'la sesión no aparece' });

  const avisos = [];
  let args;
  const m = crearMensajero({ dir: os.tmpdir(), alCambiar: () => avisos.push(1),
    ejecutar: (cmd, a, opts, cb) => { args = a; setImmediate(() => cb(null, 'ENVIADO')); return { stdin: { end() {} } }; } });
  const enviado = m.enviar(SID, { nombre: 'mi-erp-2f', cwd: '/x' }, 'hola');
  assert.equal(enviado.estado, 'enviando');
  for (let i = 0; i < 100 && m.mensajes()[SID][0].estado === 'enviando'; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(m.mensajes()[SID][0].estado, 'enviado');
  assert.ok(args.includes('--allowedTools=ListAgents,SendMessage') && args.includes('haiku'));
  assert.equal(avisos.length, 2);
});

test('para ti: mención, asignado, tu nombre o corrección', () => {
  const yo = '111111';
  assert.equal(esParaMi({ comment: [{ type: 'tag', user: { id: 111111 } }], comment_text: 'revisa' }, yo), true);
  assert.equal(esParaMi({ assignee: { id: 111111 }, comment_text: 'tuyo' }, yo), true);
  assert.equal(esParaMi({ comment_text: 'Tesorería pasa a Dev' }, yo, 'dev'), true);
  assert.equal(esParaMi({ comment_text: 'CORRECCIÓN a mi ficha' }, yo), true);
  assert.equal(esParaMi({ comment_text: 'Se movió del sprint 2 al 3' }, yo), false);
});
