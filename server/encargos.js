// Sesiones fijas por rol (agentes/<rol>.md) y encargos entre sesiones: «hazme esto» con respuesta de vuelta.
// El encargo se entrega a la sesión viva del rol (o se arranca una) con una cabecera «Encargo de <origen>:» y la
// orden de cerrar con `ENTREGA:`; cuando esa sesión termina el turno con esa marca, la entrega vuelve a quien pidió.
import fs from 'node:fs';
import os from 'node:os';
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
export const MOTORES = ['claude', 'agy'];
// Del frontmatter del .md: `model` (alias opus/sonnet/haiku/flash → id completo) y `equipo` (skills que el rol usa).
// Cada rol corre con su modelo: plan con Opus, docs con Haiku, QA visual con Flash; así no todo gasta tokens del modelo más caro.
export const MODELO_ALIAS = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
  fable: 'claude-fable-5-1',
  flash: 'gemini-3.8-flash-high',
  'flash-high': 'gemini-3.8-flash-high',
  'flash-medium': 'gemini-3.8-flash-medium',
  'flash-low': 'gemini-3.8-flash-low',
};
// `permiso` (manual, acceptEdits, auto) es el modo con que arranca la sesión fija del rol; si falta, el de ROLES.
const PERMISOS_ROL = ['manual', 'acceptEdits', 'auto']; // nunca bypassPermissions
export function fichaRol(rol, dir = AGENTES) {
  let cabeza = '';
  try { cabeza = /^---\n([\s\S]*?)\n---\n/.exec(fs.readFileSync(path.join(dir, `${rol}.md`), 'utf8'))?.[1] ?? ''; } catch { /* sin .md: valores vacíos */ }
  const campo = (k) => new RegExp(`^${k}:[ \\t]*(.*)$`, 'm').exec(cabeza)?.[1].trim() ?? '';
  const motor = campo('motor') === 'agy' ? 'agy' : 'claude';
  const permiso = PERMISOS_ROL.includes(campo('permiso')) ? campo('permiso') : ROLES[rol]?.permiso ?? 'manual';
  let permitidos = [];
  try { permitidos = JSON.parse(campo('permitidos') || '[]').filter(reglaValida); } catch { /* mal escrito: ninguno */ }
  const rawModel = campo('model') || (motor === 'agy' ? 'flash' : '');
  const modelo = MODELO_ALIAS[rawModel] ?? rawModel;
  return { motor, modelo, permiso, equipo: campo('equipo').split(',').map((x) => x.trim()).filter(Boolean), permitidos };
}
// Comandos que la sesión del rol corre sin preguntar (`--allowedTools`), p. ej. `Bash(npm run *)`. Nunca `Bash` o
// `Bash(*)` a secas: eso es dejarle toda la terminal.
export const MAX_PERMITIDOS = 80;
export const reglaValida = (r) => typeof r === 'string' && /^[A-Za-z_][A-Za-z0-9_]*(\([^()\n]{1,200}\))?$/.test(r) && !/^Bash(\(\s*\*?\s*\))?$/.test(r);
export const listaRoles = () => Object.entries(ROLES).map(([id, { titulo }]) => ({ id, titulo, ...fichaRol(id) }));

