// Máquina de estados de sesiones y subagentes a partir de los eventos de los hooks.
// Campos reales documentados en README.md (Fase 1).
import fs from 'node:fs';

const MIN = 60_000;
const SIN_SENAL_MS = 15 * MIN;
const MENSAJE_SISTEMA = /^\s*<(task-notification|agent-message)\b/;
const INTERRUMPIDO = '[Request interrupted by user for tool use]';
const tieneMarca = (texto, marca) => new RegExp(`^\\s*${marca}:`, 'm').test(texto ?? '');

// Aplica un evento {evento, ts, payload}. Devuelve los cambios de estado de sesión.
// `rama(cwd)` se inyecta para no llamar a git en las pruebas.
export function aplicar(db, { evento, ts, payload: p }, { rama = () => null } = {}) {
  const t = typeof ts === 'number' ? ts : Date.parse(ts);
  const sid = p?.session_id;
  if (!sid || Number.isNaN(t)) return [];

  db.prepare('INSERT INTO eventos (sesion_id, tipo, ts, payload_json) VALUES (?, ?, ?, ?)')
    .run(sid, evento, t, JSON.stringify(p));

  let s = db.prepare('SELECT * FROM sesiones WHERE id = ?').get(sid);
  if (!s) {
    db.prepare(`INSERT INTO sesiones (id, estado, estado_desde_ts, ultimo_evento_ts, iniciada_ts)
                VALUES (?, 'trabajando', ?, ?, ?)`).run(sid, t, t, t);
    s = db.prepare('SELECT * FROM sesiones WHERE id = ?').get(sid);
  }
  db.prepare(`UPDATE sesiones SET cwd = COALESCE(?, cwd), transcript_path = COALESCE(?, transcript_path),
              permission_mode = COALESCE(?, permission_mode), ultimo_evento_ts = MAX(ultimo_evento_ts, ?)
              WHERE id = ?`)
    .run(p.cwd ?? null, p.transcript_path ?? null, p.permission_mode ?? null, t, sid);
  if ((evento === 'SessionStart' || evento === 'Stop') && p.cwd) {
    db.prepare('UPDATE sesiones SET rama_git = ? WHERE id = ?').run(rama(p.cwd), sid);
  }

  let nuevo = null; // null = el evento no cambia el estado de la sesión
  switch (evento) {
    case 'SessionStart':
      nuevo = 'trabajando';
      break;
    case 'UserPromptSubmit':
      nuevo = 'trabajando';
      if (p.prompt && !MENSAJE_SISTEMA.test(p.prompt)) {
        db.prepare('UPDATE sesiones SET ultimo_prompt = ? WHERE id = ?').run(p.prompt, sid);
      }
      break;
    case 'PreToolUse':
      nuevo = 'trabajando';
      if (p.tool_use_id) {
        db.prepare(`INSERT OR IGNORE INTO subagentes
                    (tool_use_id, sesion_id, tipo, descripcion, en_fondo, estado, inicio_ts)
                    VALUES (?, ?, ?, ?, ?, 'trabajando', ?)`)
          .run(p.tool_use_id, sid, p.tool_input?.subagent_type ?? null, p.tool_input?.description ?? null,
            p.tool_input?.run_in_background ? 1 : 0, t);
      }
      break;
    case 'PostToolUse':
      nuevo = 'trabajando';
      postToolUse(db, sid, p, t);
      break;
    case 'SubagentStart':
      if (p.agent_type) subagenteInicia(db, sid, p, t);
      break;
    case 'SubagentStop':
      // agent_type vacío = agentes internos de Claude Code (resúmenes); no se muestran.
      if (p.agent_type) {
        asegurarSubagente(db, sid, p.agent_id, p.agent_type, t);
        db.prepare(`UPDATE subagentes SET estado = 'terminado', fin_ts = COALESCE(fin_ts, ?),
                    ultimo_mensaje = COALESCE(?, ultimo_mensaje) WHERE agent_id = ?`)
          .run(t, p.last_assistant_message ?? null, p.agent_id);
      }
      break;
    case 'PermissionRequest': { // qué herramienta pide permiso y con qué (solo se registra; la decisión sigue siendo tuya)
      nuevo = 'necesita_permiso';
      const entrada = p.tool_input ?? {};
      const detalle = [entrada.command, entrada.file_path, entrada.url, entrada.pattern, entrada.description, entrada.prompt]
        .find((v) => typeof v === 'string' && v.trim()) ?? '';
      const permiso = { herramienta: p.tool_name ?? 'herramienta', detalle: detalle.slice(0, 400) };
      db.prepare('UPDATE sesiones SET permiso_json = ?, ultimo_mensaje = ? WHERE id = ?')
        .run(JSON.stringify(permiso), `Pide permiso para ${permiso.herramienta}${detalle ? `: ${detalle.slice(0, 200)}` : ''}`, sid);
      break;
    }
    case 'Notification':
      if (p.notification_type === 'permission_prompt') nuevo = 'necesita_permiso';
      // Claude Code avisa inactividad 1 min después del Stop aunque haya un shell o subagente corriendo:
      // en ese caso el agente espera su proceso, no a ti.
      else if (p.notification_type === 'idle_prompt' && !db.prepare('SELECT procesos_json FROM sesiones WHERE id = ?').get(sid).procesos_json) nuevo = 'te_espera';
      // El texto de idle_prompt es genérico; no debe tapar el último mensaje real del agente.
      // El aviso genérico no tapa el detalle que dejó PermissionRequest.
      if (nuevo === 'necesita_permiso' && p.message && !db.prepare('SELECT permiso_json FROM sesiones WHERE id = ?').get(sid).permiso_json) {
        db.prepare('UPDATE sesiones SET ultimo_mensaje = ? WHERE id = ?').run(p.message, sid);
      }
      break;
    case 'Stop': {
      const msg = p.last_assistant_message ?? '';
      db.prepare('UPDATE sesiones SET ultimo_mensaje = ? WHERE id = ?').run(msg, sid);
      // Lo que sigue corriendo al terminar el turno: subagentes y shells. Los monitores no cuentan (nunca terminan).
      const corriendo = (p.background_tasks ?? []).filter((b) => b.status === 'running' && (b.type === 'subagent' || b.type === 'shell'));
      const enFondo = corriendo.filter((b) => b.type === 'subagent').map((b) => b.id);
      db.prepare('UPDATE sesiones SET procesos_json = ? WHERE id = ?').run(corriendo.length ? JSON.stringify(corriendo.map((b) => ({
        tipo: b.type, descripcion: (b.description ?? '').slice(0, 160), agente: b.agent_type ?? null,
      }))) : null, sid);
      // Al terminar el turno, todo subagente que no siga en fondo ya terminó (cubre fallos sin PostToolUse).
      const marcar = db.prepare(`UPDATE subagentes SET estado = 'terminado', fin_ts = ? WHERE id = ?`);
      for (const a of db.prepare(`SELECT id, agent_id FROM subagentes WHERE sesion_id = ? AND estado = 'trabajando'`).all(sid)) {
        if (!enFondo.includes(a.agent_id)) marcar.run(t, a.id);
      }
      nuevo = tieneMarca(msg, 'BLOQUEO') ? 'bloqueado'
        : tieneMarca(msg, 'DUDA') ? 'duda'
        : corriendo.length ? 'trabajando'
        : 'listo_para_revisar';
      break;
    }
    case 'SessionEnd':
      nuevo = 'cerrada';
      db.prepare('UPDATE sesiones SET terminada_ts = ?, fin_razon = ?, procesos_json = NULL WHERE id = ?').run(t, p.reason ?? null, sid);
      db.prepare(`UPDATE subagentes SET estado = 'terminado', fin_ts = ? WHERE sesion_id = ? AND estado = 'trabajando'`).run(t, sid);
      break;
  }
  return nuevo ? cambiarEstado(db, sid, nuevo, t) : [];
}

