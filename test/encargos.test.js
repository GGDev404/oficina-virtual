// Roles: encargos entre sesiones, ENTREGA:, agentes/*.md e instalador con HOME temporal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { abrir } from '../server/db.js';
import { ROLES, esRol, cuerpoRol, entregaDe, textoEncargo, crearEncargos, ErrorEncargo, fichaRol, leerRol, guardarRol, sistemaRol, listaSkills, reglaValida } from '../server/encargos.js';

const RAIZ = path.resolve(import.meta.dirname, '..');
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', R = 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr';
const sesion = (db, id, cwd, extra = {}) => db.prepare(`INSERT INTO sesiones (id, cwd, nombre, rol, estado, estado_desde_ts, ultimo_evento_ts, iniciada_ts)
  VALUES (?, ?, ?, ?, 'listo_para_revisar', 1, 1, 1)`).run(id, cwd, extra.nombre ?? id.slice(0, 4), extra.rol ?? null);

function montar({ vivas = [], entrega = { ok: true, via: 'tmux' } } = {}) {
  const db = abrir(':memory:');
  const llamadas = [], lanzadas = [], apagadas = [];
  const e = crearEncargos({ db, vivo: async (sid) => vivas.includes(sid), etiqueta: (sid) => `sesion-${sid.slice(0, 1)}`, apagar: async (sid) => { apagadas.push(sid); },
    entregar: async (sid, texto, o) => { llamadas.push({ sid, texto, o }); return entrega; },
    lanzar: async (d) => { lanzadas.push(d); return { ok: true }; } });
  return { db, e, llamadas, lanzadas, apagadas };
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
  assert.match(cuerpoRol("docs-entrega"), /Nunca agregues atribución de IA \(«Co-Authored-By»/);
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

test('cwd explícito distinto: no usa la sesión existente; sin sesión ni cwd es 400; un segundo encargo arranca otro worker', async () => {
  const { db, e, lanzadas } = montar({ vivas: [R] });
  sesion(db, R, '/home/u/p', { rol: 'diseno' });
  await assert.rejects(e.encargar({ rol: 'implementacion', texto: 'x' }), (x) => x instanceof ErrorEncargo && x.status === 400);
  const r = await e.encargar({ rol: 'diseno', texto: 'pantalla', cwd: '/home/u/otro' });
  assert.equal(r.estado, 'arrancando');
  assert.equal(lanzadas[0].cwd, '/home/u/otro');
  assert.equal(lanzadas[0].rol, 'diseno');
  assert.match(lanzadas[0].sistema, /rol de \*\*diseño de interfaz/);
  assert.match(lanzadas[0].prompt, /^Encargo de la oficina: pantalla/);
  assert.equal(lanzadas[0].permiso, fichaRol('diseno').permiso); // el de agentes/diseno.md (Armería), si falta el de ROLES
  const otra = await e.encargar({ rol: 'diseno', texto: 'otra', cwd: '/home/u/otro' });
  assert.equal(otra.estado, 'arrancando');
  assert.deepEqual(lanzadas.map((l) => l.encargo), [r.id, otra.id]);
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
  assert.deepEqual(fs.readdirSync(destino).sort(), ['analisis-plan.md', 'diseno.md', 'docs-entrega.md', 'implementacion.md', 'integracion.md', 'revision-qa.md']);
  assert.match(correr(), /ya existe analisis-plan\.md/); // idempotente
  assert.match(correr('--quitar'), /se queda diseno\.md/);
  assert.deepEqual(fs.readdirSync(destino), ['diseno.md']);
  fs.rmSync(home, { recursive: true });
});

test('misión: cada ENTREGA pasa al rol siguiente; QA rechaza una vez y vuelve a implementación; el final vuelve al origen', async () => {
  const I = 'iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii', D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const { db, e, llamadas } = montar({ vivas: [A, I, R, D] });
  sesion(db, A, '/home/u/p'); sesion(db, I, '/home/u/p', { rol: 'implementacion' });
  sesion(db, R, '/home/u/p', { rol: 'revision-qa' }); sesion(db, D, '/home/u/p', { rol: 'docs-entrega' });
  await assert.rejects(e.encargar({ rol: 'implementacion', texto: 'x', de_sesion: A, cadena: ['nadie'] }), (x) => x.status === 400);
  const { id } = await e.encargar({ rol: 'implementacion', texto: 'arregla el total', de_sesion: A, cadena: ['revision-qa', 'docs-entrega'] });
  const a = (sid) => llamadas.filter((l) => l.sid === sid).length;
  await e.alTerminarTurno(I, 'ENTREGA: cambié total.js');
  assert.equal(a(R), 1); assert.equal(a(A), 0); // el paso intermedio no molesta al origen
  assert.match(llamadas.at(-1).texto, new RegExp(`Misión #${id}, paso de revision-qa\\. Objetivo: arregla el total[\\s\\S]*cambié total.js`));
  await e.alTerminarTurno(R, 'ENTREGA: **Veredicto**: rechazado. Falta la prueba.');
  assert.equal(a(I), 2); // regresó a implementación
  await e.alTerminarTurno(I, 'ENTREGA: agregué la prueba');
  await e.alTerminarTurno(R, 'ENTREGA: **Veredicto**: rechazado otra vez'); // ya usó su reintento: sigue a docs
  assert.equal(a(D), 1);
  await e.alTerminarTurno(D, 'ENTREGA: README al día');
  assert.equal(a(A), 1);
  assert.match(llamadas.at(-1).texto, /README al día/);
  const pasos = db.prepare('SELECT rol, mision, intento FROM encargos ORDER BY id').all().map((f) => `${f.rol}:${f.mision ?? f.rol}:${f.intento}`);
  assert.deepEqual(pasos, ['implementacion:implementacion:0', `revision-qa:${id}:0`, `implementacion:${id}:1`, `revision-qa:${id}:1`, `docs-entrega:${id}:1`]);
});

test('misión de diseño: si QA rechaza, regresa a diseño (no a implementación)', async () => {
  const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const { db, e, llamadas } = montar({ vivas: [A, R, D] });
  sesion(db, A, '/home/u/p'); sesion(db, D, '/home/u/p', { rol: 'diseno' }); sesion(db, R, '/home/u/p', { rol: 'revision-qa' });
  await e.encargar({ rol: 'diseno', texto: 'pantalla de pagos', de_sesion: A, cadena: ['revision-qa'] });
  await e.alTerminarTurno(D, 'ENTREGA: hice la pantalla');
  await e.alTerminarTurno(R, 'ENTREGA: **Veredicto**: rechazado. Sin foco visible.');
  assert.equal(llamadas.at(-1).sid, D);
  assert.match(llamadas.at(-1).texto, /paso de diseno[\s\S]*Sin foco visible/);
});

test('misión: si el paso siguiente no se puede entregar, la entrega vuelve al origen con el motivo', async () => {
  const I = 'iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii';
  const db = abrir(':memory:');
  const llamadas = [];
  const e = crearEncargos({ db, vivo: async () => true, etiqueta: (sid) => sid.slice(0, 1), lanzar: async () => ({ ok: true }),
    entregar: async (sid, texto) => { llamadas.push({ sid, texto }); return sid === R ? { ok: false, detalle: 'pide un permiso' } : { ok: true, via: 'tmux' }; } });
  sesion(db, A, '/home/u/p'); sesion(db, I, '/home/u/p', { rol: 'implementacion' }); sesion(db, R, '/home/u/p', { rol: 'revision-qa' });
  const { id } = await e.encargar({ rol: 'implementacion', texto: 'x', de_sesion: A, cadena: ['revision-qa'] });
  await e.alTerminarTurno(I, 'ENTREGA: listo');
  assert.equal(llamadas.at(-1).sid, A);
  assert.match(llamadas.at(-1).texto, /listo/);
  assert.match(db.prepare('SELECT detalle FROM encargos WHERE id = ?').get(id).detalle, /no pudo pasar a revision-qa: pide un permiso/);
});

test('un encargo suelto a QA con «rechazado» vuelve al origen y no arranca implementación; máximo de misiones abiertas', async () => {
  const { db, e, llamadas, lanzadas } = montar({ vivas: [R, A] });
  sesion(db, A, '/home/u/p'); sesion(db, R, '/home/u/p', { rol: 'revision-qa' });
  await e.encargar({ rol: 'revision-qa', texto: 'revisa', de_sesion: A });
  await e.alTerminarTurno(R, 'ENTREGA: **Veredicto**: rechazado');
  assert.equal(lanzadas.length, 0);
  assert.equal(llamadas.at(-1).sid, A);
  for (let i = 0; i < 3; i++) await e.encargar({ rol: 'revision-qa', texto: `m${i}`, de_sesion: A, cadena: ['docs-entrega'] });
  await assert.rejects(e.encargar({ rol: 'revision-qa', texto: 'otra', de_sesion: A, cadena: ['docs-entrega'] }), (x) => x.status === 429);
});

test('modo de trabajo del rol: se guarda en agentes/ y en ~/.claude/agents (con .bak), y valida lo que llega', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rol-'));
  const dir = path.join(tmp, 'agentes'), agentes = path.join(tmp, 'claude-agents');
  fs.mkdirSync(dir); fs.mkdirSync(agentes);
  fs.writeFileSync(path.join(dir, 'revision-qa.md'), '---\nname: revision-qa\ndescription: "x"\nmodel: sonnet\nequipo: millet-qa\n---\nRevisa. ENTREGA:\n');
  fs.writeFileSync(path.join(agentes, 'revision-qa.md'), 'viejo');
  assert.equal(fichaRol('revision-qa', dir).permiso, 'manual'); // sin `permiso:` usa el de ROLES
  const ok = { modelo: 'opus', permiso: 'auto', equipo: ['millet-qa', 'code-review', 'millet-qa'], instrucciones: 'Revisa a fondo. ENTREGA:' };
  const r = guardarRol('revision-qa', ok, { dir, agentes, ahora: () => 7 });
  assert.deepEqual([r.modelo, r.permiso, r.equipo], ['opus', 'auto', ['millet-qa', 'code-review']]);
  const texto = fs.readFileSync(path.join(dir, 'revision-qa.md'), 'utf8');
  assert.match(texto, /^name: revision-qa$/m); assert.match(texto, /^description: "x"$/m);
  assert.equal(fs.readFileSync(path.join(agentes, 'revision-qa.md'), 'utf8'), texto);
  assert.equal(fs.readFileSync(path.join(agentes, 'revision-qa.md.7.bak'), 'utf8'), 'viejo');
  assert.equal(leerRol('revision-qa', dir).instrucciones, 'Revisa a fondo. ENTREGA:');
  assert.match(sistemaRol('revision-qa', dir), /Skills de tu equipo: millet-qa, code-review\./);
  for (const malo of [{ permiso: 'bypassPermissions' }, { modelo: 'gpt' }, { equipo: Array(10).fill('a') }, { equipo: ['a; rm -rf'] }, { instrucciones: 'sin la marca' }]) {
    assert.throws(() => guardarRol('revision-qa', { ...ok, ...malo }, { dir, agentes }), (e) => e instanceof ErrorEncargo && e.status === 400);
  }
  fs.rmSync(tmp, { recursive: true });
});

test('skills que un rol puede equipar: las tuyas, las del repo y las de plugins con prefijo', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-')), repo = path.join(home, 'repo'), plugin = path.join(home, 'plug');
  const skill = (d, n, cab) => { fs.mkdirSync(path.join(d, n), { recursive: true }); fs.writeFileSync(path.join(d, n, 'SKILL.md'), `---\nname: ${n}\n${cab}\n---\n`); };
  skill(path.join(home, '.claude', 'skills'), 'mia', 'description: Hace lo mío');
  skill(path.join(repo, 'skills'), 'millet-qa', 'description: >\n  Pruebas del\n  ERP');
  skill(path.join(plugin, 'skills'), 'review', 'description: "Revisa"');
  fs.mkdirSync(path.join(home, '.claude', 'plugins'));
  fs.writeFileSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'caveman@x': [{ installPath: plugin }] } }));
  assert.deepEqual(listaSkills({ home, repo }), [
    { id: 'caveman:review', descripcion: 'Revisa' }, { id: 'mia', descripcion: 'Hace lo mío' }, { id: 'millet-qa', descripcion: 'Pruebas del ERP' }]);
  fs.rmSync(home, { recursive: true });
});

