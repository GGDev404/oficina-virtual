// Abrir y cerrar sesiones: validaciones y los dos caminos de cierre, sin lanzar procesos reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { carpetaValida, nuevaSesion, cerrarSesion } from '../server/control.js';

test('carpeta válida: absoluta, existente y dentro de tu home', () => {
  assert.equal(carpetaValida(os.homedir()), true);
  assert.equal(carpetaValida('relativa/x'), false);
  assert.equal(carpetaValida('/etc'), false);
  assert.equal(carpetaValida(`${os.homedir()}/../`), false);
  assert.equal(carpetaValida(`${os.homedir()}/no-existe-${Date.now()}`), false);
});

test('nueva sesión: claude --bg con nombre, permisos, indicación y CLICKUP_TASK', async () => {
  let visto;
  const ejecutar = async (cmd, args, opts) => { visto = { args, opts }; return { texto: 'backgrounded · 5e3c1b1d · k7p2tfedr\n  claude attach 5e3c1b1d' }; };
  const r = await nuevaSesion({ cwd: '/home/x', prompt: '/agil k7p2tfedr', nombre: 'k7p2tfedr', permiso: 'auto', tarea: 'k7p2tfedr' }, { ejecutar });
  assert.deepEqual(r, { ok: true, id: '5e3c1b1d' });
  assert.deepEqual(visto.args, ['--bg', '--permission-mode', 'auto', '--name', 'k7p2tfedr', '/agil k7p2tfedr']);
  assert.equal(visto.opts.cwd, '/home/x');
  assert.equal(visto.opts.env.CLICKUP_TASK, 'k7p2tfedr');
  const sinConfianza = await nuevaSesion({ cwd: '/home/x', prompt: 'hola', permiso: 'auto' },
    { ejecutar: async () => ({ texto: 'Workspace not trusted. Run `claude` in /home/x once' }) });
  assert.equal(sinConfianza.ok, false);
  assert.match(sinConfianza.motivo, /no es de confianza/);
});

test('cerrar: segundo plano con claude stop; interactiva con SIGTERM solo si el pid sigue siendo de Claude', async () => {
  let args;
  const bg = await cerrarSesion({ tipo: 'background', corto: '5e3c1b1d', pid: 1 }, { ejecutar: async (c, a) => { args = a; return { texto: 'stopped 5e3c1b1d' }; } });
  assert.deepEqual(bg, { ok: true });
  assert.deepEqual(args, ['stop', '5e3c1b1d']);
  const señales = [];
  const matar = (pid, s) => señales.push([pid, s]);
  assert.deepEqual(await cerrarSesion({ tipo: 'interactive', pid: 4242 }, { matar, verificar: () => true }), { ok: true });
  assert.deepEqual(señales, [[4242, 'SIGTERM']]);
  const ajeno = await cerrarSesion({ tipo: 'interactive', pid: 4243 }, { matar, verificar: () => false });
  assert.equal(ajeno.ok, false);
  assert.equal(señales.length, 1);
});
