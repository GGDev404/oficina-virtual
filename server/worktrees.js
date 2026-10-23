// Pizarra por worktree: el avance de cada tarea sale de lo que comparten la sesión de día, sus subagentes y el turno
// nocturno: su plan (.local-context/plan-<ID>.md), sus commits frente a develop y el reporte de la noche.
// Solo lee; quién trabaja ahí (sesiones y subagentes vivos) lo cruza la página con el cwd.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const exec = promisify(execFile);
const git = async (cwd, args) => (await exec('git', ['-C', cwd, ...args], { timeout: 5000, encoding: 'utf8' })).stdout.trim();
// Worktrees de revisión o de un PR ajeno: no son tareas tuyas.
const DE_REVISION = /^(rev-|pr\d+$)|revision/;

// Pasos de un plan: casillas `- [x] …`, `## P-01 [x] …` o `### [x] …`; `[~]` = en curso. Si el plan numera pasos
// (P-01, S1, R1…) cuentan solo los del prefijo principal (P si lo hay), para no sumar listas de verificación sueltas.
export function leerPlan(texto) {
  const pasos = [];
  for (const linea of String(texto ?? '').split('\n')) {
    const m = /^(?:[-*]|#{2,4})\s+(?:([A-Z]{1,2}-?\d+)\s+)?\[([ xX~])\]\s+(?:([A-Z]{1,2}-?\d+)\b\s*[·:—-]?\s*)?(.+)$/.exec(linea);
    if (!m) continue;
    const codigo = m[1] ?? m[3] ?? null;
    pasos.push({ codigo, prefijo: codigo?.match(/^[A-Z]+/)[0] ?? null, estado: m[2] === '~' ? 'progreso' : m[2] === ' ' ? 'falta' : 'hecho',
      texto: `${codigo ? `${codigo} · ` : ''}${m[4].trim()}`.slice(0, 160) });
  }
  const prefijos = pasos.map((p) => p.prefijo).filter(Boolean);
  if (!prefijos.length) return pasos.map(({ estado, texto }) => ({ estado, texto }));
  const cuenta = (x) => prefijos.filter((p) => p === x).length;
  const principal = prefijos.includes('P') ? 'P' : [...new Set(prefijos)].sort((a, b) => cuenta(b) - cuenta(a))[0];
  return pasos.filter((p) => p.prefijo === principal).map(({ estado, texto }) => ({ estado, texto }));
}

const leer = (ruta, max = 200_000) => { try { return fs.readFileSync(ruta, 'utf8').slice(0, max); } catch { return null; } };
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// Turno nocturno: <repo>/.local-context/noche/<AAAA-MM-DD>/<ID>.md (primera línea «Estado: …») y <ID>.pid mientras corre.
function noche(main, id) {
  const dir = path.join(main, '.local-context', 'noche');
  let fechas = [];
  try { fechas = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort().reverse().slice(0, 7); } catch { return null; }
  for (const fecha of fechas) {
    const reporte = leer(path.join(dir, fecha, `${id}.md`), 4000);
    const pid = Number(leer(path.join(dir, fecha, `${id}.pid`), 20));
    if (reporte == null && !pid) continue;
    const estado = reporte?.match(/^Estado:\s*(.+)$/m)?.[1] ?? reporte?.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '') ?? null;
    return { fecha, estado: estado?.slice(0, 200) ?? null, corriendo: !!pid && vivo(pid), reporte: reporte == null ? null : path.join(dir, fecha, `${id}.md`) };
  }
  return null;
}

async function base(wt) {
  for (const r of ['origin/develop', 'origin/main', 'origin/HEAD']) {
    try { await git(wt, ['rev-parse', '--verify', '-q', r]); return r; } catch {}
  }
  return null;
}

async function leerWorktree(main, { ruta, rama }) {
  const nombre = path.basename(ruta);
  // ID de la tarea: la carpeta (<repo>.worktrees/<ID>) o un ID de ClickUp (9 caracteres con dígitos) en la carpeta o la rama.
  const ids = [nombre, ...`${nombre} ${rama ?? ''}`.match(/(?<![0-9a-z])(?=[a-z]*\d)[0-9a-z]{9}(?![0-9a-z])/g) ?? []];
  const planRuta = ids.flatMap((i) => [path.join(ruta, '.local-context', `plan-${i}.md`), path.join(main, '.local-context', `plan-${i}.md`)])
    .find((r) => fs.existsSync(r)) ?? null;
  const id = ids.find((i) => planRuta?.endsWith(`plan-${i}.md`)) ?? ids[1] ?? nombre;
  const plan = planRuta ? leer(planRuta) : null;
  const b = await base(ruta);
  const [log, sucio] = await Promise.all([
    b ? git(ruta, ['log', '--no-merges', '--format=%ct%x09%s', `${b}..HEAD`]).catch(() => '') : '',
    git(ruta, ['status', '--porcelain']).catch(() => ''),
  ]);
  const commits = log ? log.split('\n').map((l) => { const [ts, ...s] = l.split('\t'); return { ts: Number(ts) * 1000, texto: s.join('\t').slice(0, 160) }; }) : [];
  return {
    id, nombre, ruta, rama, repo: path.basename(main),
    titulo: plan?.match(/^#\s+(.+)$/m)?.[1].replace(/^Plan\s+\S+\s*[·:—-]\s*/, '').slice(0, 160) ?? null,
    plan: planRuta, pasos: plan ? leerPlan(plan) : [],
    commits: commits.length, ultimos: commits.slice(0, 3), ultimo_ts: commits[0]?.ts ?? null,
    sin_commit: sucio ? sucio.split('\n').length : 0,
    noche: noche(main, id) ?? (id === nombre ? null : noche(main, nombre)),
  };
}

// Repos de las carpetas donde trabajaron tus sesiones; de cada uno, sus worktrees de tarea (sin el principal).
const repoDe = new Map(); // cwd → repo principal (o null), para no preguntarle a git cada vez
export async function leerWorktrees(cwds) {
  const repos = new Set();
  for (const cwd of cwds) {
    if (!repoDe.has(cwd)) repoDe.set(cwd, await git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']).then((d) => path.dirname(d), () => null));
    if (repoDe.get(cwd)) repos.add(repoDe.get(cwd));
  }
  const lista = [];
  for (const main of repos) {
    const bloques = await git(main, ['worktree', 'list', '--porcelain']).then((t) => t.split('\n\n'), () => []);
    for (const bl of bloques) {
      const ruta = bl.match(/^worktree (.+)$/m)?.[1];
      if (!ruta || ruta === main || /^prunable/m.test(bl) || DE_REVISION.test(path.basename(ruta)) || !fs.existsSync(ruta)) continue;
      lista.push(leerWorktree(main, { ruta, rama: bl.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? null }).catch(() => null));
    }
  }
  return (await Promise.all(lista)).filter(Boolean);
}
