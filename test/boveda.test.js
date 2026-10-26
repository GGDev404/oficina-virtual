// Índice de la bóveda: frontmatter, exclusiones y relectura por mtime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { indice, moduloDe } from '../server/boveda.js';

const crear = () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'boveda-'));
  const nota = (rel, texto) => { fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true }); fs.writeFileSync(path.join(raiz, rel), texto); };
  return { raiz, nota };
};

test('frontmatter, título y wikilinks; excluye carpetas y no-md', () => {
  const { raiz, nota } = crear();
  nota('14/a.md', '---\ntipo: estado-modulo\nmodulo: "MOD-ALM"\nmodulos: [MOD-ALM, MOD-MP]\nagentes:\n  - uno\n  - dos\ncierre: \n---\n# Almacén\nVer [[F1-ALM-01]] y [[Otra|alias]] y [[F1-ALM-01]].\n');
  nota('b.md', 'sin título ni frontmatter');
  nota('.obsidian/x.md', '# no'); nota('_respaldos-2026/x.md', '# no'); nota('videos-flujos/x.md', '# no');
  nota('evidencias/x.md', '# no'); nota('Datos y scripts/x.md', '# no'); nota('14/foto.png', 'x');
  const r = indice(raiz);
  assert.deepEqual(r.map((n) => n.ruta).sort(), [path.join('14', 'a.md'), 'b.md']);
  const a = r.find((n) => n.ruta.endsWith('a.md'));
  assert.equal(a.titulo, 'Almacén');
  assert.deepEqual(a.frontmatter, { tipo: 'estado-modulo', modulo: 'MOD-ALM', modulos: ['MOD-ALM', 'MOD-MP'], agentes: ['uno', 'dos'], cierre: '' });
  assert.deepEqual(a.enlaces, ['F1-ALM-01', 'Otra']);
  assert.equal(r.find((n) => n.ruta === 'b.md').titulo, 'b');
});

test('relee solo lo que cambió de mtime y suelta lo borrado', () => {
  const { raiz, nota } = crear();
  nota('a.md', '# Uno'); nota('b.md', '# Dos');
  const antes = indice(raiz);
  const b1 = antes.find((n) => n.ruta === 'b.md');
  nota('a.md', '# Uno cambiado');
  const t = new Date(Date.now() + 5000); fs.utimesSync(path.join(raiz, 'a.md'), t, t);
  const despues = indice(raiz);
  assert.equal(despues.find((n) => n.ruta === 'a.md').titulo, 'Uno cambiado');
  assert.equal(despues.find((n) => n.ruta === 'b.md'), b1); // mismo objeto: no se releyó
  fs.rmSync(path.join(raiz, 'b.md'));
  assert.deepEqual(indice(raiz).map((n) => n.ruta), ['a.md']);
});

test('moduloDe normaliza claves', () => {
  assert.equal(moduloDe('MOD-ALM'), 'MOD-ALM');
  assert.equal(moduloDe('alm'), 'MOD-ALM');
  assert.equal(moduloDe('ADM'), 'MOD-MAE');
  assert.equal(moduloDe('MOD-ADM'), 'MOD-MAE');
  assert.equal(moduloDe('transversal'), null);
  assert.equal(moduloDe(undefined), null);
});
