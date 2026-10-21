// Roles: encargos entre sesiones, ENTREGA:, agentes/*.md e instalador con HOME temporal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { abrir } from '../server/db.js';
import { ROLES, esRol, cuerpoRol, entregaDe, textoEncargo, crearEncargos, ErrorEncargo } from '../server/encargos.js';

const RAIZ = path.resolve(import.meta.dirname, '..');
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', R = 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr';
const sesion = (db, id, cwd, extra = {}) => db.prepare(`INSERT INTO sesiones (id, cwd, nombre, rol, estado, estado_desde_ts, ultimo_evento_ts, iniciada_ts)
  VALUES (?, ?, ?, ?, 'listo_para_revisar', 1, 1, 1)`).run(id, cwd, extra.nombre ?? id.slice(0, 4), extra.rol ?? null);

function montar({ vivas = [], entrega = { ok: true, via: 'tmux' } } = {}) {
  const db = abrir(':memory:');
  const llamadas = [], lanzadas = [];
  const e = crearEncargos({ db, vivo: async (sid) => vivas.includes(sid), etiqueta: (sid) => `sesion-${sid.slice(0, 1)}`,
    entregar: async (sid, texto, o) => { llamadas.push({ sid, texto, o }); return entrega; },
    lanzar: async (d) => { lanzadas.push(d); return { ok: true }; } });
  return { db, e, llamadas, lanzadas };
}

test('un .md por rol, con frontmatter de subagente y tools mínimas; revision-qa no edita', () => {
  for (const rol of Object.keys(ROLES)) {
    const texto = fs.readFileSync(path.join(RAIZ, 'agentes', `${rol}.md`), 'utf8');
    const fm = texto.match(/^---\n([\s\S]*?)\n---\n/)[1];
    assert.match(fm, new RegExp(`^name: ${rol}$`, 'm'));
    assert.match(fm, /^description: ".{40,}"$/m);
    assert.match(fm, /^model: (opus|sonnet|haiku)$/m);
    assert.ok(cuerpoRol(rol).includes('ENTREGA:'));
  }
  assert.doesNotMatch(fs.readFileSync(path.join(RAIZ, 'agentes', 'revision-qa.md'), 'utf8').match(/^tools: (.*)$/m)[1], /Edit|Write/);
  assert.match(cuerpoRol('docs-entrega'), /Nunca\*\* agregues «Co-Authored-By»/);
  assert.equal(esRol('implementacion'), true);
  assert.equal(esRol('__proto__'), false);
  assert.equal(esRol('../x'), false);
});

test('entregaDe: solo si la respuesta empieza con ENTREGA:', () => {
  assert.equal(entregaDe('ENTREGA: hecho en a.js'), 'hecho en a.js');
  assert.equal(entregaDe('  ENTREGA:\nlinea 1\nlinea 2'), 'linea 1\nlinea 2');
  assert.equal(entregaDe('Listo. ENTREGA: x'), null);
  assert.equal(entregaDe('ENTREGA:'), null);
  assert.match(textoEncargo('mi-erp', 'haz x'), /^Encargo de mi-erp: haz x\n\n.*`ENTREGA:`/s);
});

test('encargo a una sesión viva del rol: se entrega con cabecera, queda registrado y no va a sí misma', async () => {
  const { db, e, llamadas, lanzadas } = montar({ vivas: [R, A] });
  sesion(db, A, '/home/u/p'); sesion(db, R, '/home/u/p', { rol: 'revision-qa' });
  const r = await e.encargar({ rol: 'revision-qa', texto: 'revisa el diff', de_sesion: A });
  assert.deepEqual([r.estado, r.via, r.sesion], ['entregado', 'tmux', R]);
  assert.equal(lanzadas.length, 0);
  assert.match(llamadas[0].texto, /^Encargo de sesion-a: revisa el diff/);
  assert.equal(db.prepare('SELECT tipo, de_sesion, a_sesion FROM entre_sesiones').get().a_sesion, R);
  // la sesión del rol pidiéndose a sí misma no se la entrega: arranca otra (necesita cwd compatible)
  const propio = await e.encargar({ rol: 'revision-qa', texto: 'otro', de_sesion: R, cwd: '/home/u/p' }).catch((x) => x);
  assert.equal(lanzadas.length, 1);
  assert.equal(propio.estado, 'arrancando');
});

