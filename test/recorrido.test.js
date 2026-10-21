// Piezas del recorrido v2: sesiones vivas, procesos en fondo, conversación, mensajero y «para ti».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrir, estado } from '../server/db.js';
import { aplicar, revisar } from '../server/estados.js';
import { aplicarVivas } from '../server/vivas.js';
import { intercambios, rutaValida, usoContexto } from '../server/conversacion.js';
import { crearMensajero, interpretar, promptMensajero, guardarImagenes, conImagenes } from '../server/mensajero.js';
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
  assert.deepEqual(vivas.get(SID), { pid: 6352, nombre: 'mi-erp-2f', ocupada: true, esperando: false, bandeja: true, tipo: 'interactive', corto: null });
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
    l({ type: 'user', message: { content: '<cross-session-message from="y">\nMensaje de Geovany desde la oficina virtual:\nya lo reinicie\n</cross-session-message>' } }),
    // Formato actual: Claude Code antepone una línea y la oficina agrega la nota de cómo responder.
    l({ type: 'user', isMeta: true, message: { content: 'Another Claude session sent a message:\n<cross-session-message from="z" from-name="mensajero-86">\n'
      + 'Mensaje de Geovany desde la oficina virtual:\nvale\n\n(Contesta aquí mismo, en tu propio turno, no con SendMessage: este mensajero ya se cerró y no recibe respuestas. La oficina lee tu respuesta de tu conversación y me avisa.)\n</cross-session-message>\n\nThis came from another Claude session' } }),
    l({ type: 'user', isSidechain: true, message: { content: 'de un subagente' } }),
    '{roto',
  ];
  assert.deepEqual(intercambios(lineas).map((m) => [m.rol, m.texto]), [
    ['tu', 'arregla el filtro'], ['agente', 'Reviso el filtro.'], ['agente', 'Listo.'], ['mensaje', 'Mensaje de Dev: ¿ya?'],
    ['mensaje', 'ya lo reinicie'], ['mensaje', 'vale'],
  ]);
  assert.equal(rutaValida(`${os.homedir()}/.claude/projects/x/a.jsonl`), true);
  assert.equal(rutaValida(`${os.homedir()}/.claude/projects/../../.ssh/id_rsa.jsonl`), false);
  assert.equal(rutaValida('/etc/passwd'), false);
});