export function cambiarEstado(db, sid, nuevo, t) {
  const { estado } = db.prepare('SELECT estado FROM sesiones WHERE id = ?').get(sid);
  if (estado === nuevo) return [];
  db.prepare('UPDATE sesiones SET estado = ?, estado_desde_ts = ? WHERE id = ?').run(nuevo, t, sid);
  if (estado === 'necesita_permiso') db.prepare('UPDATE sesiones SET permiso_json = NULL WHERE id = ?').run(sid);
  return [{ sesion_id: sid, antes: estado, estado: nuevo }];
}

function asegurarSubagente(db, sid, agentId, tipo, t) {
  db.prepare(`INSERT OR IGNORE INTO subagentes (agent_id, sesion_id, tipo, estado, inicio_ts)
              VALUES (?, ?, ?, 'trabajando', ?)`).run(agentId, sid, tipo, t);
}

// SubagentStart no trae tool_use_id: se liga al PreToolUse más reciente de la sesión y el mismo tipo.
function subagenteInicia(db, sid, p, t) {
  if (db.prepare('SELECT 1 FROM subagentes WHERE agent_id = ?').get(p.agent_id)) return;
  const pre = db.prepare(`SELECT id FROM subagentes WHERE sesion_id = ? AND agent_id IS NULL AND tipo = ?
                          AND estado = 'trabajando' ORDER BY inicio_ts DESC, id DESC LIMIT 1`).get(sid, p.agent_type);
  if (pre) db.prepare('UPDATE subagentes SET agent_id = ? WHERE id = ?').run(p.agent_id, pre.id);
  else asegurarSubagente(db, sid, p.agent_id, p.agent_type, t);
}

