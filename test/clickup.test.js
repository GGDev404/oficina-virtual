// Sincronización de ClickUp con un cliente falso que devuelve la forma real de la API v2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrir } from '../server/db.js';
import { clasificar, campoFicha, crearCliente, sincronizar } from '../server/clickup.js';

const YO = 111111;
const OTRA = { id: 222222, username: 'Ana López Ruiz' };
const GEO = { id: YO, username: 'Dev Ejemplo' };
// Texto real de la ficha de k7p2tfedd (recortado) y una con CHOQUE.
const FICHA = 'FICHA TÉCNICA (19-oct) · HORARIO VIGENTE: mar 20, 14:00–18:00, solo la parte del filtro. · HALLAZGO: falta un atributo en el catálogo.';
const FICHA_CHOQUE = 'FICHA TÉCNICA (20-oct) · HORARIO VIGENTE: mié 21, 09:00–13:00 · CHOQUE: comparte el editor de líneas con k7p2jvu77; ir después de esa. · PRUEBA: x';
const CORRECCION = 'CORRECCIÓN a mi ficha técnica (20-oct): esta tarea solo cubre el filtro.';

const tarea = (id, due, extra = {}) => ({
  id, name: `Tarea ${id}`, status: { status: 'en espera' }, priority: null, due_date: String(due),
  list: { name: 'Sprint 02 (25/10)' }, url: `https://app.clickup.com/t/${id}`, date_updated: '1792509196632', ...extra,
});
const com = (id, user, date, texto, reply_count = 0) => ({ id, user, date: String(date), comment_text: texto, reply_count });

function clienteFalso(rutas) {
  const pedidas = [];
  return {
    pedidas,
    get: async (ruta) => {
      pedidas.push(ruta);
      const clave = Object.keys(rutas).find((k) => ruta.startsWith(k));
      if (!clave) throw new Error(`ruta no esperada ${ruta}`);
      const r = rutas[clave];
      return typeof r === 'function' ? r(ruta) : structuredClone(r);
    },
  };
}

test('clasificar: ficha, corrección y otro', () => {
  assert.equal(clasificar(FICHA), 'ficha');
  assert.equal(clasificar(CORRECCION), 'correccion');
  assert.equal(clasificar('Ya quedó el PR, revísalo'), 'otro');
});

test('campoFicha corta en la siguiente etiqueta y no en las horas', () => {
  assert.equal(campoFicha(FICHA, 'HORARIO VIGENTE'), 'mar 20, 14:00–18:00, solo la parte del filtro.');
  assert.equal(campoFicha(FICHA, 'CHOQUE'), null);
  assert.equal(campoFicha(FICHA_CHOQUE, 'CHOQUE'), 'comparte el editor de líneas con k7p2jvu77; ir después de esa.');
});

test('sincronizar: tareas, horario/choque, respuestas y "sin responder"', async () => {
  const db = abrir(':memory:');
  const cliente = clienteFalso({
    '/user': { user: GEO },
    '/team/9017291387/task': { tasks: [tarea('k7p2tfedd', 1792609200000), tarea('k7p2jvu77', 1792627200000)], last_page: true },
    '/task/k7p2tfedd/comment': { comments: [
      com('c3', OTRA, 1792512000000, CORRECCION),
      com('c2', GEO, 1792500000000, 'Va, lo tomo mañana'),
      com('c1', OTRA, 1792480000000, FICHA_CHOQUE, 1),
    ] },
    '/comment/c1/reply': { comments: [com('r1', OTRA, 1792490000000, '¿Ya viste el choque?')] },
    '/task/k7p2jvu77/comment': { comments: [com('c4', OTRA, 1792400000000, FICHA)] },
  });
  const r = await sincronizar(db, cliente, { teamId: '9017291387', ahora: 1792520000000 });
  assert.deepEqual(r, { tareas: 2, comentarios: 5, errores: [] });

  const q = cliente.pedidas.find((p) => p.startsWith('/team/'));
  assert.match(q, /assignees%5B%5D=111111/);
  assert.match(q, /include_closed=false/);
  assert.match(q, /due_date_lt=1795112000000/);

  const t = db.prepare('SELECT * FROM tareas WHERE id = ?').get('k7p2tfedd');
  assert.equal(t.horario, 'mié 21, 09:00–13:00');
  assert.equal(t.choque, 'comparte el editor de líneas con k7p2jvu77; ir después de esa.');
  assert.equal(t.due_ts, 1792609200000);

  const c = Object.fromEntries(db.prepare('SELECT * FROM comentarios').all().map((x) => [x.id, x]));
  assert.equal(c.c3.tipo, 'correccion');
  assert.equal(c.c3.respondido, 0); // posterior a mi último comentario
  assert.equal(c.c1.respondido, 1); // respondí después (c2)
  assert.equal(c.r1.parent_id, 'c1');
  assert.equal(c.r1.respondido, 1);
  assert.equal(c.c2.es_mio, 1);
  assert.equal(c.c4.respondido, 0);
});

