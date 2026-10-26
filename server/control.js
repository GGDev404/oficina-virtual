// Abrir y cerrar sesiones de Claude Code desde la oficina.
// - Nueva: `claude` dentro de su propio tmux (nuevaEnTmux); con OFICINA_LANZADOR=bg, `claude --bg` (nuevaSesion).
//   CLICKUP_TASK la liga a su tarea desde el primer evento.
// - Cerrar: las de segundo plano con `claude stop <id>`; las interactivas (terminal o app) con SIGTERM a su proceso.
//   En ambos casos la conversación queda guardada y se retoma con `claude --resume <id>` o `claude attach <id>`.
import { execFile, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { socketDe, argsNueva, argsAdjuntar, capturar } from './tmux.js';

export const PERMISOS = ['auto', 'acceptEdits', 'manual']; // nunca bypassPermissions desde una página
export const MOTORES = ['claude', 'agy'];
// Modelos que puedes elegir al abrir una sesión ('' = el predeterminado de Claude Code).
export const MODELOS = ['', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'];
export const MODELOS_AGY = ['', 'gemini-3.8-flash-high', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-low', 'claude-sonnet-4-6', 'claude-opus-4-6-thinking'];
export const APARTE = path.join(os.homedir(), 'Agentes'); // trabajos sin tarea: fuera de cualquier repo
const HOME = os.homedir() + path.sep;

// Cada sesión en su propio scope de systemd, fuera del cgroup del servicio: si la memoria se agota, systemd-oomd
// mata solo el scope más pesado (una sesión) y no el servicio con todas las sesiones dentro (incidente 2026-10-20).
export const enScope = (lanzar) => (cmd, args, opciones) =>
  lanzar('systemd-run', ['--user', '--scope', '--collect', '--quiet', cmd, ...args], opciones);

export const correr = (claude, args, opciones) => new Promise((ok) => {
  execFile(claude, args, { timeout: 60_000, maxBuffer: 1024 * 1024, ...opciones }, (e, salida = '', errores = '') => {
    ok({ e, texto: `${salida}\n${errores}`.trim() });
  }).stdin?.end();
});

// Carpeta válida para una sesión nueva: absoluta, existente y dentro de tu home (no /tmp ni rutas del sistema).
export function carpetaValida(cwd) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return false;
  const real = path.resolve(cwd);
  if (!(real + path.sep).startsWith(HOME)) return false;
  try { return fs.statSync(real).isDirectory(); } catch { return false; }
}

// Sugerencias de carpeta: donde ya trabajaron tus sesiones (la más reciente primero) y los worktrees de esos repos.
export function carpetasConocidas(db, { worktrees = worktreesDe } = {}) {
  const usadas = db.prepare('SELECT cwd, MAX(ultimo_evento_ts) AS ts FROM sesiones WHERE cwd IS NOT NULL GROUP BY cwd ORDER BY ts DESC').all()
    .map((r) => r.cwd).filter((c) => carpetaValida(c) && !c.includes('/.claude-mem/') && !c.endsWith('/oficina-virtual/mensajero'));
  return [...new Set([...usadas, ...usadas.flatMap(worktrees)])].filter(carpetaValida);
}

function worktreesDe(repo) {
  try {
    return execFileSync('git', ['-C', repo, 'worktree', 'list', '--porcelain'], { timeout: 2000, encoding: 'utf8' })
      .split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9));
  } catch { return []; }
}

const gitAsync = promisify(execFile);
const git = async (args) => (await gitAsync('git', args, { timeout: 60_000, encoding: 'utf8' })).stdout.trim();

