// Memoria de la máquina y de cada sesión, y pausa de sesiones (SIGSTOP/SIGCONT a su árbol de procesos).
// systemd-oomd mata cuando memoria y swap pasan del 90 %; aquí avisamos y bloqueamos sesiones nuevas antes.
import fs from 'node:fs';

// Perilla: % mínimo de RAM disponible para abrir o retomar sesiones (por debajo, «critico»).
const MIN_PCT = Number(process.env.OFICINA_MEM_MIN_PCT) || 15;

export function leerMeminfo(texto = fs.readFileSync('/proc/meminfo', 'utf8')) {
  const kb = (clave) => Number(texto.match(new RegExp(`^${clave}:\\s+(\\d+)`, 'm'))?.[1] ?? 0);
  return { total: kb('MemTotal'), disponible: kb('MemAvailable'), swapTotal: kb('SwapTotal'), swapLibre: kb('SwapFree') };
}

// bien | alto | critico. Crítico = RAM disponible bajo la perilla o swap casi lleno (lo que mira oomd).
export function nivelMemoria({ total, disponible, swapTotal, swapLibre }, minPct = MIN_PCT) {
  const libre = (100 * disponible) / total;
  const swapUsado = swapTotal ? 100 - (100 * swapLibre) / swapTotal : 0;
  if (libre < minPct || swapUsado > 85) return 'critico';
  if (libre < minPct + 10 || swapUsado > 65) return 'alto';
  return 'bien';
}

// pid y todos sus descendientes.
export function arbol(pid) {
  const todos = [];
  const pila = [pid];
  while (pila.length) {
    const p = pila.pop();
    todos.push(p);
    let tareas = [];
    try { tareas = fs.readdirSync(`/proc/${p}/task`); } catch { continue; }
    for (const t of tareas) {
      try { pila.push(...fs.readFileSync(`/proc/${p}/task/${t}/children`, 'utf8').split(' ').filter(Boolean).map(Number)); } catch {}
    }
  }
  return todos;
}

// ponytail: suma de RSS; cuenta doble la memoria compartida, sirve para comparar sesiones, no como cifra exacta.
export function rssMb(pids) {
  let kb = 0;
  for (const p of pids) {
    try { kb += Number(fs.readFileSync(`/proc/${p}/status`, 'utf8').match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0); } catch {}
  }
  return Math.round(kb / 1024);
}

export const pausada = (pid) => {
  try { return /^\d+ \(.*\) T/.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return false; }
};

// Detiene (o reanuda) la sesión con todos sus procesos. Pausada no crece ni lanza nada; el kernel puede mandarla a swap.
export function pausar(pid, { reanudar = false, matar = process.kill } = {}) {
  const pids = arbol(pid);
  for (const p of reanudar ? pids.reverse() : pids) {
    try { matar(p, reanudar ? 'SIGCONT' : 'SIGSTOP'); } catch {}
  }
  return pids.length;
}

export function memoria(vivas) {
  const m = leerMeminfo();
  const sesiones = [...vivas].filter(([, v]) => v.pid).map(([id, v]) => ({ id, nombre: v.nombre, mb: rssMb(arbol(v.pid)), pausada: pausada(v.pid) }))
    .sort((a, b) => b.mb - a.mb);
  return { ...m, nivel: nivelMemoria(m), minPct: MIN_PCT, sesiones };
}