test('re-sincronizar conserva "visto", borra tareas cerradas y no toca comentarios si su tarea falló', async () => {
  const db = abrir(':memory:');
  const base = {
    '/user': { user: GEO },
    '/task/k7p2jvu77/comment': { comments: [com('c4', OTRA, 1792400000000, FICHA)] },
    '/task/k7p2tfedd/comment': { comments: [com('c3', OTRA, 1792512000000, CORRECCION)] },
  };
  await sincronizar(db, clienteFalso({ ...base, '/team/1/task': { tasks: [tarea('k7p2tfedd', 1), tarea('k7p2jvu77', 2)], last_page: true } }), { teamId: '1' });
  db.prepare('UPDATE comentarios SET visto_local = 1').run();

  const r = await sincronizar(db, clienteFalso({
    ...base,
    '/team/1/task': { tasks: [tarea('k7p2jvu77', 2)], last_page: true }, // k7p2tfedd se cerró
    '/task/k7p2jvu77/comment': () => { throw new Error('ClickUp /task/k7p2jvu77/comment: HTTP 500'); },
  }), { teamId: '1' });
  assert.equal(r.errores.length, 1);
  assert.deepEqual(db.prepare('SELECT id FROM tareas').all().map((x) => x.id), ['k7p2jvu77']);
  assert.deepEqual(db.prepare('SELECT id, visto_local, tipo FROM comentarios').all().map((x) => ({ ...x })),
    [{ id: 'c4', visto_local: 1, tipo: 'ficha' }]);
  assert.equal(db.prepare('SELECT horario FROM tareas').get().horario, 'mar 20, 14:00–18:00, solo la parte del filtro.');
});

test('paginación hasta last_page', async () => {
  const db = abrir(':memory:');
  const cliente = clienteFalso({
    '/user': { user: GEO },
    '/team/1/task': (ruta) => ruta.includes('page=0')
      ? { tasks: [tarea('a00000001', 1)], last_page: false }
      : { tasks: [tarea('a00000002', 2)], last_page: true },
    '/task/': { comments: [] },
  });
  assert.equal((await sincronizar(db, cliente, { teamId: '1' })).tareas, 2);
});

test('cliente: espera ante 429 hasta el reset y reintenta', async () => {
  const esperas = [];
  let n = 0;
  const fetchFn = async () => (++n === 1
    ? new Response('', { status: 429, headers: { 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3) } })
    : Response.json({ ok: true }));
  const c = crearCliente('pk_prueba', { esperaMs: 0, fetchFn, dormir: async (ms) => { esperas.push(ms); } });
  assert.deepEqual(await c.get('/user'), { ok: true });
  assert.equal(n, 2);
  assert.ok(esperas.some((ms) => ms >= 2000 && ms <= 4500), `esperas: ${esperas}`);
  await assert.rejects(crearCliente('x', { esperaMs: 0, fetchFn: async () => new Response('', { status: 401 }) }).get('/user'), /HTTP 401/);
});