// PostToolUse confirma el enlace con tool_response.agentId (y une filas si se crearon por separado).
function postToolUse(db, sid, p, t) {
  const r = p.tool_response ?? {};
  const aid = r.agentId;
  let este = p.tool_use_id && db.prepare('SELECT * FROM subagentes WHERE tool_use_id = ?').get(p.tool_use_id);
  const otro = aid && db.prepare('SELECT * FROM subagentes WHERE agent_id = ?').get(aid);
  if (este && otro && este.id !== otro.id) {
    db.prepare('DELETE FROM subagentes WHERE id = ?').run(este.id);
    db.prepare(`UPDATE subagentes SET tool_use_id = ?, descripcion = COALESCE(descripcion, ?),
                en_fondo = MAX(en_fondo, ?), inicio_ts = MIN(inicio_ts, ?) WHERE id = ?`)
      .run(este.tool_use_id, este.descripcion, este.en_fondo, este.inicio_ts, otro.id);
    este = otro;
  } else if (!este && otro) {
    db.prepare('UPDATE subagentes SET tool_use_id = ?, descripcion = COALESCE(descripcion, ?) WHERE id = ?')
      .run(p.tool_use_id ?? null, p.tool_input?.description ?? null, otro.id);
    este = otro;
  } else if (!este) {
    if (!aid && !p.tool_use_id) return;
    db.prepare(`INSERT INTO subagentes (agent_id, tool_use_id, sesion_id, tipo, descripcion, estado, inicio_ts)
                VALUES (?, ?, ?, ?, ?, 'trabajando', ?)`)
      .run(aid ?? null, p.tool_use_id ?? null, sid, r.agentType ?? p.tool_input?.subagent_type ?? null,
        p.tool_input?.description ?? null, t);
    este = db.prepare('SELECT * FROM subagentes WHERE tool_use_id IS ? AND agent_id IS ?').get(p.tool_use_id ?? null, aid ?? null);
  } else if (aid && !este.agent_id) {
    db.prepare('UPDATE subagentes SET agent_id = ? WHERE id = ?').run(aid, este.id);
  }
  if (r.status === 'async_launched') db.prepare('UPDATE subagentes SET en_fondo = 1 WHERE id = ?').run(este.id);
  else if (r.status === 'completed') {
    db.prepare(`UPDATE subagentes SET estado = 'terminado', fin_ts = COALESCE(fin_ts, ?) WHERE id = ?`).run(t, este.id);
  }
}

// Revisión periódica con la fecha del transcript (los hooks no avisan de rechazos ni de herramientas largas).
// `mtime(ruta)` y `cola(ruta)` se inyectan en las pruebas.
export function revisar(db, ahora = Date.now(), { mtime = mtimeArchivo, cola = colaArchivo, ocupada = () => false, esperando = () => false } = {}) {
  const cambios = [];
  const sesiones = db.prepare(
    `SELECT id, estado, estado_desde_ts, ultimo_evento_ts, transcript_path FROM sesiones
     WHERE estado IN ('necesita_permiso', 'trabajando', 'sin_señal')`
  ).all();
  for (const s of sesiones) {
    const m = s.transcript_path ? mtime(s.transcript_path) : null;
    if (s.estado === 'necesita_permiso') {
      // Mientras `claude agents` diga que espera, el permiso sigue pendiente aunque el transcript cambie
      // (un mensaje en cola, por ejemplo, escribe en él).
      if (esperando(s.id)) continue;
      if (m && m > s.estado_desde_ts) {
        const nuevo = fueInterrumpido(cola(s.transcript_path)) ? 'te_espera' : 'trabajando';
        cambios.push(...cambiarEstado(db, s.id, nuevo, m));
      }
    } else if (s.estado === 'sin_señal') {
      if (m && m > s.estado_desde_ts) cambios.push(...cambiarEstado(db, s.id, 'trabajando', m));
    } else if (!ocupada(s.id) && ahora - Math.max(s.ultimo_evento_ts, m ?? 0) > SIN_SENAL_MS) {
      cambios.push(...cambiarEstado(db, s.id, 'sin_señal', ahora));
    }
  }
  db.prepare('DELETE FROM eventos WHERE ts < ?').run(ahora - 7 * 24 * 60 * MIN);
  return cambios;
}

// El último mensaje user/assistant del transcript es el aviso de interrupción (permiso rechazado).
// Después de él Claude Code escribe líneas de metadatos (last-prompt, custom-title…), por eso no basta la última línea.
export function fueInterrumpido(texto) {
  for (const linea of texto.split('\n').reverse()) {
    let e;
    try { e = JSON.parse(linea); } catch { continue; }
    if (e.type === 'user' || e.type === 'assistant') return JSON.stringify(e.message?.content ?? '').includes(INTERRUMPIDO);
  }
  return false;
}

function mtimeArchivo(ruta) {
  try { return fs.statSync(ruta).mtimeMs; } catch { return null; }
}

// Últimos 16 KB del transcript: alcanza para el último mensaje y los metadatos que le siguen.
function colaArchivo(ruta) {
  let fd;
  try {
    fd = fs.openSync(ruta, 'r');
    const { size } = fs.fstatSync(fd);
    const n = Math.min(size, 16384);
    const buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, size - n);
    return buf.toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
