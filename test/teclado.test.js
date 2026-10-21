// T3.5: lo único que se teclea en una sesión es lo que escribiste en la página. Si alguien conecta otra fuente
// (ClickUp, transcripts, notificaciones) al teclado, esta prueba falla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SERVER = path.join(import.meta.dirname, '..', 'server');
const usos = (patron) => fs.readdirSync(SERVER).filter((f) => f.endsWith('.js'))
  .flatMap((f) => fs.readFileSync(path.join(SERVER, f), 'utf8').split('\n').map((l, i) => ({ f, i, l })))
  .filter(({ l }) => patron.test(l) && !/^\s*(\/\/|export )/.test(l) && !/^import /.test(l));

test('enviarTexto solo se llama desde index.js: la ruta /mensaje y la entrega de encargos', () => {
  const llamadas = usos(/\benviarTexto\(/);
  assert.equal(llamadas.length, 2, llamadas.map((u) => `${u.f}:${u.i + 1}`).join(', '));
  assert.ok(llamadas.every((u) => u.f === 'index.js'));
  const index = fs.readFileSync(path.join(SERVER, 'index.js'), 'utf8');
  const ruta = index.indexOf("/mensaje$/");
  const siguiente = index.indexOf("/pantalla$/");
  const pos = index.indexOf('enviarTexto(s.tmux', ruta);
  assert.ok(ruta > 0 && pos > ruta && pos < siguiente, 'una llamada debe estar dentro del handler de /mensaje');
  // La otra, en entregar(): solo la usan encargos.js (por inyección) y su texto siempre lleva cabecera.
  const entregar = index.indexOf('async function entregar(');
  assert.ok(entregar > 0 && index.indexOf('enviarTexto(s.tmux', entregar) < index.indexOf('const encargos = crearEncargos'));
  assert.equal(usos(/\bentregar\(/).filter((u) => u.f !== 'index.js' && u.f !== 'encargos.js').length, 0);
  assert.match(fs.readFileSync(path.join(SERVER, 'encargos.js'), 'utf8'), /textoEncargo\(de, texto\)/);
});

test('enviarTecla solo se llama desde la ruta /tecla', () => {
  const llamadas = usos(/\benviarTecla\(/);
  assert.equal(llamadas.length, 1);
  assert.match(fs.readFileSync(path.join(SERVER, 'index.js'), 'utf8'), /\/tecla\$\/[\s\S]{0,400}enviarTecla\(s\.tmux, tecla\)/);
});