test('comandos permitidos por rol: reglas válidas, nunca Bash a secas, y llegan a --allowedTools antes de la indicación', async () => {
  for (const r of ['Bash(npm run *)', 'Read', 'Bash(playwright-cli -s=claude *)']) assert.equal(reglaValida(r), true, r);
  for (const r of ['Bash', 'Bash(*)', 'Bash( * )', 'Bash(a(b))', 'x y', '']) assert.equal(reglaValida(r), false, r);
  const { nuevaSesion } = await import('../server/control.js');
  let visto;
  await nuevaSesion({ cwd: '/h', prompt: 'hola', permiso: 'auto', permitidos: ['Bash(npm run *)'] }, { ejecutar: async (_c, args) => { visto = args; return { texto: 'backgrounded · abc1234' }; } });
  assert.deepEqual(visto, ['--bg', '--allowedTools', 'Bash(npm run *)', '--permission-mode', 'auto', 'hola']);
});

test('la sesión del rol se cierra al entregar; sus dudas van a quien encargó y la respuesta vuelve a ella', async () => {
  const { db, e, llamadas, lanzadas, apagadas } = montar({ vivas: [A] });
  sesion(db, A, '/home/u/p');
  const { id } = await e.encargar({ rol: 'revision-qa', texto: 'revisa el total', de_sesion: A });
  assert.deepEqual(lanzadas[0].prohibidos, ['AskUserQuestion']);
  sesion(db, R, '/home/u/p'); e.alRegistrarRol(R, 'revision-qa');
  await e.alTerminarTurno(R, 'Revisé casi todo.\n\n**DUDA:** ¿corro también la integración?');
  assert.equal(llamadas.at(-1).sid, A);
  assert.match(llamadas.at(-1).texto, new RegExp(`Duda de sesion-r \\(rol revision-qa, encargo #${id}\\):\\n¿corro también la integración\\?[\\s\\S]*/responder ${id}`));
  assert.deepEqual(apagadas, []); // con la duda abierta no se cierra
  await assert.rejects(e.responder({ id, texto: 'sí', de_sesion: R }), (x) => x.status === 403); // solo quien encargó
  await e.responder({ id, texto: 'sí, con el filtro de Compras', de_sesion: A });
  assert.equal(llamadas.at(-1).sid, R);
  assert.match(llamadas.at(-1).texto, /Respuesta de sesion-a \(encargo #\d+\): sí, con el filtro de Compras/);
  await e.alTerminarTurno(R, 'ENTREGA: **Veredicto**: aprobado');
  assert.equal(llamadas.at(-1).sid, A);
  assert.deepEqual(apagadas, [R]);
  await assert.rejects(e.responder({ id, texto: 'tarde' }), (x) => x.status === 404);
  await e.alTerminarTurno(A, 'ENTREGA: algo'); // una sesión tuya (sin rol ni encargo) nunca se cierra
  assert.deepEqual(apagadas, [R]);
});

test('workers independientes: cada sesión que encarga tiene su propio worker y cada uno toma su encargo exacto', async () => {
  const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', R2 = 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrr2';
  const { db, e, llamadas, lanzadas } = montar({ vivas: [A, B, R, R2] });
  sesion(db, A, '/home/u/p'); sesion(db, B, '/home/u/p');
  const ea = await e.encargar({ rol: 'revision-qa', texto: 'revisa A', de_sesion: A });
  const eb = await e.encargar({ rol: 'revision-qa', texto: 'revisa B', de_sesion: B }); // mismo rol y carpeta: no espera ni comparte
  assert.equal(lanzadas.length, 2);
  // Arrancan al revés: cada una se liga por OFICINA_ENCARGO, no por orden.
  sesion(db, R2, '/home/u/p'); e.alRegistrarRol(R2, 'revision-qa', eb.id);
  sesion(db, R, '/home/u/p'); e.alRegistrarRol(R, 'revision-qa', ea.id);
  assert.equal(db.prepare('SELECT a_sesion FROM encargos WHERE id = ?').get(ea.id).a_sesion, R);
  assert.equal(db.prepare('SELECT a_sesion FROM encargos WHERE id = ?').get(eb.id).a_sesion, R2);
  // R está ocupada con A: un nuevo encargo de B no cae en R aunque esté viva.
  await e.encargar({ rol: 'revision-qa', texto: 'otra de B', de_sesion: B });
  assert.equal(lanzadas.length, 3);
  // R libre después de entregar a A: A puede reutilizarla, B no.
  await e.alTerminarTurno(R, 'ENTREGA: ok A');
  db.prepare("UPDATE sesiones SET estado = 'listo_para_revisar' WHERE id = ?").run(R); // la prueba no cierra la sesión de verdad
  llamadas.length = 0;
  await e.encargar({ rol: 'revision-qa', texto: 'otra de B', de_sesion: B });
  assert.equal(lanzadas.length, 4);
  const r = await e.encargar({ rol: 'revision-qa', texto: 'otra de A', de_sesion: A });
  assert.equal(r.sesion, R);
});
