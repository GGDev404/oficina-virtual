// Sesiones fijas por rol (agentes/<rol>.md) y encargos entre sesiones: «hazme esto» con respuesta de vuelta.
// El encargo se entrega a la sesión viva del rol (o se arranca una) con una cabecera «Encargo de <origen>:» y la
// orden de cerrar con `ENTREGA:`; cuando esa sesión termina el turno con esa marca, la entrega vuelve a quien pidió.
import fs from 'node:fs';
import path from 'node:path';

const AGENTES = path.resolve(import.meta.dirname, '..', 'agentes');
export const ROLES = {
  'analisis-plan': { titulo: 'Análisis y plan', permiso: 'manual' },
  implementacion: { titulo: 'Implementación', permiso: 'acceptEdits' },
  'revision-qa': { titulo: 'Revisión y QA', permiso: 'manual' },
  'docs-entrega': { titulo: 'Documentación y entrega', permiso: 'acceptEdits' },
  diseno: { titulo: 'Diseño', permiso: 'acceptEdits' },
  integracion: { titulo: 'Integración', permiso: 'acceptEdits' },
};
export const esRol = (rol) => typeof rol === 'string' && Object.hasOwn(ROLES, rol);
// Del frontmatter del .md: `model` (alias opus/sonnet/haiku → id completo) y `equipo` (skills que el rol usa).
// Cada rol corre con su modelo: plan con Opus, docs con Haiku; así no todo gasta tokens del modelo más caro.
const MODELO_ALIAS = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5', fable: 'claude-fable-5-1' };
export function fichaRol(rol, dir = AGENTES) {
  let cabeza = '';
  try { cabeza = /^---\n([\s\S]*?)\n---\n/.exec(fs.readFileSync(path.join(dir, `${rol}.md`), 'utf8'))?.[1] ?? ''; } catch { /* sin .md: valores vacíos */ }
  const campo = (k) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(cabeza)?.[1].trim() ?? '';
  return { modelo: MODELO_ALIAS[campo('model')] ?? '', equipo: campo('equipo').split(',').map((x) => x.trim()).filter(Boolean) };
}
export const listaRoles = () => Object.entries(ROLES).map(([id, { titulo }]) => ({ id, titulo, ...fichaRol(id) }));

// Cuerpo del .md del rol (sin el frontmatter): es el prompt de sistema de su sesión.
export const cuerpoRol = (rol, dir = AGENTES) => fs.readFileSync(path.join(dir, `${rol}.md`), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').trim();

export const textoEncargo = (origen, texto) =>
  `Encargo de ${origen}: ${texto}\n\nCuando termines, tu respuesta final debe empezar con \`ENTREGA:\` seguida del resultado (breve, con rutas y lo pendiente); la oficina se la reenvía a ${origen}.`;
export const entregaDe = (mensaje) => /^\s*ENTREGA:\s*([\s\S]*)$/.exec(mensaje ?? '')?.[1].trim() || null;

// Misión: un encargo que pasa de rol en rol (plan → implementación → QA → docs). Cada paso recibe el objetivo y la
// entrega del paso anterior; solo la entrega del último vuelve a quien la pidió. Si QA rechaza, regresa una vez a
// implementación con los defectos y después vuelve a QA.
export const MAX_PASOS = 5, MAX_REINTENTOS = 1;
export const rechazado = (resultado) => /veredicto\W{0,4}\s*rechazad/i.test(resultado ?? '');
export const textoPaso = (mision, rol, objetivo, anterior, resultado) =>
  `Misión #${mision}, paso de ${rol}. Objetivo: ${objetivo.slice(0, 1200)}\n\nEntrega anterior (${anterior}):\n${resultado.slice(0, 2400)}`;

export class ErrorEncargo extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}

