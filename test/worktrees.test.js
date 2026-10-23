// Pasos de los planes (.local-context/plan-<ID>.md) con los formatos reales que usan las sesiones y la noche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerPlan } from '../server/worktrees.js';

const estados = (texto) => leerPlan(texto).map((p) => `${p.estado}:${p.texto}`);

test('pasos P-NN en encabezado o en lista; las subtareas y la lista de verificación no cuentan', () => {
  assert.deepEqual(estados([
    '# Plan 86e3kduu6', '## P-01 [x] Parameter definition', '## P-02 [~] Read port', '### Rebanada R1 · UI',
    '- [ ] P-03 · Persistencia EF', '  - [x] subtarea', '## Sibling flows checklist', '- [ ] editar empleado',
  ].join('\n')), ['hecho:P-01 · Parameter definition', 'progreso:P-02 · Read port', 'falta:P-03 · Persistencia EF']);
});

test('rebanadas S/R sin pasos P; sin códigos cuentan todas las casillas', () => {
  assert.deepEqual(estados('- [x] S1 Complete-fill flag\n- [ ] S2 Release\n- [x] R1 suelta'), ['hecho:S1 · Complete-fill flag', 'falta:S2 · Release']);
  assert.deepEqual(estados('### [x] Slice uno\n- [ ] Slice dos\ntexto [x] suelto'), ['hecho:Slice uno', 'falta:Slice dos']);
});
