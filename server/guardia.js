// Quién puede hablar con la oficina. Los agentes corren con tu mismo usuario: pueden leer cualquier archivo tuyo y
// pedir la página. Por eso hay dos llaves:
// - Hooks y agentes: el token del archivo (0600, nuevo en cada arranque). Solo abre las rutas de los hooks y la de
//   *solicitar* una sesión (que tú apruebas en la página) y la de *encargar* trabajo a una sesión por rol.
// - Tú: la cookie HttpOnly que da la página al entrar con tu frase. Abre todo lo que actúa en tu nombre: teclear en
//   sesiones, aprobar permisos, abrir o cerrar sesiones. Un agente no sabe tu frase ni puede sacar la cookie del navegador.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const RUTAS_HOOK = new Set(['/api/eventos', '/api/permisos', '/api/preguntas', '/api/solicitudes']);
const ENCARGO = /^\/api\/roles\/[a-z-]+\/encargo$/;
export const COOKIE = 'ov_sesion';
export const DURACION_MS = 30 * 86_400_000;

export function crearToken(dir) {
  const token = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const archivo = path.join(dir, 'token');
  fs.writeFileSync(archivo, token, { mode: 0o600 });
  fs.chmodSync(archivo, 0o600); // writeFileSync no cambia el modo de un archivo que ya existía
  return token;
}

const igual = (a, b) => typeof a === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Frase: `scrypt$<sal hex>$<hash hex>` (scripts/poner-frase.sh). Solo se guarda el hash.
export function hashFrase(frase, sal = crypto.randomBytes(16)) {
  return `scrypt$${sal.toString('hex')}$${crypto.scryptSync(frase, sal, 32).toString('hex')}`;
}
export function fraseCorrecta(frase, guardado) {
  const [tipo, sal, hash] = String(guardado ?? '').trim().split('$');
  if (tipo !== 'scrypt' || !sal || !hash || typeof frase !== 'string') return false;
  return igual(crypto.scryptSync(frase, Buffer.from(sal, 'hex'), 32).toString('hex'), hash);
}

export const hashCookie = (valor) => crypto.createHash('sha256').update(valor).digest('hex');
export const leerCookie = (headers) => headers.cookie?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f]{64})`))?.[1] ?? null;

// Intentos de frase: ponytail: un contador global (5 por minuto); por IP no aplica, todo llega de 127.0.0.1.
export function crearLimite({ max = 5, ventana = 60_000 } = {}) {
  let intentos = [];
  return (ahora = Date.now()) => {
    intentos = intentos.filter((t) => ahora - t < ventana);
    if (intentos.length >= max) return false;
    intentos.push(ahora);
    return true;
  };
}

// null = pasa; si no, { status, error }. `sesionValida(valor)`: ¿esa cookie es una sesión tuya vigente?
export function autorizar({ method, headers, url }, { hosts, token, sesionValida = () => false }) {
  if (!hosts.has(headers.host ?? '')) return { status: 403, error: 'host no permitido' };
  if (method !== 'POST') return null;
  // JSON obligatorio: un formulario de otra página no puede mandarlo sin preflight.
  if (!(headers['content-type'] ?? '').startsWith('application/json')) return { status: 415, error: 'se espera application/json' };
  if (headers.origin && ![...hosts].some((h) => headers.origin === `http://${h}`)) return { status: 403, error: 'origen no permitido' };
  const ruta = (url ?? '').split('?')[0];
  if (ENCARGO.test(ruta) && igual(headers['x-oficina-token'], token)) return null; // o tu cookie, abajo
  if (RUTAS_HOOK.has(ruta)) return igual(headers['x-oficina-token'], token) ? null : { status: 403, error: 'falta el token de la oficina' };
  if (ruta === '/api/entrar') return null;
  const cookie = leerCookie(headers);
  return cookie && sesionValida(cookie) ? null : { status: 401, error: 'entra con tu frase para hacer esto' };
}

// Archivos de la página (web/dist, el build de Vite): solo los de esa carpeta; '/' es index.html. null = no existe ahí.
export function archivoWeb(raiz, pathname) {
  const archivo = path.resolve(raiz, `.${pathname === '/' ? '/index.html' : pathname}`);
  return archivo.startsWith(raiz + path.sep) ? archivo : null;
}