// Cuerpo del .md del rol (sin el frontmatter): es el prompt de sistema de su sesión.
export const cuerpoRol = (rol, dir = AGENTES) => fs.readFileSync(path.join(dir, `${rol}.md`), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').trim();
// Lo que la sesión fija recibe como prompt de sistema: sus instrucciones y, si tiene, las skills de su equipo.
export function sistemaRol(rol, dir = AGENTES) {
  const { equipo } = fichaRol(rol, dir);
  return cuerpoRol(rol, dir) + (equipo.length ? `\n\n## Tu equipo\n\nSkills de tu equipo: ${equipo.join(', ')}. Cárgalas con la herramienta Skill cuando el trabajo lo pida, no antes.` : '');
}

// Configuración del rol editable desde la Armería: modelo, permisos, skills e instrucciones. Se escribe en agentes/<rol>.md
// (la fuente de su sesión fija) y en ~/.claude/agents/<rol>.md (el subagente), dejando el anterior como .bak.
const SKILL = /^[a-z0-9][a-z0-9:._-]{0,79}$/i;
export const MAX_INSTRUCCIONES = 20_000, MAX_EQUIPO = 9;
export const leerRol = (rol, dir = AGENTES) => {
  const f = fichaRol(rol, dir);
  const alias = Object.entries(MODELO_ALIAS).find(([, id]) => id === f.modelo)?.[0] ?? f.modelo;
  return { id: rol, ...f, modelo: alias, instrucciones: cuerpoRol(rol, dir) };
};
export function guardarRol(rol, entrada, { dir = AGENTES, agentes = path.join(os.homedir(), '.claude', 'agents'), ahora = Date.now } = {}) {
  const { modelo, permiso, equipo, instrucciones, permitidos = [], motor } = entrada ?? {};
  if (motor && !MOTORES.includes(motor)) throw new ErrorEncargo(400, `motor: ${MOTORES.join(', ')}`);
  if (!Array.isArray(permitidos) || permitidos.length > MAX_PERMITIDOS || !permitidos.every(reglaValida)) {
    throw new ErrorEncargo(400, `permitidos: hasta ${MAX_PERMITIDOS} reglas como Bash(npm run *); nunca Bash a secas`);
  }
  if (!Object.hasOwn(MODELO_ALIAS, modelo) && !(motor === 'agy' && modelo)) throw new ErrorEncargo(400, `modelo: ${Object.keys(MODELO_ALIAS).join(', ')}`);
  if (!PERMISOS_ROL.includes(permiso)) throw new ErrorEncargo(400, `permiso: ${PERMISOS_ROL.join(', ')}`);
  if (!Array.isArray(equipo) || equipo.length > MAX_EQUIPO || !equipo.every((x) => typeof x === 'string' && SKILL.test(x))) {
    throw new ErrorEncargo(400, `equipo: hasta ${MAX_EQUIPO} skills con nombre válido`);
  }
  const cuerpo = typeof instrucciones === 'string' ? instrucciones.replace(/\r/g, '').trim() : '';
  if (!cuerpo || cuerpo.length > MAX_INSTRUCCIONES) throw new ErrorEncargo(400, `instrucciones: entre 1 y ${MAX_INSTRUCCIONES} caracteres`);
  // Sin el protocolo de la oficina el encargo nunca vuelve a quien lo pidió.
  if (!cuerpo.includes('ENTREGA:')) throw new ErrorEncargo(400, 'las instrucciones deben conservar «Cómo trabajas en la oficina» (la marca ENTREGA:)');
  const archivo = path.join(dir, `${rol}.md`);
  let cabeza = /^---\n([\s\S]*?)\n---\n/.exec(fs.readFileSync(archivo, 'utf8'))?.[1] ?? `name: ${rol}`;
  const poner = (k, v) => { const re = new RegExp(`^${k}:.*$`, 'm'); cabeza = re.test(cabeza) ? cabeza.replace(re, `${k}: ${v}`) : `${cabeza}\n${k}: ${v}`; };
  if (motor) poner('motor', motor);
  poner('model', modelo); poner('permiso', permiso); poner('equipo', [...new Set(equipo)].join(', ')); poner('permitidos', JSON.stringify([...new Set(permitidos)]));
  const texto = `---\n${cabeza}\n---\n${cuerpo}\n`;
  fs.writeFileSync(archivo, texto);
  const destino = path.join(agentes, `${rol}.md`);
  if (fs.existsSync(destino) && fs.readFileSync(destino, 'utf8') !== texto) fs.copyFileSync(destino, `${destino}.${ahora()}.bak`);
  fs.mkdirSync(agentes, { recursive: true });
  fs.writeFileSync(destino, texto);
  return leerRol(rol, dir);
}

// Skills instaladas que un rol puede equipar: las tuyas (~/.claude/skills), las de plugins (`plugin:skill`) y las del
// ERP que trae este repo (skills/). Solo nombre y el inicio de su descripción.
const descripcionSkill = (archivo) => {
  try {
    // `description: texto` o en bloque YAML (`>` / `|`) con las líneas sangradas que siguen.
    const m = /^description:[ \t]*(.*)\n((?:[ \t]+.*\n?)*)/m.exec(fs.readFileSync(archivo, 'utf8').slice(0, 4000));
    const texto = m ? (/^[>|][-+]?$/.test(m[1].trim()) ? m[2] : m[1]) : '';
    return texto.replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '').slice(0, 160);
  } catch { return ''; }
};
const skillsEn = (dir, prefijo = '') => {
  try {
    return fs.readdirSync(dir).filter((n) => fs.existsSync(path.join(dir, n, 'SKILL.md')))
      .map((n) => ({ id: prefijo + n, descripcion: descripcionSkill(path.join(dir, n, 'SKILL.md')) }));
  } catch { return []; }
};
export function listaSkills({ home = os.homedir(), repo = path.resolve(import.meta.dirname, '..') } = {}) {
  const todas = [...skillsEn(path.join(home, '.claude', 'skills')), ...skillsEn(path.join(repo, 'skills'))];
  try {
    const instalados = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf8')).plugins ?? {};
    for (const [clave, versiones] of Object.entries(instalados)) {
      const ruta = versiones?.[0]?.installPath;
      if (typeof ruta === 'string') todas.push(...skillsEn(path.join(ruta, 'skills'), `${clave.split('@')[0]}:`));
    }
  } catch { /* sin plugins */ }
  return [...new Map(todas.map((x) => [x.id, x])).values()].sort((a, b) => a.id.localeCompare(b.id));
}