test('cwd explícito distinto: no usa la sesión existente; sin sesión ni cwd es 400; arrancando dos veces es 409', async () => {
  const { db, e, lanzadas } = montar({ vivas: [R] });
  sesion(db, R, '/home/u/p', { rol: 'diseno' });
  await assert.rejects(e.encargar({ rol: 'implementacion', texto: 'x' }), (x) => x instanceof ErrorEncargo && x.status === 400);
  const r = await e.encargar({ rol: 'diseno', texto: 'pantalla', cwd: '/home/u/otro' });
  assert.equal(r.estado, 'arrancando');
  assert.equal(lanzadas[0].cwd, '/home/u/otro');
  assert.equal(lanzadas[0].rol, 'diseno');
  assert.match(lanzadas[0].sistema, /rol de \*\*diseño de interfaz/);
  assert.match(lanzadas[0].prompt, /^Encargo de la oficina: pantalla/);
  assert.equal(lanzadas[0].permiso, ROLES.diseno.permiso);
  await assert.rejects(e.encargar({ rol: 'diseno', texto: 'otra', cwd: '/home/u/otro' }), (x) => x.status === 409);
});

test('la sesión arrancada se marca con su rol y toma el encargo; falla del lanzador cierra el encargo en error', async () => {
  const { db, e } = montar();
  sesion(db, A, '/home/u/p');
  const r = await e.encargar({ rol: 'implementacion', texto: 'hazlo', de_sesion: A });
  sesion(db, R, '/home/u/p');
  e.alRegistrarRol(R, 'implementacion');
  e.alRegistrarRol(R, 'rol-falso');
  assert.equal(db.prepare('SELECT rol FROM sesiones WHERE id = ?').get(R).rol, 'implementacion');
  assert.deepEqual(Object.values(db.prepare('SELECT estado, a_sesion FROM encargos WHERE id = ?').get(r.id)), ['entregado', R]);

  const fallo = crearEncargos({ db: abrir(':memory:'), vivo: async () => false, etiqueta: () => 'x', entregar: async () => ({ ok: true }),
    lanzar: async () => ({ ok: false, motivo: 'sin memoria' }) });
  await assert.rejects(fallo.encargar({ rol: 'diseno', texto: 'x', cwd: '/home/u/p' }), (x) => x.status === 422 && /sin memoria/.test(x.message));
});

test('Stop con ENTREGA: reenvía el resultado a la sesión de origen; sin la marca no pasa nada', async () => {
  const { db, e, llamadas } = montar({ vivas: [R, A] });
  sesion(db, A, '/home/u/p'); sesion(db, R, '/home/u/p', { rol: 'revision-qa' });
  const { id } = await e.encargar({ rol: 'revision-qa', texto: 'revisa', de_sesion: A });
  llamadas.length = 0;
  await e.alTerminarTurno(R, 'Estoy revisando todavía');
  assert.equal(llamadas.length, 0);
  await e.alTerminarTurno(R, 'ENTREGA: aprobado, 0 defectos');
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].sid, A);
  assert.match(llamadas[0].texto, /^Entrega de sesion-r \(rol revision-qa, encargo #\d+\):\naprobado, 0 defectos/);
  const fila = db.prepare('SELECT estado, resultado FROM encargos WHERE id = ?').get(id);
  assert.deepEqual([fila.estado, fila.resultado], ['respondido', 'aprobado, 0 defectos']);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM entre_sesiones WHERE tipo = 'entrega' AND a_sesion = ?`).get(A).n, 1);
  await e.alTerminarTurno(R, 'ENTREGA: otra vez'); // ya no hay encargo abierto
  assert.equal(llamadas.length, 1);
});

test('si la entrega al destino falla, el encargo queda en error con el motivo', async () => {
  const { db, e } = montar({ vivas: [R], entrega: { ok: false, detalle: 'pide un permiso' } });
  sesion(db, R, '/home/u/p', { rol: 'diseno' });
  const r = await e.encargar({ rol: 'diseno', texto: 'x' });
  assert.deepEqual([r.estado, r.detalle], ['error', 'pide un permiso']);
  assert.equal(db.prepare('SELECT estado FROM encargos WHERE id = ?').get(r.id).estado, 'error');
});

test('instalar-agentes: copia sin pisar, y --quitar solo borra los idénticos (HOME temporal)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-agentes-'));
  const correr = (...args) => execFileSync('node', [path.join(RAIZ, 'scripts', 'instalar-agentes.js'), ...args], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  const destino = path.join(home, '.claude', 'agents');
  fs.mkdirSync(destino, { recursive: true });
  fs.writeFileSync(path.join(destino, 'diseno.md'), 'mío');
  assert.match(correr(), /ya existe diseno\.md/);
  assert.equal(fs.readFileSync(path.join(destino, 'diseno.md'), 'utf8'), 'mío');
  assert.deepEqual(fs.readdirSync(destino).sort(), ['analisis-plan.md', 'diseno.md', 'docs-entrega.md', 'implementacion.md', 'revision-qa.md']);
  assert.match(correr(), /ya existe analisis-plan\.md/); // idempotente
  assert.match(correr('--quitar'), /se queda diseno\.md/);
  assert.deepEqual(fs.readdirSync(destino), ['diseno.md']);
  fs.rmSync(home, { recursive: true });
});
