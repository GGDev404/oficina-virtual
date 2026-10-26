import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { leerBandeja, actualizarPregunta, resumenBandeja } from '../server/bandeja.js';

const ARCHIVO = `# Preguntas pendientes

| ID | Estado | Para | Bloquea | Tarea | Pregunta | Contexto | Enviada | Respuesta | Respondida | Fuente | Módulo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P-001 | por enviar | Eliam | sí | 86e3aaa | ¿Firma doble siempre? | Plano vs código |  |  |  | [[02 · Compras]] | MOD-COM, MOD-MP |
| P-002 | por responder | Geovany | sí | 86e3bbb | ¿Lo no clasificado en todos los tipos? | Recomiendo: no |  |  |  | [[plan]] |
| P-004 | supuesto | Laura | sí | — | ¿Formato? | — |  | Supuesto: el de SAP |  | [[y]] |
| P-003 | respondida | Jorge | no | — | ¿Scripts? | — | 2026-10-20 | Sí | 2026-10-21 | [[x]] |
`;

function copia() {
  const ruta = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bandeja-')), 'preguntas.md');
  fs.writeFileSync(ruta, ARCHIVO);
  return ruta;
}

test('lee solo las filas P-NNN con sus columnas', () => {
  const { filas } = leerBandeja(copia());
  assert.equal(filas.length, 4);
  assert.equal(filas[1].para, 'Geovany');
  assert.equal(filas[0].fuente, '[[02 · Compras]]');
});

test('sin ruta o sin archivo devuelve error y no truena', () => {
  assert.match(leerBandeja('').error, /OFICINA_PREGUNTAS/);
  assert.match(leerBandeja('/no/existe.md').error, /ENOENT/);
});

test('responder limpia pipes y saltos, pone fecha y estado, y no toca otras filas', () => {
  const ruta = copia();
  const f = actualizarPregunta(ruta, 'P-002', { respuesta: 'No | solo\nen servicio' });
  assert.equal(f.estado, 'respondida');
  assert.equal(f.respuesta, 'No solo en servicio');
  assert.match(f.respondida, /^\d{4}-\d{2}-\d{2}$/);
  const { filas } = leerBandeja(ruta);
  assert.equal(filas.length, 4);
  assert.equal(filas[0].estado, 'por enviar');
  assert.equal(filas[1].respuesta, 'No solo en servicio');
  assert.ok(fs.readFileSync(ruta, 'utf8').startsWith('# Preguntas pendientes'));
});

test('marcar enviada pone la fecha solo la primera vez', () => {
  const ruta = copia();
  assert.match(actualizarPregunta(ruta, 'P-001', { estado: 'enviada' }).enviada, /^\d{4}/);
  assert.equal(actualizarPregunta(ruta, 'P-003', { estado: 'enviada' }).enviada, '2026-10-20');
});

test('rechaza estado inválido, respuesta vacía e id inexistente', () => {
  const ruta = copia();
  assert.throws(() => actualizarPregunta(ruta, 'P-001', { estado: 'cerrada' }), /estado no válido/);
  assert.throws(() => actualizarPregunta(ruta, 'P-001', { respuesta: '  ' }), /entre 1 y 2000/);
  assert.equal(actualizarPregunta(ruta, 'P-999', { estado: 'enviada' }), null);
});

test('el resumen lista lo que bloquea, primero lo que decides tú', () => {
  const r = resumenBandeja(copia());
  assert.match(r, /Preguntas abiertas: 2 \(1 las decides tú, 1 por enviar\) · bloquean: 2/);
  assert.ok(r.indexOf('P-002') < r.indexOf('P-001'));
  assert.equal(resumenBandeja(''), '');
});

test('la columna Módulo se lee, es opcional en filas viejas y sobrevive al actualizar', () => {
  const ruta = copia();
  const { filas } = leerBandeja(ruta);
  assert.equal(filas[0].modulo, 'MOD-COM, MOD-MP');
  assert.equal(filas[1].modulo, '');
  actualizarPregunta(ruta, 'P-001', { estado: 'enviada' });
  assert.equal(leerBandeja(ruta).filas[0].modulo, 'MOD-COM, MOD-MP');
});