test('mensajero: arma el prompt, interpreta la respuesta y avisa cada cambio de estado', async () => {
  const p = promptMensajero({ nombre: 'mi-erp-2f', cwd: '/x/mi-erp', texto: '¿Ya corriste las pruebas?', firma: 'Dev' });
  assert.match(p, /«mi-erp-2f»/);
  assert.match(p, /<<<INICIO>>>\nMensaje de Dev desde la oficina virtual:\n¿Ya corriste las pruebas\?\n\n\(Contesta aquí mismo[^\n]*no con SendMessage[^\n]*\)\n<<<FIN>>>/);
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

test('uso de contexto: última respuesta del agente principal; 1 M según el modelo o al pasar de 200 mil', () => {
  const linea = (u, extra = {}, model = 'claude-sonnet-4-5') => JSON.stringify({ type: 'assistant', timestamp: '2026-10-20T18:00:00Z', message: { model, usage: u }, ...extra });
  assert.deepEqual(usoContexto([linea({ input_tokens: 2, cache_read_input_tokens: 150_000, cache_creation_input_tokens: 1000, output_tokens: 500 })]),
    { tokens: 151_502, limite: 200_000, modelo: 'claude-sonnet-4-5', ts: Date.parse('2026-10-20T18:00:00Z') });
  for (const m of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-haiku-5-5', 'claude-opus-4-7']) {
    assert.equal(usoContexto([linea({ input_tokens: 70_000 }, {}, m)]).limite, 1_000_000, m);
  }
  assert.equal(usoContexto([linea({ input_tokens: 70_000 }, {}, 'claude-opus-4-6')]).limite, 200_000);
  const grande = usoContexto([linea({ input_tokens: 2, cache_read_input_tokens: 780_000 }), linea({ input_tokens: 9 }, { isSidechain: true }), '{roto']);
  assert.equal(grande.limite, 1_000_000);
  assert.equal(grande.tokens, 780_002);
  assert.equal(usoContexto(['{"type":"user"}']), null);
});

test('permiso: PermissionRequest guarda qué pide; esperar en claude agents lo mantiene en Tu puerta aunque cambie el transcript', () => {
  const db = abrir(':memory:');
  aplicar(db, { evento: 'UserPromptSubmit', ts: T0, payload: { session_id: SID, prompt: '/agil k7p2tfedd' } });
  aplicar(db, { evento: 'PermissionRequest', ts: T0 + 1000, payload: { session_id: SID, tool_name: 'Write', tool_input: { file_path: '/x/plan.md', content: '…' } } });
  assert.equal(sesion(db).estado, 'necesita_permiso');
  assert.deepEqual(JSON.parse(sesion(db).permiso_json), { herramienta: 'Write', detalle: '/x/plan.md' });
  assert.equal(sesion(db).ultimo_mensaje, 'Pide permiso para Write: /x/plan.md');
  // El aviso genérico no tapa el detalle.
  aplicar(db, { evento: 'Notification', ts: T0 + 2000, payload: { session_id: SID, notification_type: 'permission_prompt', message: 'Claude needs your permission' } });
  assert.equal(sesion(db).ultimo_mensaje, 'Pide permiso para Write: /x/plan.md');
  // Un mensaje en cola escribe en el transcript, pero la sesión sigue esperando.
  const conTranscript = { mtime: () => T0 + 60_000, cola: () => '' };
  db.prepare("UPDATE sesiones SET transcript_path = '/t.jsonl' WHERE id = ?").run(SID);
  assert.deepEqual(revisar(db, T0 + 70_000, { ...conTranscript, esperando: () => true }), []);
  // Ya aprobado: deja de esperar y el transcript avanza; vuelve a trabajar y se limpia el permiso.
  assert.equal(revisar(db, T0 + 80_000, { ...conTranscript, esperando: () => false })[0].estado, 'trabajando');
  assert.equal(sesion(db).permiso_json, null);
});

test('claude agents en «waiting» manda la sesión a Tu puerta aunque no haya llegado el hook', () => {
  const db = abrir(':memory:');
  aplicar(db, { evento: 'UserPromptSubmit', ts: T0, payload: { session_id: SID, prompt: 'hola' } });
  const { cambios } = aplicarVivas(db, [{ sessionId: SID, pid: 1, cwd: '/x', name: 'n', status: 'waiting', kind: 'background', id: 'a43abe23' }], T0 + 5000, { bandeja: () => true });
  assert.equal(sesion(db).estado, 'necesita_permiso');
  assert.ok(cambios.some((c) => c.estado === 'necesita_permiso'));
});

test('imágenes adjuntas: solo formatos de imagen reales, se guardan y van como rutas en el mensaje', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adjuntos-'));
  const png = Buffer.from('89504e470d0a1a0a0000', 'hex').toString('base64');
  const viejo = path.join(dir, 'viejo.png');
  fs.writeFileSync(viejo, 'x');
  fs.utimesSync(viejo, new Date(0), new Date(0));
  const [ruta] = guardarImagenes(dir, [png]);
  assert.match(ruta, /\.png$/);
  assert.equal(fs.readFileSync(ruta).toString('base64'), png);
  assert.equal(fs.existsSync(viejo), false, 'los de más de 7 días se borran');
  assert.throws(() => guardarImagenes(dir, [Buffer.from('<svg/>').toString('base64')]), /solo imágenes/);
  assert.throws(() => guardarImagenes(dir, Array(5).fill(png)), /máximo 4/);
  assert.deepEqual(guardarImagenes(dir, undefined), []);
  assert.equal(conImagenes('mira', [ruta]), `mira\n\nTe mando una imagen; ábrelas con Read:\n- ${ruta}`);
  assert.equal(conImagenes('hola', []), 'hola');
});

test('una sesión de fondo sin pid (proceso muerto) no cuenta como viva y se cierra', () => {
  const db = abrir(':memory:');
  const SID2 = '1db8cd5e-736a-42af-b11b-cba7730a4282';
  db.prepare(`INSERT INTO sesiones (id, cwd, estado, estado_desde_ts, ultimo_evento_ts, iniciada_ts) VALUES (?, '/x', 'trabajando', 0, 0, 0)`).run(SID2);
  const { vivas, cambios } = aplicarVivas(db, [{ sessionId: SID2, pid: null, cwd: '/x', name: 'tarea faltante', kind: 'background', id: '1db8cd5e' }], 60_000);
  assert.equal(vivas.has(SID2), false);
  assert.deepEqual(cambios, [{ sesion_id: SID2, antes: 'trabajando', estado: 'cerrada' }]);
});

test('una sesión que muere sin SessionEnd queda pendiente; con SessionEnd no; al reabrirse deja de estarlo', () => {
  const db = abrir(':memory:');
  const MUERTA = 'aaaaaaaa-0000-0000-0000-000000000001', CERRADA = 'aaaaaaaa-0000-0000-0000-000000000002';
  for (const id of [MUERTA, CERRADA]) db.prepare(`INSERT INTO sesiones (id, cwd, estado, estado_desde_ts, ultimo_evento_ts, iniciada_ts) VALUES (?, '/x', 'trabajando', 0, 0, 0)`).run(id);
  db.prepare(`UPDATE sesiones SET fin_razon = 'prompt_input_exit' WHERE id = ?`).run(CERRADA);
  aplicarVivas(db, [], 60_000);
  assert.deepEqual(estado(db, 60_000).pendientes.sesiones.map((s) => s.id), [MUERTA]);
  aplicarVivas(db, [{ sessionId: MUERTA, pid: 7, cwd: '/x', status: 'idle' }], 70_000, { bandeja: () => false });
  assert.deepEqual(estado(db, 70_000).pendientes.sesiones, []);
});