export const textoEncargo = (origen, texto) =>
  `Encargo de ${origen}: ${texto}\n\nCuando termines, tu respuesta final debe empezar con \`ENTREGA:\` seguida del resultado (breve, con rutas y lo pendiente); la oficina se la reenvía a ${origen}.`;
export const entregaDe = (mensaje) => /^\s*ENTREGA:\s*([\s\S]*)$/.exec(mensaje ?? '')?.[1].trim() || null;
// Un rol que necesita algo termina con `DUDA:` o `BLOQUEO:`: va a la sesión que le encargó, no a la persona.
export const dudaDe = (mensaje) => {
  const m = /(?:^|\n)[ \t*_]*(DUDA|BLOQUEO):[ \t*_]*([\s\S]+)$/.exec(mensaje ?? '');
  return m ? { tipo: m[1], texto: m[2].trim() } : null;
};

// Misión: un encargo que pasa de rol en rol (plan → implementación → QA → docs). Cada paso recibe el objetivo y la
// entrega del paso anterior; solo la entrega del último vuelve a quien la pidió. Si QA rechaza, regresa una vez al rol
// que hizo el trabajo (implementación, diseño…) con los defectos y después vuelve a QA.
export const MAX_REENVIO = 4000; // lo que se teclea en la sesión de origen; el resto se lee de la oficina
export const MAX_PASOS = 5, MAX_REINTENTOS = 1, MAX_MISIONES = 3; // misiones abiertas a la vez (cada una son varios turnos)
export const rechazado = (resultado) => /veredicto\W{0,4}\s*rechazad/i.test(resultado ?? '');
export const textoPaso = (mision, rol, objetivo, anterior, resultado) =>
  `Misión #${mision}, paso de ${rol}. Objetivo: ${objetivo.slice(0, 1200)}\n\nEntrega anterior (${anterior}):\n${resultado.slice(0, 2400)}`;

export class ErrorEncargo extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}

