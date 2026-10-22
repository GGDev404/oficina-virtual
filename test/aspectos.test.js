import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrir } from '../server/db.js';
import { claveValida, guardarAspecto, limpiarAspecto, listaAspectos } from '../server/aspectos.js';

test('limpiarAspecto: solo campos conocidos y con forma válida', () => {
  assert.deepEqual(limpiarAspecto({ camisa: '#AABBCC', pelo: 'red', clase: 'spartan', apodo: ' Jefe\u0000 Maestro ', x: 1 }),
    { camisa: '#aabbcc', clase: 'spartan', apodo: 'Jefe Maestro' });
  assert.equal(limpiarAspecto({ clase: 'dragón', camisa: 'url(x)' }), null);
  assert.equal(limpiarAspecto([]), null);
  assert.equal(limpiarAspecto({ camisa: ['#aabbcc'] }), null); // un arreglo no pasa por cadena
  assert.equal(limpiarAspecto({ apodo: 'x'.repeat(40) }).apodo.length, 24);
});

test('claveValida: rol, sesión o yo', () => {
  assert.ok(claveValida('rol:revision-qa'));
  assert.ok(claveValida('sesion:0a1b2c3d-0000-4000-8000-123456789abc'));
  assert.ok(claveValida('yo'));
  assert.ok(!claveValida('rol:../x') && !claveValida('sesion:1') && !claveValida('otro'));
});

test('guardarAspecto guarda, reemplaza y borra', () => {
  const db = abrir(':memory:');
  guardarAspecto(db, 'yo', { clase: 'bloque' });
  guardarAspecto(db, 'yo', { clase: 'marine', camisa: '#336633' });
  assert.deepEqual(listaAspectos(db), { yo: { clase: 'marine', camisa: '#336633' } });
  guardarAspecto(db, 'yo', null);
  assert.deepEqual(listaAspectos(db), {});
});
