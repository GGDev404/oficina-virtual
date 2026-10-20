// Servidor de la oficina: solo 127.0.0.1:4777, sin CORS.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { abrir, estado } from './db.js';
import { aplicar, revisar, cambiarEstado } from './estados.js';
import { crearPermisos } from './permisos.js';
import { crearCliente, sincronizar } from './clickup.js';
import { ligar, religarTodas, FORMATO_ID } from './tarea-link.js';
import { crearNotificador, ESTADOS_AVISO } from './notificar.js';
import { siguiente } from './siguiente.js';
import { leerVivas, aplicarVivas } from './vivas.js';
import { leerConversacion, leerContexto } from './conversacion.js';
import { crearMensajero, MAX_TEXTO } from './mensajero.js';
import { PERMISOS, carpetaValida, carpetasConocidas, nuevaSesion, nuevaEnTerminal, cerrarSesion, abrirTerminal } from './control.js';

const PUERTO = Number(process.env.OFICINA_PUERTO ?? 4777);
const DATOS = process.env.OFICINA_DATOS ?? path.join(os.homedir(), '.local', 'share', 'oficina-virtual');
const HOSTS = new Set([`127.0.0.1:${PUERTO}`, `localhost:${PUERTO}`]);
const MAX_CUERPO = 8 * 1024 * 1024;
const RAIZ = path.resolve(import.meta.dirname, '..');
// Resumen del turno nocturno del ERP (solo lectura).

fs.mkdirSync(DATOS, { recursive: true });
const db = abrir(path.join(DATOS, 'oficina.db'));

// El token vive solo en ~/.config/oficina-virtual/.env (600); nunca se registra ni se manda a la página.
try { process.loadEnvFile(process.env.OFICINA_ENV ?? path.join(os.homedir(), '.config', 'oficina-virtual', '.env')); }
catch (e) { console.error('sin .env de la oficina:', e.code ?? e.message); }
const clickup = process.env.CLICKUP_TOKEN ? crearCliente(process.env.CLICKUP_TOKEN) : null;
const sync = { ultima_ts: null, corriendo: false, error: clickup ? null : 'falta CLICKUP_TOKEN', tareas: 0, comentarios: 0 };

async function sincronizarClickup() {
  if (!clickup || sync.corriendo) return;
  sync.corriendo = true;
  avisar();
  try {
    const previas = idsCorrecciones();
    const r = await sincronizar(db, clickup, { teamId: process.env.CLICKUP_TEAM_ID });
    for (const c of db.prepare(`SELECT c.id, c.autor, c.texto, t.nombre FROM comentarios c JOIN tareas t ON t.id = c.tarea_id
                                WHERE c.tipo = 'correccion' AND c.es_mio = 0`).all()) {
      if (!previas.has(c.id)) notificar({ titulo: `Corrección de ${c.autor}: ${c.nombre}`, cuerpo: c.texto, urgente: false });
    }
    Object.assign(sync, { ultima_ts: Date.now(), tareas: r.tareas, comentarios: r.comentarios, error: r.errores[0] ?? null });
    religarTodas(db);
  } catch (e) {
    sync.error = e.message;
    console.error('sync ClickUp:', e.message);
  } finally {
    sync.corriendo = false;
    avisar();
  }
}

// Sesiones vivas según `claude agents --json` (nombre, ocupada/libre, bandeja), cada 5 s sin encimarse.
let vivas = new Map();
let leyendoVivas = false;
async function actualizarVivas() {
  if (leyendoVivas) return;
  leyendoVivas = true;
  try {
    const r = aplicarVivas(db, await leerVivas());
    vivas = r.vivas;
    avisarCambios(r.cambios);
    avisar();
  } catch (e) {
    console.error('claude agents:', e.message.split('\n')[0]); // sin lista no se cierra nada
  } finally {
    leyendoVivas = false;
  }
}

const permisos = crearPermisos({ alCambiar: () => avisar() });
const mensajero = crearMensajero({ dir: path.join(DATOS, 'mensajero'), firma: process.env.OFICINA_NOMBRE || 'el usuario', alCambiar: () => avisar() });