// Dependencias inyectadas (index.js las conecta; las pruebas las simulan):
//   entregar(sid, texto, { de, alFallar }) → { ok, via, detalle }   (tmux si está libre, si no el mensajero)
//   vivo(sid) → Promise<boolean>     lanzar({ rol, cwd, prompt, sistema, permiso }) → { ok, motivo }
//   etiqueta(sid) → nombre legible de una sesión
export function crearEncargos({ db, entregar, vivo, lanzar, etiqueta, alCambiar = () => {}, cuerpo = cuerpoRol, ahora = Date.now }) {
  const anotar = (de, de_sesion, a_sesion, texto, tipo) =>
    db.prepare('INSERT INTO entre_sesiones (ts, de, de_sesion, a_sesion, texto, tipo) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ahora(), de, de_sesion, a_sesion, texto.slice(0, 1000), tipo);
  const cerrar = (id, estado, campos = {}) => {
    db.prepare('UPDATE encargos SET estado = ?, via = COALESCE(?, via), detalle = ?, resultado = ?, resuelto_ts = ? WHERE id = ?')
      .run(estado, campos.via ?? null, campos.detalle ?? null, campos.resultado ?? null, ahora(), id);
    alCambiar();
  };
  const arrancar = (rol, cwd, prompt) => lanzar({ rol, cwd, prompt, sistema: cuerpo(rol), permiso: ROLES[rol].permiso, modelo: fichaRol(rol).modelo });

  async function encargar({ rol, texto, de_sesion = null, cwd = null, cadena = [], mision = null, intento = 0 }) {
    if (!Array.isArray(cadena) || cadena.length > MAX_PASOS - 1 || !cadena.every(esRol)) throw new ErrorEncargo(400, `cadena: hasta ${MAX_PASOS - 1} roles de la lista`);
    const origen = de_sesion ? db.prepare('SELECT cwd FROM sesiones WHERE id = ?').get(de_sesion) : null;
    if (de_sesion && !origen) throw new ErrorEncargo(400, 'la sesión de origen no existe');
    const de = de_sesion ? etiqueta(de_sesion) : 'la oficina';
    const cuerpoEncargo = textoEncargo(de, texto);
    db.prepare(`UPDATE encargos SET estado = 'error', detalle = 'la sesión no arrancó', resuelto_ts = ? WHERE estado = 'arrancando' AND creado_ts < ?`)
      .run(ahora(), ahora() - 5 * 60_000);
    let destino = null;
    for (const s of db.prepare(`SELECT id, cwd FROM sesiones WHERE rol = ? AND estado <> 'cerrada' ORDER BY ultimo_evento_ts DESC`).all(rol)) {
      if (s.id !== de_sesion && (!cwd || s.cwd === cwd) && await vivo(s.id)) { destino = s; break; }
    }
    const dondeArrancar = cwd ?? origen?.cwd ?? null;
    const insertar = (a_sesion, estado) => Number(db.prepare(
      'INSERT INTO encargos (rol, de_sesion, a_sesion, cwd, texto, estado, creado_ts, cadena, mision, intento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(rol, de_sesion, a_sesion, destino?.cwd ?? dondeArrancar, texto, estado, ahora(), cadena.length ? JSON.stringify(cadena) : null, mision, intento).lastInsertRowid);
    if (destino) {
      const id = insertar(destino.id, 'entregando');
      const r = await entregar(destino.id, cuerpoEncargo, { de, alFallar: (detalle) => cerrar(id, 'error', { detalle }) });
      if (!r.ok) cerrar(id, 'error', { detalle: r.detalle }); else { db.prepare(`UPDATE encargos SET estado = 'entregado', via = ? WHERE id = ?`).run(r.via, id); anotar(de, de_sesion, destino.id, texto, 'encargo'); alCambiar(); }
      return { id, estado: r.ok ? 'entregado' : 'error', via: r.via ?? null, sesion: destino.id, detalle: r.detalle ?? null };
    }
    if (!dondeArrancar) throw new ErrorEncargo(400, `no hay sesión viva de ${rol}: indica cwd para arrancarla`);
    if (db.prepare(`SELECT 1 FROM encargos WHERE rol = ? AND estado = 'arrancando' AND cwd = ?`).get(rol, dondeArrancar)) {
      throw new ErrorEncargo(409, `la sesión de ${rol} está arrancando; reintenta en unos segundos`);
    }
    const id = insertar(null, 'arrancando');
    const r = await arrancar(rol, dondeArrancar, cuerpoEncargo);
    if (!r.ok) { cerrar(id, 'error', { detalle: r.motivo }); throw new ErrorEncargo(422, r.motivo); }
    db.prepare(`UPDATE encargos SET via = 'nueva' WHERE id = ?`).run(id);
    alCambiar();
    return { id, estado: 'arrancando', via: 'nueva', sesion: null, detalle: null };
  }

  // Sesión del rol sin encargo (para tenerla lista).
  async function abrir({ rol, cwd }) {
    const r = await arrancar(rol, cwd, `Quedas como sesión del rol ${rol} en esta carpeta. Responde solo «Listo» y espera encargos.`);
    if (!r.ok) throw new ErrorEncargo(422, r.motivo);
    return r;
  }

  // La sesión recién abierta con OFICINA_ROL queda marcada y, si la arrancó un encargo, es su destino.
  function alRegistrarRol(sid, rol) {
    if (!esRol(rol)) return;
    if (!db.prepare('UPDATE sesiones SET rol = ? WHERE id = ? AND rol IS NULL').run(rol, sid).changes) return;
    const e = db.prepare(`SELECT id, de_sesion, texto FROM encargos WHERE rol = ? AND estado = 'arrancando' AND a_sesion IS NULL ORDER BY id LIMIT 1`).get(rol);
    if (!e) return;
    db.prepare(`UPDATE encargos SET a_sesion = ?, estado = 'entregado' WHERE id = ?`).run(sid, e.id);
    anotar(e.de_sesion ? etiqueta(e.de_sesion) : 'la oficina', e.de_sesion, sid, e.texto, 'encargo');
    alCambiar();
  }

  // Stop de una sesión con encargo abierto: si su respuesta empieza con ENTREGA:, el resultado vuelve a quien lo pidió.
  async function alTerminarTurno(sid, mensaje) {
    const resultado = entregaDe(mensaje);
    const e = resultado && db.prepare(`SELECT * FROM encargos WHERE a_sesion = ? AND estado = 'entregado' ORDER BY id LIMIT 1`).get(sid);
    if (!e) return;
    cerrar(e.id, 'respondido', { resultado });
    const cadena = JSON.parse(e.cadena ?? '[]');
    const mision = e.mision ?? e.id;
    const objetivo = db.prepare('SELECT texto FROM encargos WHERE id = ?').get(mision)?.texto ?? e.texto;
    const volver = e.rol === 'revision-qa' && rechazado(resultado) && e.intento < MAX_REINTENTOS;
    const siguiente = volver ? { rol: 'implementacion', cadena: ['revision-qa', ...cadena] } : cadena.length ? { rol: cadena[0], cadena: cadena.slice(1) } : null;
    if (siguiente) {
      try {
        await encargar({ rol: siguiente.rol, texto: textoPaso(mision, siguiente.rol, objetivo, e.rol, resultado), de_sesion: e.de_sesion,
          cwd: e.cwd, cadena: siguiente.cadena, mision, intento: e.intento + (volver ? 1 : 0) });
        return;
      } catch (err) { // no se pudo seguir: la entrega vuelve a quien pidió, con el motivo
        db.prepare('UPDATE encargos SET detalle = ? WHERE id = ?').run(`la misión no pudo pasar a ${siguiente.rol}: ${err.message}`, e.id);
      }
    }
    if (!e.de_sesion) return;
    const r = await entregar(e.de_sesion, `Entrega de ${etiqueta(sid)} (rol ${e.rol}, encargo #${e.id}):\n${resultado.slice(0, 4000)}`, { de: etiqueta(sid) });
    if (r.ok) anotar(etiqueta(sid), sid, e.de_sesion, resultado, 'entrega');
    else db.prepare('UPDATE encargos SET detalle = ? WHERE id = ?').run(`no pude reenviar la entrega: ${r.detalle}`, e.id);
    alCambiar();
  }

  return { encargar, abrir, alRegistrarRol, alTerminarTurno };
}
