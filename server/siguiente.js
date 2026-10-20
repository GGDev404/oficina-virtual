// Texto plano para /api/siguiente: tareas abiertas por vencimiento (vencidas primero), con lo que cambia el plan
// de un agente: horario de la ficha, choques, si ya hay otra sesión en ella y comentarios pendientes.
const fecha = (ts) => new Date(ts).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const recorta = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t).replace(/\s+/g, ' ');

export function siguiente(db, { ahora = Date.now(), n = 15, sync = null } = {}) {
  const tareas = db.prepare(`SELECT * FROM tareas ORDER BY due_ts IS NULL, due_ts LIMIT ?`).all(n);
  const finHoy = new Date(ahora); finHoy.setHours(24, 0, 0, 0);
  const lineas = [
    `Tareas abiertas de ClickUp por vencimiento · ahora ${fecha(ahora)}` +
      (sync?.ultima_ts ? ` · sincronizado ${fecha(sync.ultima_ts)}` : ' · SIN SINCRONIZAR') +
      (sync?.error ? ` · error: ${sync.error}` : ''),
    '',
  ];
  if (!tareas.length) lineas.push('No hay tareas abiertas que venzan en los próximos 30 días.');

  tareas.forEach((t, i) => {
    const cuando = t.due_ts == null ? 'SIN FECHA' : t.due_ts < ahora ? 'VENCIDA' : t.due_ts < +finHoy ? 'HOY' : null;
    lineas.push(`${i + 1}. ${cuando ? `[${cuando}] ` : ''}${t.id} · ${t.nombre}`);
    lineas.push(`   Vence ${t.due_ts == null ? '—' : fecha(t.due_ts)} · ${t.estado ?? '—'}${t.prioridad ? ` · prioridad ${t.prioridad}` : ''} · ${t.lista ?? ''} · ${t.url}`);
    if (t.horario) lineas.push(`   Horario: ${t.horario}`);
    if (t.choque) lineas.push(`   Choque: ${t.choque}`);
    for (const s of db.prepare(`SELECT estado, cwd, rama_git FROM sesiones WHERE tarea_id = ? AND estado <> 'cerrada'`).all(t.id)) {
      lineas.push(`   Ya hay un agente en ella: ${s.estado} en ${s.cwd}${s.rama_git ? ` (rama ${s.rama_git})` : ''}`);
    }
    const pendientes = db.prepare(`SELECT autor, tipo, texto FROM comentarios WHERE tarea_id = ? AND es_mio = 0
                                   AND respondido = 0 AND visto_local = 0 AND tipo <> 'ficha' ORDER BY ts`).all(t.id);
    for (const c of pendientes) {
      lineas.push(`   ${c.tipo === 'correccion' ? 'CORRECCIÓN' : 'Comentario'} sin responder de ${c.autor}: ${recorta(c.texto, c.tipo === 'correccion' ? 400 : 160)}`);
    }
  });
  return lineas.join('\n') + '\n';
}
