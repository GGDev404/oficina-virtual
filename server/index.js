// Servidor de la oficina: solo 127.0.0.1:4777, sin CORS.
import http from 'node:http';
import crypto from 'node:crypto';
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
import { leerBandeja, actualizarPregunta, resumenBandeja } from './bandeja.js';
import { leerVivas, aplicarVivas } from './vivas.js';
import { leerConversacion, leerContexto, leerGasto, resumenGasto, rutaValida } from './conversacion.js';
import { crearDifusor } from './difusion.js';
import { ROLES, esRol, listaRoles, crearEncargos, ErrorEncargo, leerRol, guardarRol, listaSkills } from './encargos.js';
import { crearMensajero, guardarImagenes, conImagenes, MAX_TEXTO } from './mensajero.js';
import { PERMISOS, MODELOS, carpetaValida, carpetasConocidas, nuevaSesion, nuevaEnTmux, nuevaEnTerminal, cerrarSesion, abrirTerminal,
  abrirTmux, worktreeDeTarea, carpetaAparte, esClaude } from './control.js';
import { enviarTexto, enviarTecla, capturar, vive, cerrar as cerrarTmux, socketValido } from './tmux.js';
import { memoria, leerMeminfo, nivelMemoria, pausar } from './memoria.js';
import { claveValida, guardarAspecto, listaAspectos } from './aspectos.js';
import { leerWorktrees } from './worktrees.js';
import { tablero, detalle } from './planos.js';
import { crearToken, autorizar, crearLimite, fraseCorrecta, hashCookie, leerCookie, archivoWeb, COOKIE, DURACION_MS } from './guardia.js';

const PUERTO = Number(process.env.OFICINA_PUERTO ?? 4777);
const DATOS = process.env.OFICINA_DATOS ?? path.join(os.homedir(), '.local', 'share', 'oficina-virtual');
const HOSTS = new Set([`127.0.0.1:${PUERTO}`, `localhost:${PUERTO}`]);
const TOKEN = crearToken(DATOS);
const MAX_CUERPO = 8 * 1024 * 1024;
// Sesiones nuevas y retomadas: en su propio tmux (tus mensajes cuentan como tecleados); OFICINA_LANZADOR=bg vuelve a `claude --bg`.
const lanzarSesion = process.env.OFICINA_LANZADOR === 'bg' ? nuevaSesion : nuevaEnTmux;
const RAIZ = path.resolve(import.meta.dirname, '..');
// La página: el build de web/ (cd web && npm run build). Los nombres en assets/ llevan hash: se guardan para siempre.
const WEB = path.join(RAIZ, 'web', 'dist');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json' };
// Resumen del turno nocturno del ERP (solo lectura).

fs.mkdirSync(DATOS, { recursive: true });
const db = abrir(path.join(DATOS, 'oficina.db'));

// Tu frase (solo su hash, de scripts/poner-frase.sh) y las cookies de los navegadores donde entraste.
const ARCHIVO_FRASE = process.env.OFICINA_FRASE ?? path.join(os.homedir(), '.config', 'oficina-virtual', 'frase');
const leerFrase = () => { try { return fs.readFileSync(ARCHIVO_FRASE, 'utf8'); } catch { return null; } };
const sesionValida = (valor) => !!db.prepare('SELECT 1 FROM web_sesiones WHERE hash = ? AND vence_ts > ?').get(hashCookie(valor), Date.now());
const puedeIntentar = crearLimite();

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
// Preguntas con opciones (AskUserQuestion): esperan tu respuesta hasta 15 min; después salen en su terminal.
const preguntas = crearPermisos({ alCambiar: () => avisar(), espera: 15 * 60_000 });
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

// Uso de contexto de las sesiones vivas, leído del final de su transcript cada 20 s; y su gasto acumulado de tokens.
let contextos = {};
const gastosLeidos = new Map(); // sesión → acumulado con su offset (conversacion.js)
let gastos = {};
function actualizarContextos() {
  const nuevos = {}, nuevosGastos = {}, abiertas = new Set();
  for (const s of db.prepare(`SELECT id, transcript_path FROM sesiones WHERE estado <> 'cerrada' AND transcript_path IS NOT NULL`).all()) {
    const c = leerContexto(s.transcript_path);
    if (c) nuevos[s.id] = c;
    abiertas.add(s.id);
    const g = leerGasto(s.transcript_path, gastosLeidos.get(s.id));
    gastosLeidos.set(s.id, g);
    if (g.respuestas) nuevosGastos[s.id] = resumenGasto(g);
  }
  for (const id of gastosLeidos.keys()) if (!abiertas.has(id)) gastosLeidos.delete(id);
  if (JSON.stringify(nuevos) !== JSON.stringify(contextos) || JSON.stringify(nuevosGastos) !== JSON.stringify(gastos)) {
    contextos = nuevos; gastos = nuevosGastos; avisar();
  }
}

