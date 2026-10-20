// Cliente de la API v2 de ClickUp (solo lectura) y sincronización de tareas y comentarios.
const API = 'https://api.clickup.com/api/v2';
const DIA = 24 * 3600_000;

// Cola secuencial: una solicitud cada `esperaMs` (≈ 90/min, bajo el límite de 100/min que comparte el token).
// Ante 429 espera hasta X-RateLimit-Reset; ante 5xx o error de red reintenta.
export function crearCliente(token, { esperaMs = 650, fetchFn = fetch, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let cola = Promise.resolve();
  let ultima = 0;
  async function pedir(ruta, intento = 0) {
    const falta = ultima + esperaMs - Date.now();
    if (falta > 0) await dormir(falta);
    ultima = Date.now();
    let res;
    try {
      res = await fetchFn(API + ruta, { headers: { Authorization: token }, signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      if (intento < 2) { await dormir(2000 * (intento + 1)); return pedir(ruta, intento + 1); }
      throw new Error(`ClickUp ${ruta}: ${e.message}`);
    }
    if (res.status === 429 && intento < 3) {
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
      await dormir(Math.min(Math.max(reset - Date.now(), 1000), 65_000) + 500);
      return pedir(ruta, intento + 1);
    }
    if (res.status >= 500 && intento < 2) { await dormir(2000 * (intento + 1)); return pedir(ruta, intento + 1); }
    if (!res.ok) throw new Error(`ClickUp ${ruta}: HTTP ${res.status}`);
    return res.json();
  }
  return { get: (ruta) => (cola = cola.then(() => pedir(ruta), () => pedir(ruta))) };
}

export function clasificar(texto = '') {
  if (texto.trimStart().startsWith('FICHA TÉCNICA')) return 'ficha';
  if (/CORRECCI[ÓO]N/.test(texto)) return 'correccion';
  return 'otro';
}

// En las fichas cada campo va como " · ETIQUETA: valor"; el valor llega hasta la siguiente etiqueta.
// Para ti: @mención formal, comentario asignado a ti, tu nombre en el texto o una corrección de ficha.
export function esParaMi(c, yo, nombre = '') {
  if ((c.comment ?? []).some((p) => p.type === 'tag' && String(p.user?.id) === yo)) return true;
  if (String(c.assignee?.id ?? '') === yo) return true;
  const texto = c.comment_text ?? '';
  return (nombre && texto.toLowerCase().includes(nombre)) || clasificar(texto) === 'correccion';
}

export function campoFicha(texto, etiqueta) {
  const m = texto.match(new RegExp(`${etiqueta}:\\s*([\\s\\S]*?)\\s*(?=\\s·\\s[A-ZÁÉÍÓÚÑ ]{3,}:|$)`));
  return m ? m[1].trim() : null;
}

export async function sincronizar(db, cliente, { teamId, ahora = Date.now() } = {}) {
  const { user } = await cliente.get('/user');
  if (!teamId) {
    const { teams } = await cliente.get('/team');
    if (teams.length !== 1) throw new Error('Hay varios equipos en ClickUp: define CLICKUP_TEAM_ID en el .env');
    teamId = teams[0].id;
  }

  const tareas = [];
  for (let page = 0; ; page++) {
    const q = new URLSearchParams({
      'assignees[]': user.id, subtasks: 'true', include_closed: 'false', order_by: 'due_date', reverse: 'true',
      due_date_lt: String(ahora + 30 * DIA), page: String(page),
    });
    const r = await cliente.get(`/team/${teamId}/task?${q}`);
    tareas.push(...r.tasks);
    if (r.last_page !== false || r.tasks.length === 0) break;
  }

  // Comentarios: el endpoint da los 25 más recientes de cada tarea.
  // ponytail: sin paginar hacia atrás; los comentarios más viejos que esos 25 dejan de mostrarse.
  const comentarios = new Map();
  const errores = [];
  for (const t of tareas) {
    try {
      const { comments } = await cliente.get(`/task/${t.id}/comment`);
      const todos = comments.map((c) => ({ ...c, parent_id: null }));
      for (const c of comments.filter((c) => Number(c.reply_count) > 0)) {
        const { comments: resp } = await cliente.get(`/comment/${c.id}/reply`);
        todos.push(...resp.map((r) => ({ ...r, parent_id: c.id })));
      }
      comentarios.set(t.id, todos);
    } catch (e) {
      errores.push(e.message); // se conservan los comentarios que ya había de esa tarea
    }
  }

  guardar(db, tareas, comentarios, String(user.id), (user.username ?? '').split(' ')[0].toLowerCase());
  return { tareas: tareas.length, comentarios: [...comentarios.values()].reduce((n, c) => n + c.length, 0), errores };
}

function guardar(db, tareas, comentarios, yo, nombre) {
  const upTarea = db.prepare(`
    INSERT INTO tareas (id, nombre, estado, prioridad, due_ts, lista, url, horario, choque, actualizada_ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET nombre = excluded.nombre, estado = excluded.estado, prioridad = excluded.prioridad,
      due_ts = excluded.due_ts, lista = excluded.lista, url = excluded.url, horario = excluded.horario,
      choque = excluded.choque, actualizada_ts = excluded.actualizada_ts`);
  const upComentario = db.prepare(`
    INSERT INTO comentarios (id, tarea_id, parent_id, autor_id, autor, texto, ts, es_mio, respondido, tipo, para_mi)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET texto = excluded.texto, respondido = excluded.respondido, tipo = excluded.tipo,
      para_mi = excluded.para_mi`);

  db.exec('BEGIN');
  try {
    const ids = tareas.map((t) => t.id);
    const marcas = ids.map(() => '?').join(',') || "''";
    db.prepare(`DELETE FROM comentarios WHERE tarea_id NOT IN (${marcas})`).run(...ids);
    db.prepare(`DELETE FROM tareas WHERE id NOT IN (${marcas})`).run(...ids);

    for (const t of tareas) {
      const lista = comentarios.get(t.id);
      // La ficha más reciente da el horario y los choques de la tarea.
      const ficha = lista?.filter((c) => clasificar(c.comment_text) === 'ficha').sort((a, b) => b.date - a.date)[0];
      const previa = db.prepare('SELECT horario, choque FROM tareas WHERE id = ?').get(t.id);
      upTarea.run(t.id, t.name, t.status?.status ?? null, t.priority?.priority ?? null,
        t.due_date ? Number(t.due_date) : null, t.list?.name ?? null, t.url,
        ficha ? campoFicha(ficha.comment_text, 'HORARIO VIGENTE') : (previa?.horario ?? null),
        ficha ? campoFicha(ficha.comment_text, 'CHOQUE') : (previa?.choque ?? null),
        Number(t.date_updated));
      if (!lista) continue;

      // "Sin responder" = de otra persona y sin ningún comentario o respuesta mía posterior en la tarea.
      const miUltimo = Math.max(0, ...lista.filter((c) => String(c.user?.id) === yo).map((c) => Number(c.date)));
      const vigentes = lista.map((c) => c.id);
      db.prepare(`DELETE FROM comentarios WHERE tarea_id = ? AND id NOT IN (${vigentes.map(() => '?').join(',') || "''"})`)
        .run(t.id, ...vigentes);
      for (const c of lista) {
        const mio = String(c.user?.id) === yo;
        upComentario.run(c.id, t.id, c.parent_id, String(c.user?.id ?? ''), c.user?.username ?? null, c.comment_text ?? '',
          Number(c.date), mio ? 1 : 0, mio || miUltimo > Number(c.date) ? 1 : 0, clasificar(c.comment_text),
          !mio && esParaMi(c, yo, nombre) ? 1 : 0);
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
