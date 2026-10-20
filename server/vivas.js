// Sesiones vivas según `claude agents --json`: nombre real, pid, ocupada/libre y bandeja de mensajes.
// Completa a los hooks: sesiones abiertas antes de instalarlos, nombres y cierres sin SessionEnd.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RAIZ_SOCKETS = [`/run/user/${process.getuid?.() ?? 1000}/cc-socks`, `/tmp/cc-socks-${process.getuid?.() ?? 1000}`];
// Sesiones que no son agentes de trabajo: observadoras de claude-mem y el mensajero de la propia oficina.
const INTERNAS = /\/\.claude-mem\/|\/oficina-virtual\/mensajero$/;

export function leerVivas({ claude = 'claude' } = {}) {
  return new Promise((ok, falla) => {
    execFile(claude, ['agents', '--json'], { timeout: 15_000, maxBuffer: 4 * 1024 * 1024, cwd: os.homedir() }, (e, salida) => {
      if (e) return falla(e);
      try { ok(JSON.parse(salida)); } catch (err) { falla(err); }
    });
  });
}

// Ruta del transcript de una sesión: ~/.claude/projects/<cwd con todo lo que no es letra o número como «-»>/<id>.jsonl
export function rutaTranscript(cwd, sessionId) {
  if (!cwd) return null;
  const ruta = path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${sessionId}.jsonl`);
  return fs.existsSync(ruta) ? ruta : null;
}

export function tieneBandeja(pid) {
  return RAIZ_SOCKETS.some((d) => fs.existsSync(`${d}/${pid}.sock`));
}

// Aplica la lista a la base y devuelve { vivas, cambios }. `vivas`: sessionId → { pid, nombre, ocupada, bandeja }.
export function aplicarVivas(db, lista, ahora = Date.now(), { bandeja = tieneBandeja } = {}) {
  const vivas = new Map();
  const cambios = [];
  for (const v of lista) {
    if (!v.sessionId || INTERNAS.test(v.cwd ?? '')) continue;
    const esperando = v.status === 'waiting'; // detenida en un diálogo: casi siempre un permiso
    vivas.set(v.sessionId, { pid: v.pid, nombre: v.name ?? null, ocupada: v.status === 'busy', esperando, bandeja: bandeja(v.pid),
      tipo: v.kind ?? 'interactive', corto: v.id ?? null });
    const s = db.prepare('SELECT estado FROM sesiones WHERE id = ?').get(v.sessionId);
    if (!s) {
      // Abierta antes de los hooks o sin eventos todavía: entra con lo que dice `claude agents`.
      const estado = v.status === 'busy' ? 'trabajando' : 'listo_para_revisar';
      const desde = v.startedAt ?? ahora;
      db.prepare(`INSERT INTO sesiones (id, cwd, nombre, transcript_path, estado, estado_desde_ts, ultimo_evento_ts, iniciada_ts)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(v.sessionId, v.cwd ?? null, v.name ?? null, rutaTranscript(v.cwd, v.sessionId), estado, ahora, desde, desde);
      cambios.push({ sesion_id: v.sessionId, antes: null, estado });
    } else {
      db.prepare('UPDATE sesiones SET nombre = COALESCE(?, nombre), transcript_path = COALESCE(transcript_path, ?) WHERE id = ?')
        .run(v.name ?? null, rutaTranscript(v.cwd, v.sessionId), v.sessionId);
      if (s.estado === 'cerrada') { // se reanudó una sesión que habíamos dado por cerrada
        db.prepare(`UPDATE sesiones SET estado = 'listo_para_revisar', estado_desde_ts = ?, terminada_ts = NULL WHERE id = ?`).run(ahora, v.sessionId);
        cambios.push({ sesion_id: v.sessionId, antes: 'cerrada', estado: 'listo_para_revisar' });
      } else if (esperando && s.estado !== 'necesita_permiso') { // el hook no llegó o algo lo sacó de Tu puerta
        db.prepare(`UPDATE sesiones SET estado = 'necesita_permiso', estado_desde_ts = ? WHERE id = ?`).run(ahora, v.sessionId);
        cambios.push({ sesion_id: v.sessionId, antes: s.estado, estado: 'necesita_permiso' });
      }
    }
  }
  // Abiertas en la base pero ya sin proceso: se cerraron sin SessionEnd (ventana cerrada, kill, reinicio).
  // Margen de 20 s: una sesión recién abierta puede mandar su primer hook antes de aparecer en la lista.
  for (const s of db.prepare(`SELECT id, estado FROM sesiones WHERE estado <> 'cerrada' AND ultimo_evento_ts < ?`).all(ahora - 20_000)) {
    if (vivas.has(s.id) || !/^[0-9a-f-]{36}$/.test(s.id)) continue;
    db.prepare(`UPDATE sesiones SET estado = 'cerrada', estado_desde_ts = ?, terminada_ts = ?, fin_razon = COALESCE(fin_razon, 'proceso terminado'),
                procesos_json = NULL WHERE id = ?`).run(ahora, ahora, s.id);
    db.prepare(`UPDATE subagentes SET estado = 'terminado', fin_ts = ? WHERE sesion_id = ? AND estado = 'trabajando'`).run(ahora, s.id);
    cambios.push({ sesion_id: s.id, antes: s.estado, estado: 'cerrada' });
  }
  return { vivas, cambios };
}