// Cada escritura en el transcript de una sesión abierta llega a la página al momento (event: conversacion):
// la ficha relee la conversación sin esperar al siguiente hook, que a mitad de turno casi no llega.
const vigilados = new Map(); // sesión → { ruta, w }
function vigilarTranscripts() {
  const abiertas = new Set();
  for (const s of db.prepare(`SELECT id, transcript_path FROM sesiones WHERE estado <> 'cerrada' AND transcript_path IS NOT NULL`).all()) {
    if (!rutaValida(s.transcript_path)) continue;
    abiertas.add(s.id);
    if (vigilados.get(s.id)?.ruta === s.transcript_path) continue;
    vigilados.get(s.id)?.w.close();
    vigilados.delete(s.id);
    try {
      let pendiente = null;
      const w = fs.watch(s.transcript_path, () => {
        pendiente ??= setTimeout(() => { pendiente = null; transcriptCambio(s.id, s.transcript_path); }, 60);
      });
      w.on('error', () => { w.close(); vigilados.delete(s.id); });
      vigilados.set(s.id, { ruta: s.transcript_path, w });
    } catch {} // el archivo aún no existe: se reintenta en el siguiente ciclo
  }
  for (const [id, v] of vigilados) if (!abiertas.has(id)) { v.w.close(); vigilados.delete(id); }
}
function transcriptCambio(sid, ruta) {
  const aviso = `event: conversacion\ndata: ${JSON.stringify({ sid })}\n\n`;
  for (const res of difusor.clientes) res.write(aviso);
  const c = leerContexto(ruta);
  if (c && JSON.stringify(c) !== JSON.stringify(contextos[sid])) { contextos = { ...contextos, [sid]: c }; avisar(); }
}

// Pizarra: worktrees de los repos donde trabajaron tus sesiones (últimos 30 días), con su plan, commits y noche.
let worktrees = [];
const cwdsRecientes = () => db.prepare('SELECT DISTINCT cwd FROM sesiones WHERE cwd IS NOT NULL AND ultimo_evento_ts > ?').all(Date.now() - 30 * 86400_000)
  .map((r) => r.cwd).filter(carpetaValida);
// Bóveda de Obsidian (solo lectura) para Planos: OFICINA_BOVEDA, o la carpeta de OFICINA_PREGUNTAS.
const BOVEDA = process.env.OFICINA_BOVEDA || (process.env.OFICINA_PREGUNTAS ? path.dirname(process.env.OFICINA_PREGUNTAS) : null);
async function actualizarWorktrees() {
  const cwds = cwdsRecientes();
  const nuevos = await leerWorktrees(cwds).catch((e) => { console.error('worktrees:', e.message); return worktrees; });
  if (JSON.stringify(nuevos) !== JSON.stringify(worktrees)) { worktrees = nuevos; avisar(); }
}

const estadoCompleto = () => ({ ...estado(db), worktrees, sync, vivas: Object.fromEntries(vivas), mensajes: mensajero.mensajes(), contexto: contextos, gastos, permisos: permisos.lista(), preguntas: preguntas.lista(), roles: listaRoles(), aspectos: listaAspectos(db) });