// Worktree propio de una tarea de ClickUp, con la misma convención que el turno nocturno (scripts/night/turno.sh):
// <repo>.worktrees/<ID>, en la rama que lleve el ID (local o de origin) o, si no hay, separado de origin/develop.
// Si la tarea ya tiene worktree, se usa ese. `repo` puede ser el repo principal o cualquiera de sus worktrees.
export async function worktreeDeTarea(repo, id, { g = git, enlazar = enlazarArnes } = {}) {
  let main;
  try { main = path.dirname(path.resolve(repo, await g(['-C', repo, 'rev-parse', '--git-common-dir']))); }
  catch { return { ok: false, motivo: 'esa carpeta no es un repositorio de git' }; }
  if (!carpetaValida(main)) return { ok: false, motivo: 'el repositorio está fuera de tu home' };
  const lista = (await g(['-C', main, 'worktree', 'list', '--porcelain'])).split('\n\n').map((b) => ({
    ruta: b.match(/^worktree (.+)$/m)?.[1], rama: b.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? '' }));
  const ya = lista.find((w) => w.ruta && w.ruta !== main && (w.ruta.includes(id) || (w.rama.includes(id) && !w.rama.endsWith('-noche'))));
  if (ya) return { ok: true, cwd: ya.ruta, creado: false, rama: ya.rama || null };
  const wt = `${main}.worktrees/${id}`;
  if (fs.existsSync(wt)) return { ok: false, motivo: `${wt} ya existe pero no es un worktree de ese repo` };
  try { await g(['-C', main, 'fetch', '-q', 'origin']); } catch {} // sin red se trabaja con lo que haya
  const ramas = (args) => g(['-C', main, 'branch', ...args, '--list', `*${id}*`, '--format=%(refname:short)'])
    .then((t) => t.split('\n').filter((r) => r && !r.endsWith('-noche')));
  const local = (await ramas([]))[0];
  const remota = local ? null : (await ramas(['-r']))[0];
  let base = null;
  if (!local && !remota) {
    for (const r of ['origin/develop', 'origin/HEAD']) {
      try { await g(['-C', main, 'rev-parse', '--verify', '-q', r]); base = r; break; } catch {}
    }
    if (!base) return { ok: false, motivo: 'no encontré origin/develop ni origin/HEAD para la base' };
  }
  try {
    await g(['-C', main, 'worktree', 'add', '-q',
      ...(local ? [wt, local] : remota ? ['-b', remota.replace(/^origin\//, ''), wt, remota] : ['--detach', wt, base])]);
  } catch (e) { return { ok: false, motivo: `git worktree add falló: ${String(e.stderr || e.message).split('\n')[0]}` }; }
  enlazar(main, wt);
  return { ok: true, cwd: wt, creado: true, rama: local ?? remota?.replace(/^origin\//, '') ?? null, base };
}

// Lo que el repo ignora solo en local (.git/info/exclude) y los archivos de entorno se enlazan al repo principal,
// igual que link_harness del turno nocturno: así el arnés y la configuración local llegan al worktree.
export function enlazarArnes(main, wt) {
  let exclude = '';
  try { exclude = fs.readFileSync(path.join(main, '.git', 'info', 'exclude'), 'utf8'); } catch {}
  const rutas = exclude.split('\n').filter((l) => l.startsWith('/')).map((l) => l.replace(/^\/|\/$/g, ''))
    .filter((p) => p && !p.includes('*') && !['test-results', 'graphify-out', 'preflight-report.md'].includes(p));
  for (const p of [...rutas, '.local-context', 'node_modules', '.env.local', 'frontend/.env.local', 'frontend/.env.development.local']) {
    const origen = path.join(main, p), destino = path.join(wt, p);
    if (!fs.existsSync(origen) || fs.existsSync(destino)) continue;
    try { fs.mkdirSync(path.dirname(destino), { recursive: true }); fs.symlinkSync(fs.realpathSync(origen), destino); } catch {}
  }
}

// Carpeta nueva para un trabajo sin tarea, fuera de cualquier repo: ~/Agentes/<fecha>-<nombre>.
export function carpetaAparte(nombre, { raiz = APARTE, hoy = new Date() } = {}) {
  const slug = (nombre || 'sesion').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sesion';
  const base = path.join(raiz, `${hoy.toISOString().slice(0, 10)}-${slug}`);
  let ruta = base;
  for (let n = 2; fs.existsSync(ruta); n++) ruta = `${base}-${n}`;
  fs.mkdirSync(ruta, { recursive: true });
  return ruta;
}

// `reanudar`: id de una sesión que murió; la retoma con toda su conversación (Claude Code le da un id nuevo).
// `permitidos` va antes de --permission-mode: --allowedTools toma varios valores y se tragaría la indicación.
const argsPermitidos = (permitidos, prohibidos) => [...(permitidos?.length ? ['--allowedTools', ...permitidos] : []), ...(prohibidos?.length ? ['--disallowedTools', ...prohibidos] : [])];
export async function nuevaSesion({ cwd, prompt, nombre, permiso, tarea, modelo, reanudar, sistema, rol, permitidos, prohibidos, encargo, motor = 'claude' }, { claude = 'claude', agy = 'agy', ejecutar = enScope(correr) } = {}) {
  if (motor === 'agy') {
    const agyPermiso = permiso === 'acceptEdits' || permiso === 'auto' ? 'accept-edits' : 'plan';
    const agyArgs = ['--mode', agyPermiso];
    if (permiso === 'auto') agyArgs.push('--dangerously-skip-permissions');
    if (modelo) agyArgs.push('--model', modelo);
    const promptCompleto = sistema ? `${sistema}\n\n${prompt}` : prompt;
    agyArgs.push('--print', promptCompleto);
    const env = { ...process.env };
    if (tarea) env.CLICKUP_TASK = tarea;
    if (rol) env.OFICINA_ROL = rol;
    if (encargo) env.OFICINA_ENCARGO = String(encargo);
    const { e, texto } = await ejecutar(agy, agyArgs, { cwd, env });
    if (e && !texto) return { ok: false, motivo: (texto?.split('\n').find(Boolean) ?? e.message).slice(0, 300) };
    return { ok: true, id: `agy-${encargo || Date.now()}`, salida: texto, motor: 'agy' };
  }
  const args = ['--bg', ...argsPermitidos(permitidos, prohibidos), '--permission-mode', permiso];
  if (reanudar) args.push('--resume', reanudar);
  if (modelo) args.push('--model', modelo);
  if (nombre) args.push('--name', nombre);
  if (sistema) args.push('--append-system-prompt', sistema);
  args.push(prompt);
  const env = { ...process.env };
  if (tarea) env.CLICKUP_TASK = tarea;
  if (rol) env.OFICINA_ROL = rol;
  if (encargo) env.OFICINA_ENCARGO = String(encargo);
  const { e, texto } = await ejecutar(claude, args, { cwd, env });
  const id = texto.match(/backgrounded\s*·\s*([0-9a-f]{6,})/)?.[1];
  if (id) return { ok: true, id };
  const motivo = /not trusted/i.test(texto)
    ? `Claude Code aún no confía en ${cwd}. Abre \`claude\` una vez en esa carpeta (o en una carpeta padre, como ~/Agentes) y acepta el aviso.`
    : (texto.split('\n').find(Boolean) ?? e?.message ?? 'claude no respondió').slice(0, 300);
  return { ok: false, motivo };
}

// Sesión interactiva dentro de su propio tmux (sin ventana): la ves en la oficina, le escribes como si tecleras en su
// terminal y la abres con «Abrir en terminal». Si la carpeta no es de confianza, el aviso sale en el panel: se abre
// una terminal adjunta para que lo aceptes.
export async function nuevaEnTmux({ cwd, prompt, nombre, permiso, tarea, modelo, reanudar, sistema, rol, permitidos, prohibidos, encargo, motor = 'claude' },
  { ejecutar = enScope(correr), socket = socketDe(nombre), pantalla = capturar, esperar = 2500, adjuntar = abrirTmux, agy = 'agy' } = {}) {
  if (motor === 'agy') {
    const agyPermiso = permiso === 'acceptEdits' || permiso === 'auto' ? 'accept-edits' : 'plan';
    const agyArgs = ['--mode', agyPermiso];
    if (permiso === 'auto') agyArgs.push('--dangerously-skip-permissions');
    if (modelo) agyArgs.push('--model', modelo);
    const promptCompleto = sistema ? `${sistema}\n\n${prompt}` : prompt;
    if (promptCompleto) agyArgs.push('-i', promptCompleto);
    const propias = { CLICKUP_TASK: tarea, OFICINA_ROL: rol, OFICINA_ENCARGO: encargo ? String(encargo) : undefined };
    const env = { ...process.env, ...Object.fromEntries(Object.entries(propias).filter(([, v]) => v)) };
    const { e, texto } = await ejecutar('tmux', argsNueva({ socket, cwd, env: propias, claudeArgs: agyArgs, binario: agy }), { cwd, env });
    if (e) return { ok: false, motivo: (texto.split('\n').find(Boolean) ?? e.message).slice(0, 300) };
    await new Promise((listo) => setTimeout(listo, esperar));
    const vista = await pantalla(socket).catch(() => '');
    if (/trust this folder|do you trust/i.test(vista)) { adjuntar(socket); return { ok: true, socket, confianza: true }; }
    return { ok: true, socket, motor: 'agy' };
  }
  const claudeArgs = [...argsPermitidos(permitidos, prohibidos), '--permission-mode', permiso];
  if (modelo) claudeArgs.push('--model', modelo);
  if (nombre) claudeArgs.push('--name', nombre);
  if (reanudar) claudeArgs.push('--resume', reanudar);
  if (sistema) claudeArgs.push('--append-system-prompt', sistema);
  claudeArgs.push(prompt);
  const propias = { CLICKUP_TASK: tarea, OFICINA_ROL: rol, OFICINA_ENCARGO: encargo ? String(encargo) : undefined };
  const env = { ...process.env, ...Object.fromEntries(Object.entries(propias).filter(([, v]) => v)) };
  const { e, texto } = await ejecutar('tmux', argsNueva({ socket, cwd, env: propias, claudeArgs }), { cwd, env });
  if (e) return { ok: false, motivo: (texto.split('\n').find(Boolean) ?? e.message).slice(0, 300) };
  await new Promise((listo) => setTimeout(listo, esperar));
  const vista = await pantalla(socket).catch(() => '');
  if (/trust this folder|do you trust/i.test(vista)) { adjuntar(socket); return { ok: true, socket, confianza: true }; }
  return { ok: true, socket };
}

export function abrirTmux(socket, { lanzar = enScope(spawn) } = {}) {
  const hijo = lanzar('xdg-terminal-exec', ['tmux', ...argsAdjuntar(socket)], { detached: true, stdio: 'ignore', cwd: os.homedir() });
  hijo.on?.('error', (e) => console.error('xdg-terminal-exec:', e.message));
  hijo.unref?.();
}

// Sesión interactiva en una terminal nueva: sirve para trabajos sin tarea y para carpetas que aún no son de
// confianza (ahí mismo aparece el aviso de Claude Code para aceptarla).
export function nuevaEnTerminal({ cwd, prompt, nombre, permiso, tarea, modelo, motor = 'claude' }, { lanzar = enScope(spawn) } = {}) {
  const agyPermiso = permiso === 'acceptEdits' || permiso === 'auto' ? 'accept-edits' : 'plan';
  const args = motor === 'agy'
    ? ['agy', '--mode', agyPermiso, ...(modelo ? ['--model', modelo] : []), ...(prompt ? ['-i', prompt] : [])]
    : ['claude', '--permission-mode', permiso, ...(modelo ? ['--model', modelo] : []), ...(nombre ? ['--name', nombre] : []), prompt];
  const env = { ...process.env };
  if (tarea) env.CLICKUP_TASK = tarea;
  const hijo = lanzar('xdg-terminal-exec', args, { cwd, env, detached: true, stdio: 'ignore' });
  hijo.on?.('error', (e) => console.error('xdg-terminal-exec:', e.message));
  hijo.unref?.();
  return { ok: true };
}

// El pid debe seguir siendo del proceso de la sesión (evita matar otro proceso si el número se reutilizó).
export function esClaude(pid) {
  try {
    const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return cmd.includes('claude') || cmd.includes('agy') || cmd.includes('antigravity');
  } catch { return false; }
}

export async function cerrarSesion(viva, { claude = 'claude', ejecutar = correr, matar = process.kill, verificar = esClaude } = {}) {
  if (viva.tipo === 'background' && viva.corto) {
    const { texto } = await ejecutar(claude, ['stop', viva.corto], {});
    return /stopped/i.test(texto) ? { ok: true } : { ok: false, motivo: texto.split('\n')[0] || 'no se detuvo' };
  }
  if (!viva.pid || !verificar(viva.pid)) return { ok: false, motivo: 'el proceso ya no es de Claude Code' };
  try { matar(viva.pid, 'SIGTERM'); return { ok: true }; } catch (err) { return { ok: false, motivo: err.message }; }
}

// Abre una terminal adjunta a una sesión en segundo plano (xdg-terminal-exec usa tu terminal predeterminada).
export function abrirTerminal(corto, { lanzar = enScope(spawn) } = {}) {
  const hijo = lanzar('xdg-terminal-exec', ['claude', 'attach', corto], { detached: true, stdio: 'ignore', cwd: os.homedir() });
  hijo.on?.('error', (e) => console.error('xdg-terminal-exec:', e.message));
  hijo.unref?.();
}