// Dependencias inyectadas (index.js las conecta; las pruebas las simulan):
//   entregar(sid, texto, { de, alFallar }) → { ok, via, detalle }   (tmux si está libre, si no el mensajero)
//   vivo(sid) → Promise<boolean>     lanzar({ rol, cwd, prompt, sistema, permiso }) → { ok, motivo }
//   etiqueta(sid) → nombre legible de una sesión     apagar(sid) → cierra una sesión de rol que ya entregó
export function crearEncargos({ db, entregar, vivo, lanzar, etiqueta, apagar = async () => {}, alCambiar = () => {}, cuerpo = sistemaRol, ahora = Date.now }) {
  const anotar = (de, de_sesion, a_sesion, texto, tipo) =>
    db.prepare('INSERT INTO entre_sesiones (ts, de, de_sesion, a_sesion, texto, tipo) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ahora(), de, de_sesion, a_sesion, texto.slice(0, 1000), tipo);
  const cerrar = (id, estado, campos = {}) => {
    db.prepare('UPDATE encargos SET estado = ?, via = COALESCE(?, via), detalle = ?, resultado = ?, resuelto_ts = ? WHERE id = ?')
      .run(estado, campos.via ?? null, campos.detalle ?? null, campos.resultado ?? null, ahora(), id);
    alCambiar();
  };
  // `encargo`: la sesión nueva lo recibe como OFICINA_ENCARGO y así se liga a ese encargo exacto, aunque arranquen varias del mismo rol.
  const arrancar = (rol, cwd, prompt, encargo = null) => { const f = fichaRol(rol); return lanzar({ rol, cwd, prompt, sistema: cuerpo(rol), permiso: f.permiso, modelo: f.modelo, motor: f.motor, permitidos: f.permitidos, prohibidos: ['AskUserQuestion'], encargo }); };
  // La sesión de un rol que ya entregó y no tiene otro encargo abierto se cierra: no se queda gastando memoria.
  const liberar = async (sid) => {
    if (db.prepare(`SELECT 1 FROM encargos WHERE a_sesion = ? AND estado IN ('entregando', 'entregado')`).get(sid)) return;
    if (!db.prepare('SELECT 1 FROM sesiones WHERE id = ? AND rol IS NOT NULL').get(sid)) return; // solo sesiones de rol
    await apagar(sid);
  };

  async function encargar({ rol, texto, de_sesion = null, cwd = null, cadena = [], mision = null, intento = 0 }) {
    if (!Array.isArray(cadena) || cadena.length > MAX_PASOS - 1 || !cadena.every(esRol)) throw new ErrorEncargo(400, `cadena: hasta ${MAX_PASOS - 1} roles de la lista`);
    if (cadena.length && mision === null && db.prepare(`SELECT COUNT(*) n FROM encargos WHERE (cadena IS NOT NULL OR mision IS NOT NULL)
        AND estado IN ('arrancando', 'entregando', 'entregado')`).get().n >= MAX_MISIONES) {
      throw new ErrorEncargo(429, `ya hay ${MAX_MISIONES} misiones en curso; espera a que una termine`);
    }
    const origen = de_sesion ? db.prepare('SELECT cwd FROM sesiones WHERE id = ?').get(de_sesion) : null;
    if (de_sesion && !origen) throw new ErrorEncargo(400, 'la sesión de origen no existe');
    const de = de_sesion ? etiqueta(de_sesion) : 'la oficina';
    const cuerpoEncargo = textoEncargo(de, texto);
    db.prepare(`UPDATE encargos SET estado = 'error', detalle = 'la sesión no arrancó', resuelto_ts = ? WHERE estado = 'arrancando' AND creado_ts < ?`)
      .run(ahora(), ahora() - 5 * 60_000);
    // Cada sesión que encarga tiene sus propios workers: solo se reutiliza una sesión del rol que esté libre (sin encargo
    // abierto) y que no haya trabajado para otra sesión. Si no hay, se arranca una nueva aunque otra del rol esté ocupada.
    let destino = null;
    for (const s of db.prepare(`SELECT id, cwd FROM sesiones s WHERE rol = ? AND estado <> 'cerrada' AND NOT EXISTS (SELECT 1 FROM encargos x
        WHERE x.a_sesion = s.id AND (x.estado IN ('arrancando', 'entregando', 'entregado') OR x.de_sesion IS NOT ?)) ORDER BY ultimo_evento_ts DESC`).all(rol, de_sesion)) {
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
    const id = insertar(null, 'arrancando');
    const r = await arrancar(rol, dondeArrancar, cuerpoEncargo, id);
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
  function alRegistrarRol(sid, rol, encargo = null) {
    if (!esRol(rol)) return;
    if (!db.prepare('UPDATE sesiones SET rol = ? WHERE id = ? AND rol IS NULL').run(rol, sid).changes) return;
    // Con OFICINA_ENCARGO, su encargo exacto; sin él (sesión abierta a mano), el más viejo que espera.
    const e = encargo
      ? db.prepare(`SELECT id, de_sesion, texto FROM encargos WHERE id = ? AND rol = ? AND estado = 'arrancando' AND a_sesion IS NULL`).get(encargo, rol)
      : db.prepare(`SELECT id, de_sesion, texto FROM encargos WHERE rol = ? AND estado = 'arrancando' AND a_sesion IS NULL ORDER BY id LIMIT 1`).get(rol);
    if (!e) return;
    db.prepare(`UPDATE encargos SET a_sesion = ?, estado = 'entregado' WHERE id = ?`).run(sid, e.id);
    anotar(e.de_sesion ? etiqueta(e.de_sesion) : 'la oficina', e.de_sesion, sid, e.texto, 'encargo');
    alCambiar();
  }

  // Stop de una sesión con encargo abierto: si su respuesta empieza con ENTREGA:, el resultado vuelve a quien lo pidió.
  async function alTerminarTurno(sid, mensaje) {
    const resultado = entregaDe(mensaje);
    if (!resultado) { const d = dudaDe(mensaje); if (d) await preguntar(sid, d); return; }
    const e = db.prepare(`SELECT * FROM encargos WHERE a_sesion = ? AND estado = 'entregado' ORDER BY id LIMIT 1`).get(sid);
    if (!e) return;
    try { await responderEncargo(sid, e, resultado); } finally { await liberar(sid); }
  }

  // DUDA:/BLOQUEO: de un rol: se la pasa a quien encargó, que contesta con /responder <id>. Si el encargo vino de la
  // página (sin sesión de origen), la duda te queda a ti como cualquier sesión que espera.
  async function preguntar(sid, d) {
    const e = db.prepare(`SELECT * FROM encargos WHERE a_sesion = ? AND estado = 'entregado' ORDER BY id LIMIT 1`).get(sid);
    if (!e?.de_sesion) return;
    const r = await entregar(e.de_sesion, `${d.tipo === 'DUDA' ? 'Duda' : 'Bloqueo'} de ${etiqueta(sid)} (rol ${e.rol}, encargo #${e.id}):\n${d.texto.slice(0, 3000)}\n\n`
      + `Contesta con \`/responder ${e.id} <respuesta>\`. Si solo la persona puede decidirlo, pregúntale tú y luego contesta.`, { de: etiqueta(sid) });
    if (r.ok) { anotar(etiqueta(sid), sid, e.de_sesion, d.texto, 'duda'); alCambiar(); }
  }

  // Respuesta de quien encargó (o tuya desde la página) a la duda de un rol: le llega a su sesión y sigue con el encargo.
  async function responder({ id, texto, de_sesion = null }) {
    const e = db.prepare(`SELECT * FROM encargos WHERE id = ? AND estado = 'entregado'`).get(id);
    if (!e?.a_sesion) throw new ErrorEncargo(404, 'ese encargo no está esperando respuesta');
    if (de_sesion && de_sesion !== e.de_sesion) throw new ErrorEncargo(403, 'solo la sesión que hizo el encargo puede responderlo');
    const de = de_sesion ? etiqueta(de_sesion) : 'la persona';
    const r = await entregar(e.a_sesion, `Respuesta de ${de} (encargo #${id}): ${texto}\n\nSigue con el encargo y termina con \`ENTREGA:\` como siempre.`, { de });
    if (!r.ok) throw new ErrorEncargo(502, r.detalle ?? 'no se pudo entregar');
    anotar(de, de_sesion, e.a_sesion, texto, 'respuesta'); alCambiar();
    return { id, via: r.via };
  }

  async function responderEncargo(sid, e, resultado) {
    cerrar(e.id, 'respondido', { resultado });
    const cadena = JSON.parse(e.cadena ?? '[]');
    const mision = e.mision ?? e.id;
    const objetivo = db.prepare('SELECT texto FROM encargos WHERE id = ?').get(mision)?.texto ?? e.texto;
    // Solo dentro de una misión: un encargo suelto a QA devuelve su veredicto a quien lo pidió, sin arrancar a nadie.
    const enMision = e.mision !== null || cadena.length > 0;
    const volver = enMision && e.rol === 'revision-qa' && rechazado(resultado) && e.intento < MAX_REINTENTOS;
    const autor = volver && db.prepare(`SELECT rol FROM encargos WHERE (id = ? OR mision = ?) AND rol <> 'revision-qa' ORDER BY id DESC LIMIT 1`).get(mision, mision)?.rol;
    const siguiente = volver ? { rol: autor || 'implementacion', cadena: ['revision-qa', ...cadena] } : cadena.length ? { rol: cadena[0], cadena: cadena.slice(1) } : null;
    if (siguiente) {
      let motivo;
      try {
        const r = await encargar({ rol: siguiente.rol, texto: textoPaso(mision, siguiente.rol, objetivo, e.rol, resultado), de_sesion: e.de_sesion,
          cwd: e.cwd, cadena: siguiente.cadena, mision, intento: e.intento + (volver ? 1 : 0) });
        if (r.estado !== 'error') return;
        motivo = r.detalle ?? 'no se pudo entregar';
      } catch (err) { motivo = err.message; }
      // No se pudo seguir: la entrega de este paso vuelve a quien pidió, con el motivo.
      db.prepare('UPDATE encargos SET detalle = ? WHERE id = ?').run(`la misión no pudo pasar a ${siguiente.rol}: ${motivo}`, e.id);
    }
    if (!e.de_sesion) return;
    const recorte = resultado.length > MAX_REENVIO ? `\n\n… (recortado: el texto completo está en GET http://127.0.0.1:4777/api/encargos/${e.id})` : '';
    const r = await entregar(e.de_sesion, `Entrega de ${etiqueta(sid)} (rol ${e.rol}, encargo #${e.id}):\n${resultado.slice(0, MAX_REENVIO)}${recorte}`, { de: etiqueta(sid) });
    if (r.ok) anotar(etiqueta(sid), sid, e.de_sesion, resultado, 'entrega');
    else db.prepare('UPDATE encargos SET detalle = ? WHERE id = ?').run(`no pude reenviar la entrega: ${r.detalle}`, e.id);
    alCambiar();
  }

  return { encargar, abrir, alRegistrarRol, alTerminarTurno, responder };
}
