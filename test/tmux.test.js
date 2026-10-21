// tmux: nombres de socket seguros, texto como bracketed paste + Enter y solo teclas permitidas; sin procesos reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socketDe, socketValido, enviarTexto, enviarTecla, vive, sigueEnLaCaja } from '../server/tmux.js';

// `pantallas`: lo que devuelve cada capture-pane, en orden (vacío = caja vacía).
const grabar = (pantallas = []) => {
  const llamadas = [];
  const ejecutar = (cmd, args, opts, listo) => {
    const llamada = { cmd, args, entrada: undefined };
    llamadas.push(llamada);
    setImmediate(() => listo(null, args.includes('capture-pane') ? pantallas.shift() ?? '❯ ' : ''));
    return { stdin: { end: (x) => { llamada.entrada = x; } } };
  };
  return { llamadas, ejecutar };
};
const esperar = async () => {};

test('socketDe: slug ASCII + 4 hex, siempre válido', () => {
  assert.equal(socketDe('Revisión de Órdenes', 'ab12'), 'ov-revision-de-ordenes-ab12');
  assert.equal(socketDe('', '0000'), 'ov-sesion-0000');
  assert.ok(socketValido(socketDe('x'.repeat(90))));
  assert.equal(socketValido('ov-x-ab12;otra'), false);
  assert.equal(socketValido('../ov-x-ab12'), false);
});

test('enviarTexto: pega con bracketed paste, Enter y revisa que la caja quedó vacía', async () => {
  const { llamadas, ejecutar } = grabar();
  await enviarTexto('ov-a-ab12', 'línea 1\nlínea 2', { ejecutar, esperar });
  assert.deepEqual(llamadas.map((l) => l.args), [
    ['-L', 'ov-a-ab12', 'load-buffer', '-b', 'ov', '-'],
    ['-L', 'ov-a-ab12', 'paste-buffer', '-p', '-d', '-b', 'ov', '-t', 'main'],
    ['-L', 'ov-a-ab12', 'send-keys', '-t', 'main', 'Enter'],
    ['-L', 'ov-a-ab12', 'capture-pane', '-p', '-t', 'main']]);
  assert.equal(llamadas[0].entrada, 'línea 1\nlínea 2');
});

test('enviarTexto: si lo pegado sigue en la caja (Enter perdido) reintenta; tras 3 intentos avisa', async () => {
  const atorado = 'hecho\n❯ [Image #3][Pasted text #4 +3 lines]\n  ⏵⏵ auto mode on';
  const r = grabar([atorado, '❯ ']);
  await enviarTexto('ov-a-ab12', 'mira esto\n/x/a.png', { ejecutar: r.ejecutar, esperar });
  assert.equal(r.llamadas.filter((l) => l.args.includes('Enter')).length, 2);
  const siempre = grabar([atorado, atorado, atorado]);
  await assert.rejects(enviarTexto('ov-a-ab12', 'mira esto', { ejecutar: siempre.ejecutar, esperar }), /no se envió/);
  assert.equal(siempre.llamadas.filter((l) => l.args.includes('Enter')).length, 3);
});

test('sigueEnLaCaja: texto pegado o agrupado sí; caja vacía o sugerencia distinta no', () => {
  assert.equal(sigueEnLaCaja('algo\n❯ [Pasted text #1 +3 lines]\n', 'a\nb\nc'), true);
  assert.equal(sigueEnLaCaja('algo\n❯ ok es solo hacer el componente\n', 'ok es solo hacer el componente'), true);
  assert.equal(sigueEnLaCaja('algo\n❯ \n', 'hola'), false);
  assert.equal(sigueEnLaCaja('algo\n❯ sí bórrala\n', 'haz el merge'), false); // la sugerencia gris de Claude Code
});

test('enviarTecla: solo teclas de la lista; socket inválido no ejecuta nada', async () => {
  const { llamadas, ejecutar } = grabar();
  await enviarTecla('ov-a-ab12', '2', { ejecutar });
  assert.deepEqual(llamadas[0].args, ['-L', 'ov-a-ab12', 'send-keys', '-t', 'main', '2']);
  await assert.rejects(enviarTecla('ov-a-ab12', 'C-c', { ejecutar }), /no permitida/);
  await assert.rejects(enviarTexto('../x', 'hola', { ejecutar }), /socket/);
  assert.equal(await vive('no-valido', { ejecutar }), false);
  assert.equal(llamadas.length, 1);
});