// Notificación de escritorio cuando una sesión pasa a pedirte algo o llega una corrección de ficha.
const notificar = crearNotificador();
function etiquetaSesion(sid) {
  const s = db.prepare(`SELECT s.cwd, s.tarea_id, s.nombre AS sesion, t.nombre AS tarea FROM sesiones s
                        LEFT JOIN tareas t ON t.id = s.tarea_id WHERE s.id = ?`).get(sid);
  return s?.tarea ?? s?.sesion ?? s?.tarea_id ?? path.basename(s?.cwd ?? sid);
}
// Sesiones a las que les escribiste desde la oficina: al terminar su turno te avisa que respondieron.
const esperanRespuesta = new Set();
function avisarCambios(cambios) {
  for (const c of cambios) {
    if (esperanRespuesta.has(c.sesion_id) && c.estado !== 'trabajando') {
      esperanRespuesta.delete(c.sesion_id);
      if (!ESTADOS_AVISO[c.estado]) {
        const { ultimo_mensaje } = db.prepare('SELECT ultimo_mensaje FROM sesiones WHERE id = ?').get(c.sesion_id);
        notificar({ titulo: `${etiquetaSesion(c.sesion_id)} te respondió`, cuerpo: ultimo_mensaje ?? '', urgente: false });
        continue;
      }
    }
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

// Cada evento avisa a la página al momento (avisar junta ráfagas), sin esperar al ciclo de 5 s.
function recibir(ev) {
  const sid = ev.payload?.session_id;
  avisarCambios(aplicar(db, ev, { rama, porPid: (pid) => [...vivas].find(([, v]) => v.pid === pid)?.[0] }));
  ligar(db, sid, ev.tarea_env);
  if (socketValido(ev.tmux_env) && sid) db.prepare('UPDATE sesiones SET tmux = ? WHERE id = ?').run(ev.tmux_env, sid);
  if (sid && esRol(ev.rol_env)) encargos.alRegistrarRol(sid, ev.rol_env, /^\d{1,9}$/.test(ev.encargo_env ?? '') ? Number(ev.encargo_env) : null);
  if (ev.evento === 'Stop' && sid) encargos.alTerminarTurno(sid, ev.payload.last_assistant_message).catch((e) => console.error('encargo:', e.message));
  if (ev.evento === 'SessionStart' || ev.evento === 'UserPromptSubmit' || ev.evento === 'SessionEnd') vigilarTranscripts();
  avisar();
}

// SSE (ver difusion.js): ráfagas juntas, sin repetir estado idéntico, con keepalive.
const difusor = crearDifusor({ estado: estadoCompleto });
const avisar = () => difusor.avisar();

// Quién tiene la terminal libre y cómo llegarle: tmux tecleado si está libre, si no el mensajero (bandeja de Claude Code).
// Teclear encima de un diálogo lo contestaría por accidente: los diálogos van por sus botones.
// («duda» por la marca DUDA: es texto y se contesta escribiendo; una pregunta con opciones sí es diálogo.)
const dialogoAbierto = (sid, s, viva) => s.estado === 'necesita_permiso' ? 'pide un permiso' : viva?.esperando ? 'su terminal muestra un diálogo'
  : preguntas.lista().some((p) => p.sid === sid) ? 'te hizo una pregunta con opciones' : null;
const sesionViva = async (sid) => {
  const s = db.prepare('SELECT tmux FROM sesiones WHERE id = ?').get(sid);
  return vivas.has(sid) || (!!s?.tmux && await vive(s.tmux));
};

// Entrega de una sesión a otra (encargos y sus entregas). Segunda y última entrada al teclado, además de /mensaje:
// el texto lleva siempre su cabecera «Encargo de …» / «Entrega de …», y la audita en `eventos`.
async function entregar(sid, texto, { de = null, alFallar = () => {} } = {}) {
  const s = db.prepare('SELECT cwd, estado, tmux FROM sesiones WHERE id = ?').get(sid);
  const viva = vivas.get(sid);
  const enTmux = !!s?.tmux && await vive(s.tmux);
  if (!s || (!viva && !enTmux)) return { ok: false, detalle: 'la sesión no está abierta' };
  const dialogo = enTmux ? dialogoAbierto(sid, s, viva) : null;
  const bandeja = !!viva?.bandeja && !!viva.nombre;
  const via = enTmux && !dialogo && (s.estado !== 'trabajando' || !bandeja) ? 'tmux' : bandeja ? 'mensajero' : null;
  if (!via) return { ok: false, detalle: dialogo ? `${dialogo}; contéstalo en la oficina y reenvía` : 'sin bandeja de mensajes ni terminal libre' };
  if (via === 'tmux') {
    try { await enviarTexto(s.tmux, texto); } catch (e) { return { ok: false, detalle: `no pude teclear en su terminal: ${e.message}` }; }
    mensajero.anotar(sid, texto);
  } else {
    mensajero.enviar(sid, { nombre: viva.nombre, cwd: s.cwd }, texto, (m) => { if (m.estado === 'error') alFallar(m.detalle ?? 'el mensajero falló'); });
  }
  db.prepare('INSERT INTO eventos (sesion_id, tipo, ts, payload_json) VALUES (?, ?, ?, ?)')
    .run(sid, via === 'tmux' ? 'teclado' : 'mensaje_oficina', Date.now(), JSON.stringify({ via, de, texto: texto.slice(0, MAX_TEXTO) }));
  return { ok: true, via };
}
// Cerrar una sesión: su tmux si lo tiene (Claude Code recibe SIGHUP y guarda la conversación); si no, su proceso.
async function cerrarPorId(sid) {
  const s = db.prepare('SELECT tmux FROM sesiones WHERE id = ?').get(sid);
  if (s?.tmux && await vive(s.tmux)) {
    await cerrarTmux(s.tmux).catch(() => {});
    setTimeout(actualizarVivas, 1500);
    return { ok: true };
  }
  const viva = vivas.get(sid);
  if (!viva) return { ok: false, status: 409, motivo: 'la sesión ya no está abierta' };
  const r = await cerrarSesion(viva);
  if (!r.ok) return { ok: false, status: 422, motivo: r.motivo };
  setTimeout(actualizarVivas, 1500);
  return { ok: true };
}
const encargos = crearEncargos({ db, entregar, vivo: sesionViva, etiqueta: etiquetaSesion, alCambiar: () => avisar(),
  // Tras su ENTREGA: deja que el reenvío salga antes de cerrar su terminal.
  apagar: (sid) => new Promise((listo) => setTimeout(() => cerrarPorId(sid).then(listo, listo), 3000)),
  lanzar: async (datos) => nivelMemoria(leerMeminfo()) === 'critico'
    ? { ok: false, motivo: 'Memoria casi agotada: no abro otra sesión.' }
    : lanzarSesion({ ...datos, nombre: `rol-${datos.rol}${datos.encargo ? `-${datos.encargo}` : ''}`, tarea: null, modelo: datos.modelo ?? '' }).then((r) => { if (r.ok) actualizarVivas(); return r; }) });

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
  // Host exacto (DNS rebinding); en todo POST: JSON, origen propio y token de este arranque.
  const rechazo = autorizar(req, { hosts: HOSTS, token: TOKEN, sesionValida });
  if (rechazo) return json(res, rechazo.status, { error: rechazo.error });
  const url = new URL(req.url, `http://${req.headers.host}`);
  let m;
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
    // Entrar con tu frase: cookie HttpOnly por 30 días en este navegador. No hay que escribirla para cada acción.
    if (req.method === 'GET' && url.pathname === '/api/yo') {
      const c = leerCookie(req.headers);
      return json(res, 200, { entrado: !!c && sesionValida(c), frase: !!leerFrase(), nombre: process.env.OFICINA_NOMBRE || null });
    }
    // Últimas líneas del log de un proceso en segundo plano, si su comando lo manda a un .log dentro de tu home.
    if (req.method === 'GET' && (m = url.pathname.match(/^\/api\/sesiones\/([^/]+)\/log$/))) {
      const s = db.prepare('SELECT procesos_json FROM sesiones WHERE id = ?').get(m[1]);
      let procesos = [];
      try { procesos = JSON.parse(s?.procesos_json ?? '[]') ?? []; } catch {}
      const p = procesos[Number(url.searchParams.get('i'))];
      const ruta = p?.descripcion?.match(/>{1,2}\s*(\S+\.log)\b/)?.[1];
      if (!ruta) return json(res, 404, { error: 'ese proceso no escribe a un .log' });
      const real = path.resolve(ruta.replace(/^~(?=\/)/, os.homedir()));
      if (!real.startsWith(os.homedir() + path.sep) || !real.endsWith('.log')) return json(res, 403, { error: 'ese log está fuera de tu home' });
      const n = Math.min(Math.max(Number(url.searchParams.get('n')) || 40, 1), 400);
      try {
        const fd = fs.openSync(real, 'r');
        const { size } = fs.fstatSync(fd);
        const largo = Math.min(size, 256 * 1024);
        const buf = Buffer.alloc(largo);
        fs.readSync(fd, buf, 0, largo, size - largo);
        fs.closeSync(fd);
        return json(res, 200, { ruta: real, texto: buf.toString('utf8').split('\n').slice(-n - 1).join('\n').trimEnd() });
      } catch (e) { return json(res, 404, { error: `no pude leer el log: ${e.code ?? e.message}` }); }
    }
    if (req.method === 'POST' && url.pathname === '/api/entrar') {
      if (!puedeIntentar()) return json(res, 429, { error: 'demasiados intentos; espera un minuto' });
      const guardada = leerFrase();
      if (!guardada) return json(res, 409, { error: 'aún no hay frase: córrela en tu terminal con scripts/poner-frase.sh' });
      const { frase } = await leerJson(req);
      if (!fraseCorrecta(frase, guardada)) return json(res, 403, { error: 'frase incorrecta' });
      const valor = crypto.randomBytes(32).toString('hex');
      const ahora = Date.now();
      db.prepare('DELETE FROM web_sesiones WHERE vence_ts < ?').run(ahora);
      db.prepare('INSERT INTO web_sesiones (hash, creado_ts, vence_ts) VALUES (?, ?, ?)').run(hashCookie(valor), ahora, ahora + DURACION_MS);
      res.setHeader('Set-Cookie', `${COOKIE}=${valor}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DURACION_MS / 1000}`);
      return json(res, 204);
    }
    if (req.method === 'POST' && url.pathname === '/api/salir') {
      db.prepare('DELETE FROM web_sesiones WHERE hash = ?').run(hashCookie(leerCookie(req.headers)));
      res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
      return json(res, 204);
    }
    // Un agente pide abrir otra sesión (scripts/pedir-sesion.sh, con el token de los hooks). Solo queda pendiente:
    // la abres tú con «Abrir» en la página.
    if (req.method === 'POST' && url.pathname === '/api/solicitudes') {
      const { de_sesion = null, nombre = '', cwd, prompt, permiso = 'manual', modelo = '', tarea_id = null } = await leerJson(req);
      const texto = typeof prompt === 'string' ? prompt.trim() : '';
      if (!carpetaValida(cwd)) return json(res, 400, { error: 'la carpeta no existe o está fuera de tu home' });
      if (!texto || texto.length > MAX_TEXTO) return json(res, 400, { error: `la indicación debe tener entre 1 y ${MAX_TEXTO} caracteres` });
      if (!PERMISOS.includes(permiso)) return json(res, 400, { error: 'modo de permisos no válido' });
      if (!MODELOS.includes(modelo)) return json(res, 400, { error: 'modelo no válido' });
      if (tarea_id && !FORMATO_ID.test(tarea_id)) return json(res, 400, { error: 'tarea_id no válido' });
      const limpio = typeof nombre === 'string' ? nombre.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80) : '';
      const pidio = typeof de_sesion === 'string' && /^[0-9a-f-]{36}$/.test(de_sesion) ? de_sesion : null;
      const { lastInsertRowid } = db.prepare(`INSERT INTO solicitudes (de_sesion, nombre, cwd, prompt, permiso, modelo, tarea_id, creado_ts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(pidio, limpio, path.resolve(cwd), texto, permiso, modelo, tarea_id, Date.now());
      notificar({ titulo: `${pidio ? etiquetaSesion(pidio) : 'Un agente'} quiere abrir una sesión`, cuerpo: limpio || texto.slice(0, 200), urgente: false });
      avisar();
      return json(res, 201, { id: Number(lastInsertRowid), estado: 'pendiente', aviso: 'Geovany la abre o la rechaza desde la oficina.' });
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/solicitudes\/([0-9]+)\/(aprobar|rechazar)$/))) {
      const s = db.prepare(`SELECT * FROM solicitudes WHERE id = ? AND estado = 'pendiente'`).get(m[1]);
      if (!s) return json(res, 404, { error: 'esa solicitud ya no está pendiente' });
      if (m[2] === 'aprobar') {
        if (nivelMemoria(leerMeminfo()) === 'critico') return json(res, 409, { error: 'Memoria casi agotada: pausa o cierra un agente antes de abrir otro.' });
        const r = await lanzarSesion({ cwd: s.cwd, prompt: s.prompt, nombre: s.nombre, permiso: s.permiso, tarea: s.tarea_id, modelo: s.modelo ?? '' });
        if (!r.ok) return json(res, 422, { error: r.motivo });
        actualizarVivas();
      }
      db.prepare('UPDATE solicitudes SET estado = ?, resuelto_ts = ? WHERE id = ?').run(m[2] === 'aprobar' ? 'aprobada' : 'rechazada', Date.now(), s.id);
      avisar();
      return json(res, 204);
    }
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
    // hooks/pregunta.sh (PreToolUse de AskUserQuestion): igual que un permiso, pero se contesta con opciones.
    if (req.method === 'POST' && url.pathname === '/api/preguntas') {
      const ev = await leerJson(req);
      if (ev?.evento !== 'PreToolUse' || ev.payload?.tool_name !== 'AskUserQuestion' || typeof ev.payload?.session_id !== 'string'
        || !Array.isArray(ev.payload.tool_input?.questions)) return json(res, 400, { error: 'se espera un AskUserQuestion' });
      recibir({ ts: Date.now(), ...ev, evento: 'Pregunta' }); // no es un subagente: solo registra la sesión
      const primera = ev.payload.tool_input.questions[0]?.question;
      db.prepare('UPDATE sesiones SET ultimo_mensaje = ? WHERE id = ?').run(`Te pregunta: ${String(primera ?? '').slice(0, 300)}`, ev.payload.session_id);
      avisarCambios(cambiarEstado(db, ev.payload.session_id, 'duda', Date.now()));
      const id = preguntas.pedir(ev.payload, (cuerpo) => {
        if (res.writableEnded) return;
        if (cuerpo) json(res, 200, cuerpo); else { res.writeHead(204); res.end(); }
      });
      res.on('close', () => preguntas.abandonar(id));
      return;
    }
    // Encargos por rol: la sesión fija del rol (o una nueva) lo hace y su ENTREGA: vuelve a la sesión de origen.
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/roles\/([^/]+)\/(encargo|sesion)$/))) {
      if (!esRol(m[1])) return json(res, 404, { error: `rol desconocido; roles: ${Object.keys(ROLES).join(', ')}` });
      const { texto, de_sesion = null, cwd = null, cadena = [] } = await leerJson(req);
      if (cwd !== null && !carpetaValida(cwd)) return json(res, 400, { error: 'la carpeta no existe o está fuera de tu home' });
      if (de_sesion !== null && !(typeof de_sesion === 'string' && /^[0-9a-f-]{36}$/.test(de_sesion))) return json(res, 400, { error: 'de_sesion no válida' });
      const carpeta = cwd === null ? null : path.resolve(cwd);
      try {
        if (m[2] === 'sesion') {
          if (!carpeta) return json(res, 400, { error: 'falta cwd' });
          await encargos.abrir({ rol: m[1], cwd: carpeta });
          return json(res, 201, { rol: m[1] });
        }
        const limpio = typeof texto === 'string' ? texto.trim() : '';
        if (!limpio || limpio.length > MAX_TEXTO) return json(res, 400, { error: `el encargo debe tener entre 1 y ${MAX_TEXTO} caracteres` });
        const r = await encargos.encargar({ rol: m[1], texto: limpio, de_sesion, cwd: carpeta, cadena });
        avisar();
        return r.estado === 'error' ? json(res, 502, { error: r.detalle, ...r }) : json(res, 202, r);
      } catch (e) {
        if (e instanceof ErrorEncargo) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    // Resultado completo de un encargo (la entrega reenviada se recorta).
    if (req.method === 'GET' && (m = url.pathname.match(/^\/api\/encargos\/(\d+)$/))) {
      const e = db.prepare('SELECT id, rol, estado, texto, resultado, detalle FROM encargos WHERE id = ?').get(Number(m[1]));
      return e ? json(res, 200, e) : json(res, 404, { error: 'no existe ese encargo' });
    }
    // Respuesta a la DUDA:/BLOQUEO: de un rol (/responder, con el token de los agentes o tu cookie).
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/encargos\/(\d+)\/respuesta$/))) {
      const { texto, de_sesion = null } = await leerJson(req);
      if (de_sesion !== null && !(typeof de_sesion === 'string' && /^[0-9a-f-]{36}$/.test(de_sesion))) return json(res, 400, { error: 'de_sesion no válida' });
      const limpio = typeof texto === 'string' ? texto.trim() : '';
      if (!limpio || limpio.length > MAX_TEXTO) return json(res, 400, { error: `la respuesta debe tener entre 1 y ${MAX_TEXTO} caracteres` });
      try { return json(res, 200, await encargos.responder({ id: Number(m[1]), texto: limpio, de_sesion })); } catch (e) {
        if (e instanceof ErrorEncargo) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    // Armería: configuración de un rol (modelo, permisos, skills, instrucciones) y skills que puede equipar.
    if (req.method === 'GET' && url.pathname === '/api/skills') return json(res, 200, listaSkills());
    if ((m = url.pathname.match(/^\/api\/roles\/([^/]+)\/config$/)) && (req.method === 'GET' || req.method === 'POST')) {
      if (!esRol(m[1])) return json(res, 404, { error: 'rol desconocido' });
      if (req.method === 'GET') return json(res, 200, leerRol(m[1]));
      try { const r = guardarRol(m[1], await leerJson(req)); avisar(); return json(res, 200, r); } catch (e) {
        if (e instanceof ErrorEncargo) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    // Armería: equipo de un rol, una sesión o el tuyo (solo con tu cookie). Cuerpo vacío o null lo quita.
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/aspectos\/([^/]+)$/))) {
      const clave = decodeURIComponent(m[1]);
      if (!claveValida(clave)) return json(res, 400, { error: 'clave no válida: rol:<id>, sesion:<uuid> o yo' });
      if (clave.startsWith('rol:') && !esRol(clave.slice(4))) return json(res, 404, { error: 'rol desconocido' });
      const aspecto = guardarAspecto(db, clave, await leerJson(req));
      avisar();
      return json(res, 200, { clave, aspecto });
    }
    if (req.method === 'GET' && url.pathname === '/api/siguiente') {
      const n = Math.min(Math.max(Number.parseInt(url.searchParams.get('n') ?? '15', 10) || 15, 1), 50);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(siguiente(db, { n, sync }) + resumenBandeja(process.env.OFICINA_PREGUNTAS));
    }
    // Bandeja de preguntas (preguntas.md del vault, OFICINA_PREGUNTAS).
    if (req.method === 'GET' && url.pathname === '/api/registro-preguntas') return json(res, 200, leerBandeja(process.env.OFICINA_PREGUNTAS));
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/registro-preguntas\/(P-\d+)$/))) {
      if (!process.env.OFICINA_PREGUNTAS) return json(res, 409, { error: 'falta OFICINA_PREGUNTAS en el .env' });
      let fila;
      try { fila = actualizarPregunta(process.env.OFICINA_PREGUNTAS, m[1], await leerJson(req)); } catch (e) { return json(res, 400, { error: e.message }); }
      return fila ? json(res, 200, fila) : json(res, 404, { error: 'esa pregunta no existe' });
    }
    // Planos: se arma al pedirlo (no viaja en estadoCompleto). La auditoría lee los checkouts principales además de los worktrees.
    if (req.method === 'GET' && (m = url.pathname.match(/^\/api\/planos(?:\/([\w-]+))?$/))) {
      if (!BOVEDA) return json(res, 409, { error: 'falta OFICINA_BOVEDA en el .env' });
      const ctx = { raiz: BOVEDA, preguntas: process.env.OFICINA_PREGUNTAS, worktrees: await leerWorktrees(cwdsRecientes(), { conPrincipal: true }).catch(() => []) };
      if (!m[1]) return json(res, 200, tablero(ctx));
      const d = detalle(m[1], ctx);
      return d ? json(res, 200, d) : json(res, 404, { error: 'ese módulo no existe' });
    }
    // Texto de una nota de la bóveda: frontera de confianza, solo .md y con el realpath dentro de la raíz.
    if (req.method === 'GET' && url.pathname === '/api/boveda/nota') {
      if (!BOVEDA) return json(res, 409, { error: 'falta OFICINA_BOVEDA en el .env' });
      const ruta = url.searchParams.get('ruta');
      if (!ruta || ruta.includes('\0') || !ruta.endsWith('.md')) return json(res, 400, { error: 'ruta de nota no válida (termina en .md)' });
      let real;
      try {
        const raiz = fs.realpathSync(BOVEDA);
        real = fs.realpathSync(path.resolve(raiz, ruta));
        if (!real.startsWith(raiz + path.sep) || !real.endsWith('.md')) real = null;
      } catch { real = null; }
      if (!real) return json(res, 404, { error: 'esa nota no existe' });
      return json(res, 200, { ruta: path.relative(fs.realpathSync(BOVEDA), real), texto: fs.readFileSync(real, 'utf8') });
    }
    if (req.method === 'POST' && url.pathname === '/api/sincronizar') {
      sincronizarClickup();
      return json(res, 202, { corriendo: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      difusor.alta(res);
      return;
    }
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
      const { decision, motivo, siempre = false } = await leerJson(req);
      if (decision !== 'allow' && decision !== 'deny') return json(res, 400, { error: 'decision debe ser allow o deny' });
      const sid = permisos.sesionDe(m[1]);
      if (sid && siempre === true && !permisos.lista().find((p) => p.id === m[1])?.reglas.length) {
        return json(res, 400, { error: 'Claude Code no sugirió reglas para «Permitir siempre»; apruébalo solo esta vez' });
      }
      if (!sid || !permisos.decidir(m[1], decision, typeof motivo === 'string' ? motivo.slice(0, 500) : undefined, { siempre: siempre === true })) {
        return json(res, 404, { error: 'ese permiso ya no está pendiente (se respondió o ya está en su terminal)' });
      }
      cambiarEstado(db, sid, 'trabajando', Date.now()); // con la decisión, el agente sigue
      avisar();
      return json(res, 204);
    }
    // Suelta el permiso para que su diálogo aparezca en la terminal (el hook responde sin decisión).
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/permisos\/([0-9]+)\/terminal$/))) {
      if (!permisos.abandonar(m[1])) return json(res, 404, { error: 'ese permiso ya no está pendiente' });
      return json(res, 204);
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/preguntas\/([0-9]+)$/))) {
      const { respuestas } = await leerJson(req);
      const sid = preguntas.sesionDe(m[1]);
      if (!sid) return json(res, 404, { error: 'esa pregunta ya no está pendiente (se respondió o ya está en su terminal)' });
      if (!preguntas.contestar(m[1], respuestas)) return json(res, 400, { error: 'responde todas las preguntas' });
      cambiarEstado(db, sid, 'trabajando', Date.now());
      avisar();
      return json(res, 204);
    }
    if (req.method === 'GET' && (m = url.pathname.match(/^\/api\/sesiones\/([^/]+)\/conversacion$/))) {
      const s = db.prepare('SELECT transcript_path FROM sesiones WHERE id = ?').get(m[1]);
      if (!s) return json(res, 404, { error: 'sesión no existe' });
      return json(res, 200, leerConversacion(s.transcript_path, 16));
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/sesiones\/([^/]+)\/mensaje$/))) {
      // Todo rechazo queda en el log del servicio (journalctl) con la sesión y el motivo.
      const rechazar = (codigo, error) => { console.warn(`mensaje rechazado · ${m[1].slice(0, 8)} · ${codigo} · ${error}`); return json(res, codigo, { error }); };
      const { texto, imagenes } = await leerJson(req);
      const limpio = typeof texto === 'string' ? texto.trim() : '';
      const hayImagenes = Array.isArray(imagenes) && imagenes.length > 0;
      if ((!limpio && !hayImagenes) || limpio.length > MAX_TEXTO) return rechazar(400, `escribe entre 1 y ${MAX_TEXTO} caracteres o adjunta una imagen`);
      const s = db.prepare('SELECT cwd, estado, tmux FROM sesiones WHERE id = ?').get(m[1]);
      const viva = vivas.get(m[1]);
      const enTmux = !!s?.tmux && await vive(s.tmux);
      if (!s || (!viva && !enTmux)) return rechazar(409, 'la sesión no está abierta');
      if (!enTmux && (!viva.bandeja || !viva.nombre)) return rechazar(409, 'esta sesión no tiene bandeja de mensajes; ábrela de nuevo para activarla');
      if (enTmux) {
        const dialogo = dialogoAbierto(m[1], s, viva);
        if (dialogo) return rechazar(409, `${dialogo}; contéstalo con los botones de arriba y vuelve a enviar`);
      }
      let rutas;
      try { rutas = guardarImagenes(path.join(DATOS, 'adjuntos'), imagenes); } catch (e) { return json(res, 400, { error: e.message }); }
      const completo = conImagenes(limpio, rutas);
      let enviado;
      if (enTmux) {
        // Única entrada al teclado de una sesión: solo texto que escribiste en la página (ver test/teclado.test.js).
        try { await enviarTexto(s.tmux, completo); } catch (e) { return json(res, 502, { error: `no pude teclear en su terminal: ${e.message}` }); }
        enviado = mensajero.anotar(m[1], completo);
      } else {
        enviado = mensajero.enviar(m[1], { nombre: viva.nombre, cwd: s.cwd }, completo);
      }
      esperanRespuesta.add(m[1]);
      // Auditoría: todo lo que la oficina hace llegar a una sesión en tu nombre (se borra a los 7 días con los eventos).
      db.prepare('INSERT INTO eventos (sesion_id, tipo, ts, payload_json) VALUES (?, ?, ?, ?)')
        .run(m[1], enTmux ? 'teclado' : 'mensaje_oficina', Date.now(), JSON.stringify({ via: enTmux ? 'tmux' : 'mensajero', texto: completo.slice(0, MAX_TEXTO) }));
      return json(res, 202, { id: enviado.id });
    }
    // Sesiones en tmux: ver su pantalla y contestar un diálogo que pasó a la terminal (solo teclas permitidas).
    if (req.method === 'GET' && (m = url.pathname.match(/^\/api\/sesiones\/([^/]+)\/pantalla$/))) {
      const s = db.prepare('SELECT tmux FROM sesiones WHERE id = ?').get(m[1]);
      if (!s?.tmux || !(await vive(s.tmux))) return json(res, 409, { error: 'esta sesión no corre en tmux' });
      return json(res, 200, { texto: await capturar(s.tmux) });
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/sesiones\/([^/]+)\/tecla$/))) {
      const { tecla } = await leerJson(req);
      const s = db.prepare('SELECT tmux FROM sesiones WHERE id = ?').get(m[1]);
      if (!s?.tmux || !(await vive(s.tmux))) return json(res, 409, { error: 'esta sesión no corre en tmux' });
      try { await enviarTecla(s.tmux, tecla); } catch (e) { return json(res, 400, { error: e.message }); }
      db.prepare('INSERT INTO eventos (sesion_id, tipo, ts, payload_json) VALUES (?, ?, ?, ?)')
        .run(m[1], 'teclado', Date.now(), JSON.stringify({ via: 'tmux', tecla }));
      return json(res, 204);
    }
    if (req.method === 'GET' && url.pathname === '/api/noche') return json(res, 200, leerNoche());
    if (req.method === 'GET' && url.pathname === '/api/memoria') return json(res, 200, memoria(vivas));
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/sesiones\/([^/]+)\/(pausar|reanudar)$/))) {
      const viva = vivas.get(m[1]);
      if (!viva?.pid || !esClaude(viva.pid)) return json(res, 409, { error: 'la sesión no está abierta' });
      pausar(viva.pid, { reanudar: m[2] === 'reanudar' });
      return json(res, 204);
    }
    // Sin memoria no se abren ni retoman sesiones: otra más haría que systemd-oomd mate a las que ya trabajan.
    if (req.method === 'POST' && (url.pathname === '/api/sesiones/nueva' || /^\/api\/sesiones\/[^/]+\/retomar$/.test(url.pathname))
        && nivelMemoria(leerMeminfo()) === 'critico') {
      return json(res, 409, { error: 'Memoria casi agotada: no abro otra sesión. Pausa o cierra un agente en «Memoria» y vuelve a intentarlo.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/carpetas') return json(res, 200, carpetasConocidas(db));
    if (req.method === 'POST' && url.pathname === '/api/sesiones/nueva') {
      // ubicacion: 'worktree' (el de la tarea; cwd = su repo), 'aparte' (carpeta nueva en ~/Agentes) o 'carpeta' (cwd tal cual).
      const { cwd, prompt, nombre, permiso, tarea_id, donde, modelo = '', ubicacion = 'carpeta' } = await leerJson(req);
      const texto = typeof prompt === 'string' ? prompt.trim() : '';
      if (!['worktree', 'aparte', 'carpeta'].includes(ubicacion)) return json(res, 400, { error: 'ubicación no válida' });
      if (ubicacion !== 'aparte' && !carpetaValida(cwd)) return json(res, 400, { error: 'la carpeta no existe o está fuera de tu home' });
      if (!texto || texto.length > MAX_TEXTO) return json(res, 400, { error: `la indicación debe tener entre 1 y ${MAX_TEXTO} caracteres` });
      if (!PERMISOS.includes(permiso)) return json(res, 400, { error: 'modo de permisos no válido' });
      if (!MODELOS.includes(modelo)) return json(res, 400, { error: 'modelo no válido' });
      if (tarea_id && !(FORMATO_ID.test(tarea_id) && db.prepare('SELECT 1 FROM tareas WHERE id = ?').get(tarea_id))) {
        return json(res, 400, { error: 'tarea_id no es una tarea abierta conocida' });
      }
      if (ubicacion === 'worktree' && !tarea_id) return json(res, 400, { error: 'el worktree propio es para una tarea de ClickUp' });
      const limpio = typeof nombre === 'string' ? nombre.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80) : '';
      let carpeta = cwd, wt = null;
      if (ubicacion === 'worktree') {
        wt = await worktreeDeTarea(cwd, tarea_id);
        if (!wt.ok) return json(res, 422, { error: wt.motivo });
        carpeta = wt.cwd;
      } else if (ubicacion === 'aparte') {
        try { carpeta = carpetaAparte(limpio); } catch (e) { return json(res, 500, { error: `no pude crear la carpeta: ${e.message}` }); }
      }
      const lugar = { cwd: carpeta, worktree: wt && { creado: wt.creado, rama: wt.rama, base: wt.base ?? null } };
      const datosSesion = { cwd: carpeta, prompt: texto, nombre: limpio, permiso, tarea: tarea_id || null, modelo };
      if (donde === 'terminal') { nuevaEnTerminal(datosSesion); return json(res, 201, { terminal: true, ...lugar }); }
      const r = await lanzarSesion(datosSesion);
      if (!r.ok) return json(res, 422, { error: r.motivo, ...lugar });
      actualizarVivas();
      return json(res, 201, { id: r.id ?? null, confianza: r.confianza === true, ...lugar });
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/sesiones\/([^/]+)\/cerrar$/))) {
      const r = await cerrarPorId(m[1]);
      return r.ok ? json(res, 204) : json(res, r.status, { error: r.motivo });
    }
    // Pendientes: sesiones que murieron sin cerrarse (Retomar / Descartar) y notas sueltas.
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/sesiones\/([^/]+)\/retomar$/))) {
      const s = db.prepare(`SELECT * FROM sesiones WHERE id = ? AND pendiente = 1`).get(m[1]);
      if (!s) return json(res, 404, { error: 'esa sesión ya no está pendiente' });
      if (!carpetaValida(s.cwd)) return json(res, 422, { error: `su carpeta ya no existe: ${s.cwd}` });
      const r = await lanzarSesion({ cwd: s.cwd, reanudar: s.id, nombre: s.nombre, permiso: PERMISOS.includes(s.permission_mode) ? s.permission_mode : 'auto',
        tarea: s.tarea_id, prompt: 'Tu sesión anterior se cerró sin terminar (proceso muerto). Revisa dónde quedaste y sigue con lo que estabas haciendo.' });
      if (!r.ok) return json(res, 422, { error: r.motivo });
      db.prepare('UPDATE sesiones SET pendiente = 0 WHERE id = ?').run(s.id);
      actualizarVivas();
      avisar();
      return json(res, 201, { id: r.id });
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/sesiones\/([^/]+)\/descartar$/))) {
      if (!db.prepare('UPDATE sesiones SET pendiente = 0 WHERE id = ?').run(m[1]).changes) return json(res, 404, { error: 'sesión no existe' });
      avisar();
      return json(res, 204);
    }
    if (req.method === 'POST' && url.pathname === '/api/pendientes') {
      const { texto } = await leerJson(req);
      const limpio = typeof texto === 'string' ? texto.trim() : '';
      if (!limpio || limpio.length > 500) return json(res, 400, { error: 'escribe entre 1 y 500 caracteres' });
      db.prepare('INSERT INTO pendientes (texto, creado_ts) VALUES (?, ?)').run(limpio, Date.now());
      avisar();
      return json(res, 201, {});
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/pendientes\/([0-9]+)\/hecho$/))) {
      if (!db.prepare('UPDATE pendientes SET hecho_ts = ? WHERE id = ? AND hecho_ts IS NULL').run(Date.now(), m[1]).changes) return json(res, 404, { error: 'ese pendiente no existe' });
      avisar();
      return json(res, 204);
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/sesiones\/([^/]+)\/terminal$/))) {
      const viva = vivas.get(m[1]);
      const s = db.prepare('SELECT tmux FROM sesiones WHERE id = ?').get(m[1]);
      if (s?.tmux && await vive(s.tmux)) { abrirTmux(s.tmux); return json(res, 204); }
      if (viva?.tipo !== 'background' || !viva.corto) return json(res, 409, { error: 'solo las sesiones en segundo plano o en tmux se abren así' });
      abrirTerminal(viva.corto);
      return json(res, 204);
    }
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      const archivo = archivoWeb(WEB, url.pathname);
      if (!archivo || !fs.statSync(archivo, { throwIfNoEntry: false })?.isFile()) {
        if (url.pathname === '/') return json(res, 503, { error: 'falta compilar la página: npm --prefix web install && npm run build' });
        return json(res, 404, { error: 'no existe' });
      }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
      return fs.createReadStream(archivo).pipe(res); // sin token: la página actúa con tu cookie, no con la llave de los hooks
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
  vigilarTranscripts();
}, 5000);
vigilarTranscripts();
actualizarVivas();
actualizarContextos();
setInterval(actualizarContextos, 20_000);
actualizarWorktrees();
setInterval(actualizarWorktrees, 30_000);
sincronizarClickup();
setInterval(sincronizarClickup, 5 * 60_000);
servidor.listen(PUERTO, '127.0.0.1', () => console.log(`oficina en http://127.0.0.1:${PUERTO}`));
