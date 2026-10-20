// Agrupación de notificaciones: la primera sale al momento, las del minuto siguiente en una sola.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearNotificador } from '../server/notificar.js';

test('agrupa los avisos que llegan dentro de la ventana', async () => {
  const enviados = [];
  const avisar = crearNotificador({ enviar: (a) => enviados.push(a), ventanaMs: 30 });
  avisar({ titulo: 'A necesita permiso', urgente: true });
  avisar({ titulo: 'B te espera' });
  avisar({ titulo: 'C tiene una duda' });
  assert.deepEqual(enviados.map((a) => a.titulo), ['A necesita permiso']);
  await new Promise((r) => setTimeout(r, 45));
  assert.equal(enviados.length, 2);
  assert.equal(enviados[1].titulo, 'Oficina: 2 avisos');
  assert.match(enviados[1].cuerpo, /B te espera\n• C tiene una duda/);
  await new Promise((r) => setTimeout(r, 45)); // ventana vacía: se cierra
  avisar({ titulo: 'D bloqueada' });
  assert.equal(enviados.at(-1).titulo, 'D bloqueada');
});
