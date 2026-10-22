// Armería: el equipo de cada personaje (clase, colores y apodo). Se guarda por rol (`rol:<id>`), por sesión
// (`sesion:<uuid>`) o para ti (`yo`); la escena usa el de la sesión, si no el de su rol, si no el que sale de su id.
export const CLASES = ['ninguna', 'spartan', 'netrunner', 'marine', 'bloque'];
const COLORES = ['camisa', 'pelo', 'piel', 'pantalon', 'brillo'];
const CLAVE = /^(rol:[a-z-]{1,32}|sesion:[0-9a-f-]{36}|yo)$/;
const HEX = /^#[0-9a-f]{6}$/i;

export const claveValida = (clave) => typeof clave === 'string' && CLAVE.test(clave);

// Solo los campos conocidos y con forma válida; lo demás se descarta. null si no queda nada que guardar.
export function limpiarAspecto(entrada) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return null;
  const a = {};
  for (const k of COLORES) if (HEX.test(entrada[k] ?? '')) a[k] = entrada[k].toLowerCase();
  if (CLASES.includes(entrada.clase)) a.clase = entrada.clase;
  if (typeof entrada.apodo === 'string') {
    const apodo = entrada.apodo.replace(/[\p{C}]/gu, '').trim().slice(0, 24);
    if (apodo) a.apodo = apodo;
  }
  return Object.keys(a).length ? a : null;
}

export function guardarAspecto(db, clave, entrada, ahora = Date.now()) {
  const a = limpiarAspecto(entrada);
  if (!a) { db.prepare('DELETE FROM aspectos WHERE clave = ?').run(clave); return null; }
  db.prepare('INSERT INTO aspectos (clave, json, ts) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET json = excluded.json, ts = excluded.ts')
    .run(clave, JSON.stringify(a), ahora);
  return a;
}

export const listaAspectos = (db) => Object.fromEntries(db.prepare('SELECT clave, json FROM aspectos').all().map((f) => [f.clave, JSON.parse(f.json)]));