function leerNoche() {
  const hoy = new Date().toLocaleDateString('sv'); // AAAA-MM-DD local
  // OFICINA_NOCHE_DIR (del .env): carpeta con <AAAA-MM-DD>/resumen.md; sin ella no hay resumen.
  const NOCHE = process.env.OFICINA_NOCHE_DIR;
  let fechas = [];
  if (!NOCHE) return { fecha: null };
  try { fechas = fs.readdirSync(NOCHE).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && f <= hoy).sort(); } catch { return { fecha: null }; }
  for (const fecha of fechas.reverse()) {
    try { return { fecha, texto: fs.readFileSync(path.join(NOCHE, fecha, 'resumen.md'), 'utf8').slice(0, 100_000) }; } catch {}
  }
  return { fecha: null };
}

// Uso de contexto de las sesiones vivas, leído del final de su transcript cada 20 s.
let contextos = {};
function actualizarContextos() {
  const nuevos = {};
  for (const s of db.prepare(`SELECT id, transcript_path FROM sesiones WHERE estado <> 'cerrada' AND transcript_path IS NOT NULL`).all()) {
    const c = leerContexto(s.transcript_path);
    if (c) nuevos[s.id] = c;
  }
  if (JSON.stringify(nuevos) !== JSON.stringify(contextos)) { contextos = nuevos; avisar(); }
}

const estadoCompleto = () => ({ ...estado(db), sync, vivas: Object.fromEntries(vivas), mensajes: mensajero.mensajes(), contexto: contextos, permisos: permisos.lista() });

// Notificación de escritorio cuando una sesión pasa a pedirte algo o llega una corrección de ficha.
const notificar = crearNotificador();
function etiquetaSesion(sid) {
  const s = db.prepare(`SELECT s.cwd, s.tarea_id, s.nombre AS sesion, t.nombre AS tarea FROM sesiones s
                        LEFT JOIN tareas t ON t.id = s.tarea_id WHERE s.id = ?`).get(sid);
  return s?.tarea ?? s?.sesion ?? s?.tarea_id ?? path.basename(s?.cwd ?? sid);
}
function avisarCambios(cambios) {
  for (const c of cambios) {
    if (!ESTADOS_AVISO[c.estado]) continue;
    const { ultimo_mensaje } = db.prepare('SELECT ultimo_mensaje FROM sesiones WHERE id = ?').get(c.sesion_id);
    notificar({
      titulo: `${etiquetaSesion(c.sesion_id)} ${ESTADOS_AVISO[c.estado]}`,
      cuerpo: ultimo_mensaje ?? '',
      urgente: c.estado === 'necesita_permiso' || c.estado === 'bloqueado',
    });
  }
}
const idsCorrecciones = () => new Set(db.prepare(`SELECT id FROM comentarios WHERE tipo = 'correccion'`).all().map((r) => r.id));

function rama(cwd) {
  try { return execFileSync('git', ['-C', cwd, 'branch', '--show-current'], { timeout: 1000, encoding: 'utf8' }).trim() || null; }
  catch { return null; }
}

// Eventos que hook.sh guardó mientras el servidor estaba caído.
function procesarPendientes() {
  const archivo = path.join(DATOS, 'pendientes.jsonl');
  const tomado = `${archivo}.procesando`;
  try { fs.renameSync(archivo, tomado); } catch { return; }
  let n = 0;
  for (const linea of fs.readFileSync(tomado, 'utf8').split('\n')) {
    if (!linea.trim()) continue;
    try { recibir(JSON.parse(linea)); n++; } catch (e) { console.error('pendiente inválido:', e.message); }
  }
  fs.unlinkSync(tomado);
  if (n) { console.log(`procesados ${n} eventos pendientes`); avisar(); }
}

function recibir(ev) {
  avisarCambios(aplicar(db, ev, { rama }));
  ligar(db, ev.payload?.session_id, ev.tarea_env);
}

// SSE: manda el estado completo; los cambios seguidos se juntan en uno cada 200 ms.
const clientes = new Set();
let programado = null;
function avisar() {
  if (programado || clientes.size === 0) return;
  programado = setTimeout(() => {
    programado = null;
    const datos = `event: estado\ndata: ${JSON.stringify(estadoCompleto())}\n\n`;
    for (const res of clientes) res.write(datos);
  }, 200);
}

function json(res, codigo, cuerpo) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(cuerpo === undefined ? '' : JSON.stringify(cuerpo));
}

function leerJson(req) {
  return new Promise((ok, falla) => {
    let n = 0;
    const partes = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > MAX_CUERPO) { falla(new Error('cuerpo demasiado grande')); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(partes).toString('utf8'))); } catch (e) { falla(e); } });
    req.on('error', falla);
  });
}

