// tmux: nombres de socket seguros, texto como bracketed paste + Enter y solo teclas permitidas; sin procesos reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socketDe, socketValido, enviarTexto, enviarTecla, vive } from '../server/tmux.js';

const grabar = () => {
  const llamadas = [];
  const ejecutar = (cmd, args, opts, listo) => {
    const llamada = { cmd, args, entrada: undefined };
    llamadas.push(llamada);
    setImmediate(() => listo(null, ''));
    return { stdin: { end: (x) => { llamada.entrada = x; } } };
  };
  return { llamadas, ejecutar };
};

test('socketDe: slug ASCII + 4 hex, siempre válido', () => {
  assert.equal(socketDe('Revisión de Órdenes', 'ab12'), 'ov-revision-de-ordenes-ab12');
  assert.equal(socketDe('', '0000'), 'ov-sesion-0000');
  assert.ok(socketValido(socketDe('x'.repeat(90))));
  assert.equal(socketValido('ov-x-ab12;otra'), false);
  assert.equal(socketValido('../ov-x-ab12'), false);
});

test('enviarTexto: pega con bracketed paste y luego Enter, en ese orden', async () => {
  const { llamadas, ejecutar } = grabar();
  await enviarTexto('ov-a-ab12', 'línea 1\nlínea 2', { ejecutar });
  assert.deepEqual(llamadas.map((l) => l.args), [
    ['-L', 'ov-a-ab12', 'load-buffer', '-b', 'ov', '-'],
    ['-L', 'ov-a-ab12', 'paste-buffer', '-p', '-d', '-b', 'ov', '-t', 'main'],
    ['-L', 'ov-a-ab12', 'send-keys', '-t', 'main', 'Enter']]);
  assert.equal(llamadas[0].entrada, 'línea 1\nlínea 2');
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
