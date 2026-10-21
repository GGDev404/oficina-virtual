// Guardia de la oficina: Host exacto; en POST, JSON + origen propio; hooks con el token del archivo y todo lo que
// actúa en tu nombre solo con la cookie de tu navegador (frase).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearToken, autorizar, hashFrase, fraseCorrecta, leerCookie, crearLimite, archivoWeb } from '../server/guardia.js';

const hosts = new Set(['127.0.0.1:4777', 'localhost:4777']);
const token = 'a'.repeat(64);
const cookie = 'c'.repeat(64);
const sesionValida = (v) => v === cookie;
const post = (url, extra = {}) => ({ method: 'POST', url, headers: { host: '127.0.0.1:4777', 'content-type': 'application/json', ...extra } });
const opciones = { hosts, token, sesionValida };

test('autorizar: GET solo revisa el Host', () => {
  assert.equal(autorizar({ method: 'GET', url: '/api/estado', headers: { host: 'localhost:4777' } }, opciones), null);
  assert.equal(autorizar({ method: 'GET', url: '/', headers: { host: 'evil.example:4777' } }, opciones).status, 403);
});

test('autorizar: rutas de hooks y solicitudes con el token del archivo', () => {
  for (const ruta of ['/api/eventos', '/api/permisos', '/api/preguntas', '/api/solicitudes']) {
    assert.equal(autorizar(post(ruta, { 'x-oficina-token': token }), opciones), null, ruta);
    assert.equal(autorizar(post(ruta), opciones).status, 403, ruta);
    assert.equal(autorizar(post(ruta, { cookie: `ov_sesion=${cookie}` }), opciones).status, 403, `${ruta} no se abre con la cookie`);
  }
});

test('autorizar: encargos por rol con el token de los agentes o con tu cookie; abrir la sesión del rol solo con la cookie', () => {
  const e = '/api/roles/diseno/encargo';
  assert.equal(autorizar(post(e, { 'x-oficina-token': token }), opciones), null);
  assert.equal(autorizar(post(e, { cookie: `ov_sesion=${cookie}` }), opciones), null);
  assert.equal(autorizar(post(e), opciones).status, 401);
  assert.equal(autorizar(post(e, { 'x-oficina-token': 'x'.repeat(64) }), opciones).status, 401);
  assert.equal(autorizar(post('/api/roles/diseno/sesion', { 'x-oficina-token': token }), opciones).status, 401);
  assert.equal(autorizar(post('/api/roles/diseno/sesion', { cookie: `ov_sesion=${cookie}` }), opciones), null);
});

test('autorizar: lo que actúa en tu nombre exige la cookie; el token de los hooks NO sirve', () => {
  for (const ruta of ['/api/sesiones/abc/mensaje', '/api/sesiones/abc/tecla', '/api/permisos/3', '/api/sesiones/nueva', '/api/solicitudes/1/aprobar']) {
    assert.equal(autorizar(post(ruta, { 'x-oficina-token': token }), opciones).status, 401, `${ruta} con token`);
    assert.equal(autorizar(post(ruta, { cookie: `otra=1; ov_sesion=${cookie}` }), opciones), null, `${ruta} con cookie`);
    assert.equal(autorizar(post(ruta, { cookie: `ov_sesion=${'d'.repeat(64)}` }), opciones).status, 401, `${ruta} cookie ajena`);
  }
  assert.equal(autorizar(post('/api/entrar'), opciones), null); // entrar no pide nada (lo frena el límite de intentos)
});

test('autorizar: JSON y origen propio en todo POST', () => {
  assert.equal(autorizar(post('/api/eventos', { 'x-oficina-token': token, 'content-type': 'text/plain' }), opciones).status, 415);
  assert.equal(autorizar(post('/api/sesiones/x/mensaje', { cookie: `ov_sesion=${cookie}`, origin: 'https://evil.example' }), opciones).status, 403);
  assert.equal(autorizar(post('/api/sesiones/x/mensaje', { cookie: `ov_sesion=${cookie}`, origin: 'http://127.0.0.1:4777' }), opciones), null);
});

test('frase: solo se guarda el hash y se verifica sin revelar nada', () => {
  const h = hashFrase('una frase larga de prueba');
  assert.match(h, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.ok(!h.includes('frase'));
  assert.equal(fraseCorrecta('una frase larga de prueba', h), true);
  assert.equal(fraseCorrecta('otra frase cualquiera', h), false);
  assert.equal(fraseCorrecta(undefined, h), false);
  assert.equal(fraseCorrecta('x', 'basura'), false);
});

test('leerCookie y límite de intentos', () => {
  assert.equal(leerCookie({ cookie: `a=1; ov_sesion=${cookie}` }), cookie);
  assert.equal(leerCookie({ cookie: 'ov_sesion=corta' }), null);
  assert.equal(leerCookie({}), null);
  const puede = crearLimite({ max: 2, ventana: 1000 });
  assert.deepEqual([puede(0), puede(1), puede(2), puede(1001)], [true, true, false, true]);
});

test('crearToken: 64 hex, archivo 0600 y nuevo en cada arranque', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-token-'));
  fs.writeFileSync(path.join(dir, 'token'), 'viejo', { mode: 0o644 });
  const t1 = crearToken(dir);
  assert.match(t1, /^[0-9a-f]{64}$/);
  assert.equal(fs.statSync(path.join(dir, 'token')).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(path.join(dir, 'token'), 'utf8'), t1);
  assert.notEqual(crearToken(dir), t1);
  fs.rmSync(dir, { recursive: true });
});

test('la página solo sirve archivos de web/dist', () => {
  const raiz = '/srv/web/dist';
  assert.equal(archivoWeb(raiz, '/'), '/srv/web/dist/index.html');
  assert.equal(archivoWeb(raiz, '/assets/index-abc.js'), '/srv/web/dist/assets/index-abc.js');
  assert.equal(archivoWeb(raiz, '/../server/guardia.js'), null);
  assert.equal(archivoWeb(raiz, '/assets/../../.env'), null);
  assert.equal(archivoWeb(raiz, '/%2e%2e/secreto'), '/srv/web/dist/%2e%2e/secreto'); // sin decodificar: no sube
});