const servidor = http.createServer(async (req, res) => {
  // Bloquea DNS rebinding y peticiones de páginas web: Host exacto y JSON en todo POST (fuerza preflight).
  if (!HOSTS.has(req.headers.host ?? '')) return json(res, 403, { error: 'host no permitido' });
  if (req.method === 'POST' && !(req.headers['content-type'] ?? '').startsWith('application/json')) {
    return json(res, 415, { error: 'se espera application/json' });
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'POST' && url.pathname === '/api/eventos') {
      const ev = await leerJson(req);
      if (typeof ev?.evento !== 'string' || typeof ev.payload !== 'object' || ev.payload === null) {
        return json(res, 400, { error: 'se espera {evento, ts, payload}' });
      }
      recibir({ ts: Date.now(), ...ev });
      avisar();
      return json(res, 204);
    }
    if (req.method === 'GET' && url.pathname === '/api/estado') return json(res, 200, estadoCompleto());
    // hooks/permiso.sh: la respuesta se queda abierta hasta que decides en la página o pasan 2 min.
    if (req.method === 'POST' && url.pathname === '/api/permisos') {
      const ev = await leerJson(req);
      if (ev?.evento !== 'PermissionRequest' || typeof ev.payload?.session_id !== 'string') return json(res, 400, { error: 'se espera un PermissionRequest' });
      recibir({ ts: Date.now(), ...ev });
      const id = permisos.pedir(ev.payload, (cuerpo) => {
        if (res.writableEnded) return;
        if (cuerpo) json(res, 200, cuerpo); else { res.writeHead(204); res.end(); }
      });
      res.on('close', () => permisos.abandonar(id)); // si el hook se cortó, se quita de la página
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/siguiente') {
      const n = Math.min(Math.max(Number.parseInt(url.searchParams.get('n') ?? '15', 10) || 15, 1), 50);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(siguiente(db, { n, sync }));
    }
    if (req.method === 'POST' && url.pathname === '/api/sincronizar') {
      sincronizarClickup();
      return json(res, 202, { corriendo: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`event: estado\ndata: ${JSON.stringify(estadoCompleto())}\n\n`);
      clientes.add(res);
      req.on('close', () => clientes.delete(res));
      return;
    }
    let m;
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/comentarios\/([^/]+)\/visto$/))) {
      const r = db.prepare('UPDATE comentarios SET visto_local = 1 WHERE id = ?').run(m[1]);
      if (!r.changes) return json(res, 404, { error: 'comentario no existe' });
      avisar();
      return json(res, 204);
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/sesiones\/([^/]+)\/tarea$/))) {
      const { tarea_id } = await leerJson(req);
      // null desliga y deja que el ligado automático vuelva a intentar.
      if (tarea_id !== null && !(FORMATO_ID.test(tarea_id ?? '') && db.prepare('SELECT 1 FROM tareas WHERE id = ?').get(tarea_id))) {
        return json(res, 400, { error: 'tarea_id no es una tarea abierta conocida' });
      }
      const r = db.prepare('UPDATE sesiones SET tarea_id = ?, tarea_origen = ? WHERE id = ?')
        .run(tarea_id, tarea_id ? 'manual' : null, m[1]);
      if (!r.changes) return json(res, 404, { error: 'sesión no existe' });
      if (!tarea_id) ligar(db, m[1]);
      avisar();
      return json(res, 204);
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/permisos\/([0-9]+)$/))) {
      const { decision, motivo } = await leerJson(req);
      if (decision !== 'allow' && decision !== 'deny') return json(res, 400, { error: 'decision debe ser allow o deny' });
      const sid = permisos.sesionDe(m[1]);
      if (!sid || !permisos.decidir(m[1], decision, typeof motivo === 'string' ? motivo.slice(0, 500) : undefined)) {
        return json(res, 404, { error: 'ese permiso ya no está pendiente (se respondió o ya está en su terminal)' });
      }
      cambiarEstado(db, sid, 'trabajando', Date.now()); // con la decisión, el agente sigue
      avisar();
      return json(res, 204);
    }
    if (req.method === 'GET' && (m = url.pathname.match(/^\/api\/sesiones\/([^/]+)\/conversacion$/))) {
      const s = db.prepare('SELECT transcript_path FROM sesiones WHERE id = ?').get(m[1]);
      if (!s) return json(res, 404, { error: 'sesión no existe' });
      return json(res, 200, leerConversacion(s.transcript_path, 16));
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/sesiones\/([^/]+)\/mensaje$/))) {
      const { texto } = await leerJson(req);
      const limpio = typeof texto === 'string' ? texto.trim() : '';
      if (!limpio || limpio.length > MAX_TEXTO) return json(res, 400, { error: `escribe entre 1 y ${MAX_TEXTO} caracteres` });
      const s = db.prepare('SELECT cwd FROM sesiones WHERE id = ?').get(m[1]);
      const viva = vivas.get(m[1]);
      if (!s || !viva) return json(res, 409, { error: 'la sesión no está abierta' });
      if (!viva.bandeja || !viva.nombre) return json(res, 409, { error: 'esta sesión no tiene bandeja de mensajes; ábrela de nuevo para activarla' });
      const enviado = mensajero.enviar(m[1], { nombre: viva.nombre, cwd: s.cwd }, limpio);
      return json(res, 202, { id: enviado.id });
    }
    if (req.method === 'GET' && url.pathname === '/api/noche') return json(res, 200, leerNoche());
    if (req.method === 'GET' && url.pathname === '/api/carpetas') return json(res, 200, carpetasConocidas(db));
    if (req.method === 'POST' && url.pathname === '/api/sesiones/nueva') {
      const { cwd, prompt, nombre, permiso, tarea_id, donde } = await leerJson(req);
      const texto = typeof prompt === 'string' ? prompt.trim() : '';
      if (!carpetaValida(cwd)) return json(res, 400, { error: 'la carpeta no existe o está fuera de tu home' });
      if (!texto || texto.length > MAX_TEXTO) return json(res, 400, { error: `la indicación debe tener entre 1 y ${MAX_TEXTO} caracteres` });
      if (!PERMISOS.includes(permiso)) return json(res, 400, { error: 'modo de permisos no válido' });
      if (tarea_id && !(FORMATO_ID.test(tarea_id) && db.prepare('SELECT 1 FROM tareas WHERE id = ?').get(tarea_id))) {
        return json(res, 400, { error: 'tarea_id no es una tarea abierta conocida' });
      }
      const limpio = typeof nombre === 'string' ? nombre.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80) : '';
      const datosSesion = { cwd, prompt: texto, nombre: limpio, permiso, tarea: tarea_id || null };
      if (donde === 'terminal') { nuevaEnTerminal(datosSesion); return json(res, 201, { terminal: true }); }
      const r = await nuevaSesion(datosSesion);
      if (!r.ok) return json(res, 422, { error: r.motivo });
      actualizarVivas();
      return json(res, 201, { id: r.id });
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/sesiones\/([^/]+)\/cerrar$/))) {
      const viva = vivas.get(m[1]);
      if (!viva) return json(res, 409, { error: 'la sesión ya no está abierta' });
      const r = await cerrarSesion(viva);
      if (!r.ok) return json(res, 422, { error: r.motivo });
      setTimeout(actualizarVivas, 1500);
      return json(res, 204);
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/sesiones\/([^/]+)\/terminal$/))) {
      const viva = vivas.get(m[1]);
      if (viva?.tipo !== 'background' || !viva.corto) return json(res, 409, { error: 'solo las sesiones en segundo plano se abren así' });
      abrirTerminal(viva.corto);
      return json(res, 204);
    }
    if (req.method === 'GET' && url.pathname === '/') {
      const html = path.join(RAIZ, 'public', 'index.html');
      if (!fs.existsSync(html)) return json(res, 404, { error: 'la página llega en la Fase 5' });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(html).pipe(res);
    }
    json(res, 404, { error: 'no existe' });
  } catch (e) {
    console.error(req.method, url.pathname, e.message);
    if (!res.headersSent) json(res, 400, { error: e.message });
  }
});

procesarPendientes();
setInterval(() => {
  procesarPendientes();
  if (revisar(db, Date.now(), { ocupada: (sid) => vivas.get(sid)?.ocupada === true, esperando: (sid) => vivas.get(sid)?.esperando === true }).length) avisar();
  actualizarVivas();
}, 5000);
actualizarVivas();
actualizarContextos();
setInterval(actualizarContextos, 20_000);
sincronizarClickup();
setInterval(sincronizarClickup, 5 * 60_000);
servidor.listen(PUERTO, '127.0.0.1', () => console.log(`oficina en http://127.0.0.1:${PUERTO}`));
