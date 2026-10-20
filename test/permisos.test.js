// Permisos desde la oficina: la petición espera la decisión; sin decisión a tiempo no se responde nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearPermisos, resumenEntrada, decisionHook } from '../server/permisos.js';

const relojFalso = () => {
  const pendientes = new Map(); let n = 0;
  return { setTimeout: (fn) => { pendientes.set(++n, fn); return n; }, clearTimeout: (k) => pendientes.delete(k), vencer: () => { for (const [k, fn] of pendientes) { pendientes.delete(k); fn(); } } };
};
const pedido = { session_id: 's1', tool_name: 'Write', tool_input: { file_path: '/x/plan.md', content: 'hola' } };

test('aprobar: el hook recibe allow y el permiso sale de la lista', () => {
  const respuestas = [];
  const p = crearPermisos({ reloj: relojFalso() });
  const id = p.pedir(pedido, (c) => respuestas.push(c), 1000);
  assert.deepEqual(p.lista()[0], { id, sid: 's1', herramienta: 'Write', campos: [['file_path', '/x/plan.md'], ['content', 'hola']], creado: 1000, vence: 121000 });
  assert.equal(p.decidir(id, 'allow'), true);
  assert.deepEqual(respuestas, [{ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } }]);
  assert.deepEqual(p.lista(), []);
  assert.equal(p.decidir(id, 'allow'), false); // ya no está pendiente
});

test('rechazar lleva motivo; nunca se acepta otra decisión ni se cambia la entrada', () => {
  const respuestas = [];
  const p = crearPermisos({ reloj: relojFalso() });
  const id = p.pedir(pedido, (c) => respuestas.push(c));
  assert.equal(p.decidir(id, 'ask'), false);
  assert.equal(p.decidir(id, 'deny', 'Primero lee la ficha'), true);
  assert.deepEqual(respuestas[0].hookSpecificOutput.decision, { behavior: 'deny', message: 'Primero lee la ficha' });
  assert.equal('updatedInput' in respuestas[0].hookSpecificOutput.decision, false);
  assert.equal(decisionHook('deny').hookSpecificOutput.decision.message, 'Rechazado desde la oficina virtual.');
});

test('sin decisión a tiempo (o si el hook se corta) se responde vacío: el diálogo sale en la terminal', () => {
  const reloj = relojFalso();
  const respuestas = [];
  const p = crearPermisos({ reloj });
  p.pedir(pedido, (c) => respuestas.push(c));
  reloj.vencer();
  assert.deepEqual(respuestas, [null]);
  const id2 = p.pedir(pedido, (c) => respuestas.push(c));
  p.abandonar(id2);
  assert.deepEqual(respuestas, [null, null]);
  assert.deepEqual(p.lista(), []);
});

test('resumen de la entrada: campos que importan, recortados', () => {
  const largo = 'x'.repeat(2000);
  const r = resumenEntrada({ command: 'rm -rf build', description: 'limpia', otro: 1, content: largo });
  assert.deepEqual(r.map(([k]) => k), ['command', 'description', 'content']);
  assert.equal(r[2][1].length, 1501);
});
