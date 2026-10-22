import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gastoVacio, leerGasto, resumenGasto, sumarUso } from '../server/conversacion.js';

const resp = (id, u) => JSON.stringify({ type: 'assistant', message: { id, usage: u } });

test('sumarUso cuenta cada mensaje una vez y calcula la parte de caché', () => {
  const u = { input_tokens: 10, cache_read_input_tokens: 80, cache_creation_input_tokens: 10, output_tokens: 5 };
  const g = sumarUso(gastoVacio(), [resp('m1', u), resp('m1', u), '{"type":"user"}', 'basura', resp('m2', u)]);
  assert.deepEqual(resumenGasto(g), { entrada: 20, cache_leida: 160, cache_creada: 20, salida: 10, respuestas: 2, cache_pct: 80 });
});

test('leerGasto sigue desde donde quedó y no consume una línea a medio escribir', () => {
  const dir = fs.mkdtempSync(path.join(os.homedir(), '.claude', 'projects', 'ov-prueba-gasto-')) // rutaValida solo acepta transcripts de ahí;
  const ruta = path.join(dir, 't.jsonl');
  const u = { input_tokens: 1, output_tokens: 2 };
  try {
    fs.writeFileSync(ruta, `${resp('a', u)}\n${resp('b', u).slice(0, 10)}`);
    let g = leerGasto(ruta);
    assert.equal(g.respuestas, 1);
    fs.writeFileSync(ruta, `${resp('a', u)}\n${resp('b', u)}\n`);
    g = leerGasto(ruta, g);
    assert.equal(g.respuestas, 2);
    assert.equal(g.salida, 4);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
