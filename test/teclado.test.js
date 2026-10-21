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

test('enviarTexto solo se llama desde la ruta /mensaje de index.js, una vez', () => {
  const llamadas = usos(/\benviarTexto\(/);
  assert.equal(llamadas.length, 1, llamadas.map((u) => `${u.f}:${u.i + 1}`).join(', '));
  assert.equal(llamadas[0].f, 'index.js');
  const index = fs.readFileSync(path.join(SERVER, 'index.js'), 'utf8');
  const ruta = index.indexOf("/mensaje$/");
  const siguiente = index.indexOf("/pantalla$/");
  const pos = index.indexOf('enviarTexto(s.tmux');
  assert.ok(ruta > 0 && pos > ruta && pos < siguiente, 'la llamada debe estar dentro del handler de /mensaje');
});

test('enviarTecla solo se llama desde la ruta /tecla', () => {
  const llamadas = usos(/\benviarTecla\(/);
  assert.equal(llamadas.length, 1);
  assert.match(fs.readFileSync(path.join(SERVER, 'index.js'), 'utf8'), /\/tecla\$\/[\s\S]{0,400}enviarTecla\(s\.tmux, tecla\)/);
});
