// Tiempo real: difusor SSE (coalescer, sin repetir, keepalive), mensajes entre sesiones y mensajero en paralelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { crearDifusor } from '../server/difusion.js';
import { crearMensajero } from '../server/mensajero.js';
import { abrir, estado } from '../server/db.js';
import { aplicar, entreSesiones } from '../server/estados.js';

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const cliente = () => { const escrito = []; return { escrito, write: (t) => escrito.push(t), on() {} }; };

test('difusor: junta ráfagas, no reenvía estado idéntico (ignora `ahora`) y manda retry y keepalive', async () => {
  let n = 0, valor = 1;
  const d = crearDifusor({ estado: () => ({ ahora: ++n, valor }), espera: 20, keepalive: 40 });
  const c = cliente();
  d.alta(c);
  assert.equal(c.escrito[0], 'retry: 3000\n\n');
  assert.match(c.escrito[1], /^event: estado\ndata: /);
  for (let i = 0; i < 10; i++) d.avisar();
  await espera(60);
  assert.equal(c.escrito.filter((t) => t.startsWith('event: estado')).length, 1, 'sin cambio real no hay reenvío');
  valor = 2;
  for (let i = 0; i < 10; i++) d.avisar();
  await espera(60);
  const estados = c.escrito.filter((t) => t.startsWith('event: estado'));
  assert.equal(estados.length, 2, 'una ráfaga = un solo envío');
  assert.match(estados[1], /"valor":2/);
  assert.ok(c.escrito.includes(': ka\n\n'), 'keepalive');
  d.cerrar();
});

test('entreSesiones: cross-session-message (con la línea previa de Claude Code) y agent-message', () => {
  const x = entreSesiones('Another Claude session sent a message:\n<cross-session-message from="uds:/run/user/1000/cc-socks/2888913.sock" from-name="mi-erp-2f" from-mode="prompting">\n¿Ya corriste las pruebas?\n</cross-session-message>\n\nThis came from another Claude session');
  assert.deepEqual(x, { tipo: 'cross-session-message', de: 'uds:/run/user/1000/cc-socks/2888913.sock', nombre: 'mi-erp-2f', texto: '¿Ya corriste las pruebas?' });
  assert.deepEqual(entreSesiones('<agent-message from="a1b2">reporte</agent-message>'), { tipo: 'agent-message', de: 'a1b2', nombre: null, texto: 'reporte' });
  assert.equal(entreSesiones('hola'), null);
});

test('UserPromptSubmit con mensaje de otra sesión queda en entre_sesiones y sale en el estado; no pisa ultimo_prompt', () => {
  const db = abrir(':memory:');
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const ev = (sid, prompt, ts) => ({ evento: 'UserPromptSubmit', ts, payload: { session_id: sid, prompt } });
  aplicar(db, ev(A, 'hola', 1000));
  db.prepare('UPDATE sesiones SET nombre = ? WHERE id = ?').run('mi-erp-2f', A);
  aplicar(db, ev(B, 'trabaja', 1500));
  const msg = (de, nombre, texto) => `Another Claude session sent a message:\n<cross-session-message from="${de}" from-name="${nombre}">\n${texto}\n</cross-session-message>`;
  aplicar(db, ev(B, msg('uds:/run/user/1000/cc-socks/42.sock', 'otra', 'por pid'), 2000), { porPid: (pid) => (pid === 42 ? A : null) });
  aplicar(db, ev(B, msg('uds:/x/9.sock', 'mi-erp-2f', 'por nombre'), 3000));
  aplicar(db, ev(B, msg('uds:/x/9.sock', 'mensajero-1', 'Mensaje de Geovany desde la oficina virtual:\nvale'), 4000)); // lo de la oficina no cuenta
  aplicar(db, ev(B, '<agent-message from="a1b2c3">hand-back de subagente</agent-message>', 5000));
  aplicar(db, ev(B, `<agent-message from="${A}">directo</agent-message>`, 6000));
  const { entre_sesiones } = estado(db);
  assert.deepEqual(entre_sesiones.map((m) => [m.de, m.de_sesion, m.a_sesion, m.texto]), [
    ['otra', A, B, 'por pid'], ['mi-erp-2f', A, B, 'por nombre'], [A, A, B, 'directo']]);
  assert.equal(db.prepare('SELECT ultimo_prompt FROM sesiones WHERE id = ?').get(B).ultimo_prompt, 'trabaja');
});

test('mensajero: sesiones distintas en paralelo, la misma en orden', async () => {
  const activos = new Set(); let maximo = 0; const orden = [];
  const m = crearMensajero({ dir: os.tmpdir(), ejecutar: (cmd, a, o, cb) => {
    const id = a.at(-1).match(/Mensaje de .*?:\n(\w+)/)?.[1];
    activos.add(id); maximo = Math.max(maximo, activos.size); orden.push(`ini-${id}`);
    setTimeout(() => { activos.delete(id); orden.push(`fin-${id}`); cb(null, 'ENVIADO'); }, 30);
    return { stdin: { end() {} } };
  } });
  const dest = { nombre: 'x', cwd: '/x' };
  m.enviar('s1', dest, 'uno'); m.enviar('s2', dest, 'dos'); m.enviar('s1', dest, 'tres');
  await espera(200);
  assert.equal(maximo, 2, 's1 y s2 a la vez, no s1 con s1');
  assert.ok(orden.indexOf('fin-uno') < orden.indexOf('ini-tres'));
  assert.ok(Object.values(m.mensajes()).flat().every((x) => x.estado === 'enviado'));
});
