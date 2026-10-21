// Permisos desde la oficina: la petición espera la decisión; sin decisión a tiempo no se responde nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearPermisos, resumenEntrada, decisionHook, resumenPreguntas, ESPERA_MS } from '../server/permisos.js';

const relojFalso = () => {
  const pendientes = new Map(); let n = 0;
  return { setTimeout: (fn) => { pendientes.set(++n, fn); return n; }, clearTimeout: (k) => pendientes.delete(k), vencer: () => { for (const [k, fn] of pendientes) { pendientes.delete(k); fn(); } } };
};
const pedido = { session_id: 's1', tool_name: 'Write', tool_input: { file_path: '/x/plan.md', content: 'hola' } };

test('aprobar: el hook recibe allow y el permiso sale de la lista', () => {
  const respuestas = [];
  const p = crearPermisos({ reloj: relojFalso() });
  const id = p.pedir(pedido, (c) => respuestas.push(c), 1000);
  assert.deepEqual(p.lista()[0], { id, sid: 's1', herramienta: 'Write', campos: [['file_path', '/x/plan.md'], ['content', 'hola']], preguntas: null, creado: 1000, vence: 901000, reglas: [], destino: null });
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

test('preguntas: eliges opciones y el hook recibe la entrada original con answers', () => {
  const respuestas = [];
  const questions = [
    { question: '¿Qué carril?', header: 'Carril', multiSelect: false, options: [{ label: 'Ágil', description: 'por defecto' }, { label: 'Completo' }] },
    { question: '¿Qué pruebas?', header: 'Pruebas', multiSelect: true, options: [{ label: 'Unitarias' }, { label: 'e2e' }] },
  ];
  const p = crearPermisos({ reloj: relojFalso() });
  const id = p.pedir({ session_id: 's1', tool_name: 'AskUserQuestion', tool_input: { questions } }, (c) => respuestas.push(c));
  assert.deepEqual(p.lista()[0].preguntas[0], { pregunta: '¿Qué carril?', titulo: 'Carril', multiple: false,
    opciones: [{ etiqueta: 'Ágil', descripcion: 'por defecto' }, { etiqueta: 'Completo', descripcion: '' }] });
  assert.equal('entrada' in p.lista()[0], false);
  assert.equal(p.contestar(id, { '¿Qué carril?': 'Ágil' }), false); // falta una respuesta
  assert.equal(p.contestar(id, { '¿Qué carril?': 'Ágil', '¿Qué pruebas?': '  ' }), false);
  assert.equal(p.contestar(id, { '¿Qué carril?': 'Ágil', '¿Qué pruebas?': 'Unitarias, e2e', otra: 'x' }), true);
  assert.deepEqual(respuestas[0].hookSpecificOutput, { hookEventName: 'PreToolUse', permissionDecision: 'allow',
    permissionDecisionReason: 'Respondido desde la oficina virtual.',
    updatedInput: { questions, answers: { '¿Qué carril?': 'Ágil', '¿Qué pruebas?': 'Unitarias, e2e' } } });
  assert.equal(resumenPreguntas({ command: 'ls' }), null);
});

test('espera por omisión: 15 minutos', () => assert.equal(ESPERA_MS, 900_000));

test('Permitir siempre: solo con las reglas allow que sugirió Claude Code, y se devuelven tal cual', () => {
  const regla = { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npx vitest *' }], behavior: 'allow', destination: 'localSettings' };
  const conSugerencias = { ...pedido, tool_name: 'Bash', permission_suggestions: [regla,
    { type: 'addDirectories', directories: ['/etc'], destination: 'session' }, { type: 'setMode', mode: 'bypassPermissions', destination: 'session' }] };
  const respuestas = [];
  const p = crearPermisos({ reloj: relojFalso() });
  const id = p.pedir(conSugerencias, (c) => respuestas.push(c), 0);
  assert.deepEqual(p.lista()[0].reglas, ['Bash(npx vitest *)']);
  assert.equal(p.lista()[0].destino, 'localSettings');
  assert.equal(p.decidir(id, 'deny', undefined, { siempre: true }), false); // siempre solo con allow
  assert.equal(p.decidir(id, 'allow', undefined, { siempre: true }), true);
  assert.deepEqual(respuestas[0].hookSpecificOutput.decision, { behavior: 'allow', updatedPermissions: [regla] });

  const sinSugerencias = p.pedir(pedido, () => {}, 0);
  assert.equal(p.decidir(sinSugerencias, 'allow', undefined, { siempre: true }), false);
  assert.equal(p.decidir(sinSugerencias, 'allow'), true); // aprobar una vez sigue igual
});

test('Decidir en la terminal: el hook recibe null y el permiso sale de la lista', () => {
  const respuestas = [];
  const p = crearPermisos({ reloj: relojFalso() });
  const id = p.pedir(pedido, (c) => respuestas.push(c), 0);
  assert.equal(p.abandonar(id), true);
  assert.deepEqual(respuestas, [null]);
  assert.equal(p.lista().length, 0);
});
