// Liga cada sesión con su tarea de ClickUp. Orden: variable CLICKUP_TASK > rama git > carpeta > prompt > a mano.
// Todo lo que no venga de la variable o de la página se valida contra la tabla tareas (evita ligar textos al azar).
const ID_TAREA = /(?<![0-9a-z])[0-9a-z]{9}(?![0-9a-z])/g; // p. ej. 9k2abc7xy, sin importar si viene en URL, CU- o suelto
const MENSAJE_SISTEMA = /^\s*<(task-notification|agent-message)\b/;
export const FORMATO_ID = /^[0-9a-z]{6,12}$/;

// `tareaEnv` llega de hook.sh cuando la sesión se lanzó con CLICKUP_TASK=<id>. Devuelve true si cambió el enlace.
export function ligar(db, sid, tareaEnv = null) {
  const s = db.prepare('SELECT tarea_id, tarea_origen, rama_git, cwd FROM sesiones WHERE id = ?').get(sid);
  if (!s || s.tarea_origen === 'manual') return false;

  let tarea = null;
  let origen = null;
  if (tareaEnv && FORMATO_ID.test(tareaEnv)) [tarea, origen] = [tareaEnv, 'env'];
  else if (s.tarea_origen === 'env') return false;
  else {
    const existe = db.prepare('SELECT 1 FROM tareas WHERE id = ?');
    const buscar = (texto) => (texto?.match(ID_TAREA) ?? []).find((id) => existe.get(id)) ?? null;
    const prompts = db.prepare(`SELECT json_extract(payload_json, '$.prompt') AS p FROM eventos
                                WHERE sesion_id = ? AND tipo = 'UserPromptSubmit' ORDER BY ts, id`).all(sid)
      .map((r) => r.p).filter((p) => p && !MENSAJE_SISTEMA.test(p));
    for (const [o, encontrada] of [
      ['rama', () => buscar(s.rama_git)],
      ['carpeta', () => buscar(s.cwd)],
      ['prompt', () => prompts.map(buscar).find(Boolean) ?? null],
    ]) {
      tarea = encontrada();
      if (tarea) { origen = o; break; }
    }
  }
  // Sin pista nueva se conserva el enlace anterior.
  if (!tarea || (tarea === s.tarea_id && origen === s.tarea_origen)) return false;
  db.prepare('UPDATE sesiones SET tarea_id = ?, tarea_origen = ? WHERE id = ?').run(tarea, origen, sid);
  return true;
}

// Tras sincronizar ClickUp: reintenta con las sesiones vivas que no se ligaron a mano ni por variable.
export function religarTodas(db) {
  const ids = db.prepare(`SELECT id FROM sesiones WHERE estado <> 'cerrada'
                          AND (tarea_origen IS NULL OR tarea_origen NOT IN ('manual', 'env'))`).all();
  return ids.filter(({ id }) => ligar(db, id)).length;
}
