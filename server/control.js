// Abrir y cerrar sesiones de Claude Code desde la oficina.
// - Nueva: `claude --bg` (sesión en segundo plano; la ves en la oficina, le escribes desde su ficha y la abres en
//   una terminal con `claude attach <id>`). CLICKUP_TASK la liga a su tarea desde el primer evento.
// - Cerrar: las de segundo plano con `claude stop <id>`; las interactivas (terminal o app) con SIGTERM a su proceso.
//   En ambos casos la conversación queda guardada y se retoma con `claude --resume <id>` o `claude attach <id>`.
import { execFile, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PERMISOS = ['auto', 'acceptEdits', 'manual']; // nunca bypassPermissions desde una página
const HOME = os.homedir() + path.sep;

const correr = (claude, args, opciones) => new Promise((ok) => {
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

export async function nuevaSesion({ cwd, prompt, nombre, permiso, tarea }, { claude = 'claude', ejecutar = correr } = {}) {
  const args = ['--bg', '--permission-mode', permiso];
  if (nombre) args.push('--name', nombre);
  args.push(prompt);
  const env = { ...process.env };
  if (tarea) env.CLICKUP_TASK = tarea;
  const { e, texto } = await ejecutar(claude, args, { cwd, env });
  const id = texto.match(/backgrounded\s*·\s*([0-9a-f]{6,})/)?.[1];
  if (id) return { ok: true, id };
  const motivo = /not trusted/i.test(texto)
    ? 'Esa carpeta todavía no es de confianza para Claude Code. Elige «Terminal nueva» y acepta el aviso ahí.'
    : (texto.split('\n').find(Boolean) ?? e?.message ?? 'claude no respondió').slice(0, 300);
  return { ok: false, motivo };
}

// Sesión interactiva en una terminal nueva: sirve para trabajos sin tarea y para carpetas que aún no son de
// confianza (ahí mismo aparece el aviso de Claude Code para aceptarla).
export function nuevaEnTerminal({ cwd, prompt, nombre, permiso, tarea }, { lanzar = spawn } = {}) {
  const args = ['claude', '--permission-mode', permiso];
  if (nombre) args.push('--name', nombre);
  args.push(prompt);
  const env = { ...process.env };
  if (tarea) env.CLICKUP_TASK = tarea;
  const hijo = lanzar('xdg-terminal-exec', args, { cwd, env, detached: true, stdio: 'ignore' });
  hijo.on?.('error', (e) => console.error('xdg-terminal-exec:', e.message));
  hijo.unref?.();
  return { ok: true };
}

// El pid debe seguir siendo de Claude Code (evita matar otro proceso si el número se reutilizó).
function esClaude(pid) {
  try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('claude'); } catch { return false; }
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
export function abrirTerminal(corto, { lanzar = spawn } = {}) {
  const hijo = lanzar('xdg-terminal-exec', ['claude', 'attach', corto], { detached: true, stdio: 'ignore', cwd: os.homedir() });
  hijo.on?.('error', (e) => console.error('xdg-terminal-exec:', e.message));
  hijo.unref?.();
}
