// Planos: tablero de mis 7 módulos y detalle por módulo, armados desde la bóveda (solo lectura).
// Fuente: nota de estado vigente (§2 hecho, §3 falta, §4 contradicciones), panorama, plan de entrega, planos 1.7.1,
// expedientes de «12 Implementación de tareas», preguntas.md (leerBandeja) y brechas-abiertas.md.
// El parseo es por número de sección y tolerante: si la nota no trae el formato, el módulo avisa y no lanza.
import fs from 'node:fs';
import path from 'node:path';
import { indice, moduloDe } from './boveda.js';
import { leerBandeja, CERRADAS } from './bandeja.js';

export const MODULOS = {
  'MOD-COM': { nombre: 'Compras', en: /compras/i },
  'MOD-ALM': { nombre: 'Almacén', en: /almac[eé]n/i },
  'MOD-MP': { nombre: 'Materia prima', en: /\bMP\b|materia prima/i },
  'MOD-PT': { nombre: 'Producto terminado', en: /\bPT\b|producto terminado/i },
  'MOD-CXP': { nombre: 'Cuentas por pagar', en: /\bCxP\b|cuentas por pagar/i },
  'MOD-TES': { nombre: 'Tesorería', en: /tesorer[ií]a|\bbancos?\b/i },
  'MOD-MAE': { nombre: 'Maestros, A+W y arranque', en: /maestros|\bMAE\b|A\+W|\bSAP\b/i },
};
const AVISO = 'nota sin formato esperado';
const TAMANO = { S: 1, M: 2, L: 3 };
const PESO_FICHA = 2; // una ficha vale M; lo pendiente lo pesan sus brechas de §3 (S/M/L) cuando la tabla trae columna Ficha
const DIR_ESTADO = '14 Estado por módulo';
const DIR_EXPEDIENTES = '12 Implementación de tareas';
const ID_TAREA = /\b86e3[0-9a-z]{5}\b/g;

// ---- Markdown tolerante ----
const quitar = (t) => String(t ?? '').replace(/[*`]/g, '').replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/\s+/g, ' ').trim();
const celdas = (l) => l.replace(/\[\[[^\]]*\]\]/g, (s) => s.replace(/\|/g, '\u0001')).replace(/\\\|/g, '\u0001')
  .trim().replace(/^\||\|$/g, '').split('|').map((c) => c.replaceAll('\u0001', '|').trim());

// Texto de la sección «## N …» hasta el siguiente «## ».
function seccion(texto, n) {
  const ini = new RegExp(`^##\\s+${n}[.\\s·)-]`, 'm').exec(texto);
  if (!ini) return '';
  const resto = texto.slice(ini.index + ini[0].length);
  const fin = resto.search(/^##\s/m);
  return fin < 0 ? resto : resto.slice(0, fin);
}
// Texto bajo un encabezado (cualquier nivel) que contenga `nombre`, hasta el siguiente encabezado igual o mayor.
function bajo(texto, nombre) {
  const m = new RegExp(`^(#{1,6})\\s+[^\\n]*${nombre}[^\\n]*$`, 'mi').exec(texto);
  if (!m) return '';
  const resto = texto.slice(m.index + m[0].length);
  const fin = new RegExp(`^#{1,${m[1].length}}\\s`, 'm').exec(resto);
  return fin ? resto.slice(0, fin.index) : resto;
}
// Tablas de un texto: [{cab, filas}]; la que no trae línea separadora no cuenta.
function tablas(texto) {
  const out = [];
  let bloque = [];
  const cerrar = () => {
    if (bloque.length > 2 && /^\|[\s:|-]+\|?$/.test(bloque[1].trim())) out.push({ cab: celdas(bloque[0]).map(quitar), filas: bloque.slice(2).map(celdas) });
    bloque = [];
  };
  for (const l of String(texto).split('\n')) { if (l.trim().startsWith('|')) bloque.push(l); else cerrar(); }
  cerrar();
  return out;
}
const col = (cab, re, defecto = -1) => { const i = cab.findIndex((c) => re.test(c)); return i < 0 ? defecto : i; };
const leer = (abs) => { try { return fs.readFileSync(abs, 'utf8'); } catch { return null; } };
const fecha = (n) => String(n.frontmatter.fecha ?? '');

// Estado de §2 por prefijo: hay ~20 variantes («Construido*», «Parcial · solo en rama local», «No construido»…).
export function normalizarEstado(e) {
  const s = quitar(e).toLowerCase();
  if (/^(no construid|sin construir)/.test(s)) return 'no construido';
  if (s.startsWith('construido')) return 'construido';
  if (s.startsWith('parcial') || /s[oó]lo en rama local/.test(s)) return 'parcial';
  return null;
}

// §2: primera tabla con columna Estado = fichas. §3: primera con columna Brecha. §4: contradicciones.
export function parsearNota(texto) {
  const t2 = tablas(seccion(texto, 2)).find((t) => col(t.cab, /^estado/i) >= 0);
  const fichas = !t2 ? [] : t2.filas.filter((f) => f.length > 1).map((f) => ({
    ficha: quitar(f[0]), estado: normalizarEstado(f[col(t2.cab, /^estado/i)]) ?? 'sin clasificar', nota: quitar(f[col(t2.cab, /^nota/i, f.length - 1)]),
  }));
  const t3 = tablas(seccion(texto, 3)).find((t) => col(t.cab, /brecha/i) >= 0);
  const falta = !t3 ? [] : t3.filas.filter((f) => f.length > 1).map((f) => {
    const cTarea = col(t3.cab, /tarea/i), cTam = col(t3.cab, /tama/i, f.length - 1), cFicha = col(t3.cab, /^ficha/i);
    const tarea = f[cTarea] ?? f.join(' ');
    return {
      n: quitar(f[0]), brecha: quitar(f[col(t3.cab, /brecha/i)]), fuente: quitar(f[col(t3.cab, /fuente/i)] ?? ''),
      // «SIN TAREA (86e3x no la incluye)»: el ID citado es justo el que no la cubre
      tareas: /SIN TAREA/i.test(tarea) ? [] : [...new Set(tarea.match(ID_TAREA) ?? [])], sinTarea: /SIN TAREA/i.test(tarea),
      tamano: quitar(f[cTam]).match(/\b([SML])\b/)?.[1] ?? null,
      // Columna Ficha (opcional): códigos de §2 que completa la brecha; «—» = transversal
      ...(cFicha >= 0 && { fichas: quitar(f[cFicha]).split(/\s*,\s*/).filter((x) => x && x !== '—' && x !== '-'), fichaTexto: quitar(f[cFicha]) }),
    };
  });
  const s4 = seccion(texto, 4);
  const t4 = tablas(bajo(s4, 'Contradicciones') || s4).find((t) => t.filas.length);
  const contradicciones = !t4 ? [] : t4.filas.filter((f) => f.length > 1).map((f) => ({ tema: quitar(f[0]), queHacer: quitar(f[f.length - 1]) }));
  return { fichas, falta, contradicciones };
}

// % por ficha: Construido pesa todo, Parcial la mitad. Las brechas de §3 no traen ficha en columna propia (solo a veces
// la citan en Fuente), así que no se restan por ficha: se usa el respaldo del plan. Tamaño S/M/L se informa aparte.
// Con columna Ficha en §3: % = hecho / (hecho + pendiente). Hecho por ficha: construido 2, parcial 1, no construido 0.
// Pendiente: suma S=1/M=2/L=3 de sus brechas; una ficha incompleta sin brechas ligadas pone lo que le falta (2 − hecho);
// las brechas transversales («—») también pesan. Sin columna Ficha: respaldo construido = 2, parcial = 1.
const BASE_PONDERADA = 'ponderado: construido 2, parcial 1; lo pendiente pesa por tamaño de brecha (S 1, M 2, L 3)';
const BASE_RESPALDO = 'respaldo: construido = peso, parcial = mitad (la tabla de brechas no trae columna Ficha)';
const hechoDe = (f) => (f.estado === 'construido' ? PESO_FICHA : f.estado === 'parcial' ? PESO_FICHA / 2 : 0);
export function porcentaje(fichas, falta = []) {
  const v = fichas.filter((f) => f.estado !== 'sin clasificar');
  if (!v.length) return { pct: null, base: BASE_RESPALDO };
  const hecho = v.reduce((s, f) => s + hechoDe(f), 0);
  if (!falta.some((b) => b.fichas)) return { pct: Math.round((100 * hecho) / (v.length * PESO_FICHA)), base: BASE_RESPALDO };
  const peso = (b) => TAMANO[b.tamano] ?? TAMANO.M;
  const codigo = (f) => f.ficha.split(/\s+·\s+/)[0];
  // cada brecha pesa una sola vez aunque complete varias fichas
  let pendiente = falta.reduce((s, b) => s + peso(b), 0);
  // por texto de la celda: los nombres de proceso (Maestros) traen comas, «Retorno al origen (folio, UUID, resultado)»
  for (const f of v) if (!falta.some((b) => b.fichaTexto?.includes(codigo(f)))) pendiente += PESO_FICHA - hechoDe(f);
  return { pct: Math.round((100 * hecho) / (hecho + pendiente || 1)), base: BASE_PONDERADA };
}

// ---- Contexto de la bóveda ----
function cargar(raiz) {
  const notas = indice(raiz);
  const estado = {};
  for (const n of notas) {
    const mod = moduloDe(n.frontmatter.modulo);
    if (n.frontmatter.tipo === 'estado-modulo' && MODULOS[mod] && (!estado[mod] || fecha(n) > fecha(estado[mod]))) estado[mod] = n;
  }
  const vigente = (tipo) => notas.filter((n) => n.frontmatter.tipo === tipo).sort((a, b) => fecha(b).localeCompare(fecha(a)))[0];
  // ID de tarea → módulo con más menciones en las notas de estado (empate = sin módulo: no se adivina)
  const menciones = {};
  const textos = {};
  for (const [mod, n] of Object.entries(estado)) {
    textos[mod] = leer(path.join(raiz, n.ruta));
    for (const id of textos[mod]?.match(ID_TAREA) ?? []) ((menciones[id] ??= {})[mod] = (menciones[id][mod] ?? 0) + 1);
  }
  const moduloDeId = (id) => {
    const o = Object.entries(menciones[id] ?? {}).sort((a, b) => b[1] - a[1]);
    return o.length && o[0][1] !== o[1]?.[1] ? o[0][0] : null;
  };
  const expedientes = notas.filter((n) => n.ruta.startsWith(`${DIR_EXPEDIENTES}${path.sep}`) && (n.frontmatter.clickup || n.frontmatter.rama)).map((n) => {
    const fm = n.frontmatter;
    const id = (fm.clickup ?? '').match(ID_TAREA)?.[0] ?? path.basename(n.ruta).match(/^86e3[0-9a-z]{5}/)?.[0] ?? null;
    const codigo = `${fm.tarea} ${fm.ficha}`.match(/\b(?:F1|MOD)-([A-Z]{2,3})\b/)?.[1];
    const modulo = [moduloDe(fm.modulo), moduloDe(codigo), id && moduloDeId(id)].find((m) => MODULOS[m]) ?? null;
    return { ruta: n.ruta, id, tarea: quitar(fm.tarea), estado: fm.estado ?? '', rama: /^\(/.test(fm.rama ?? '') ? '' : fm.rama ?? '', pr: fm.pr ?? '', modulo };
  });
  return { notas, estado, textos, expedientes, panorama: vigente('estado-panorama'), plan: vigente('plan-entrega') };
}

function ultimoHistorial(ruta, raiz) {
  const texto = leer(path.join(raiz, ruta));
  const t = texto && tablas(bajo(texto, 'Historial'))[0];
  if (!t) return null;
  const filas = t.filas.filter((f) => /^\d{4}-\d{2}-\d{2}/.test(f[0]));
  // la tabla va de viejo a nuevo en unas notas y al revés en otras: manda la fecha, y a igual fecha la fila más baja
  const f = filas.reduce((a, b) => (!a || b[0] >= a[0] ? b : a), null);
  return f && { fecha: f[0], agente: quitar(f[1]), cambio: quitar(f.slice(2).join(' ')).slice(0, 300) };
}

// Ligas manuales rama → módulo (tabla planos_ligas). Solo valen para ramas que ningún expediente liga.
// Map y no objeto: una rama llamada «constructor» o «toString» no debe leerse como ligada
export const leerLigas = (db) => new Map(db.prepare('SELECT rama, modulo FROM planos_ligas').all().map((r) => [r.rama, r.modulo]));
// modulo null = desligar. raiz (opcional): rechaza las ramas que ya liga un expediente, que es el que manda.
export function ligarRama(db, rama, modulo, raiz) {
  if (typeof rama !== 'string' || !rama.trim() || rama.length > 200 || /[\0\n\r]/.test(rama)) throw new Error('rama no válida');
  if (modulo === null) { db.prepare('DELETE FROM planos_ligas WHERE rama = ?').run(rama); return { rama, modulo: null }; }
  if (typeof modulo !== 'string' || !Object.hasOwn(MODULOS, modulo)) throw new Error('módulo no válido');
  if (raiz && cargar(raiz).expedientes.some((e) => e.rama === rama)) throw new Error('esa rama ya la liga su expediente');
  db.prepare('INSERT INTO planos_ligas (rama, modulo, ts) VALUES (?, ?, ?) ON CONFLICT(rama) DO UPDATE SET modulo = excluded.modulo, ts = excluded.ts').run(rama, modulo, Date.now());
  return { rama, modulo };
}

function auditoria(mod, c, raiz, worktrees, ligas = new Map()) {
  const exps = c.expedientes.filter((e) => e.modulo === mod);
  const deExp = (w) => c.expedientes.find((e) => (e.rama && e.rama === w.rama) || (e.id && (w.id === e.id || w.nombre === e.id)));
  const moduloDeW = (w) => deExp(w)?.modulo ?? ligas.get(w.rama);
  const sinSubir = worktrees.filter((w) => (w.sin_commit > 0 || w.sin_subir > 0) && moduloDeW(w) === mod)
    .map((w) => ({ ruta: w.ruta, rama: w.rama, repo: w.repo, sin_commit: w.sin_commit, sin_subir: w.sin_subir, expediente: deExp(w)?.id ?? null }));
  const hechoPorAgentes = exps.map((e) => ({ id: e.id, tarea: e.tarea, estado: e.estado, rama: e.rama, pr: e.pr, ultimo: ultimoHistorial(e.ruta, raiz) }));
  const alertas = exps.filter((e) => /^terminada/i.test(e.estado) && sinSubir.some((s) => s.expediente === e.id))
    .map((e) => `${e.id} está terminada y su rama ${e.rama} sigue sin subir`);
  return { sinSubir, hechoPorAgentes, alertas };
}

// ---- Piezas del detalle ----
const delModulo = (valor, mod) => String(valor ?? '').split(/[,\s]+/).some((v) => moduloDe(v) === mod);
const dudasDe = (mod, rutaPreguntas) => {
  const { filas, error } = leerBandeja(rutaPreguntas);
  const abiertas = filas.filter((f) => delModulo(f.modulo, mod) && !CERRADAS.includes(f.estado)) // igual que la pestaña Preguntas: un supuesto no pide nada
    .map(({ id, estado, para, bloquea, tarea, pregunta, enviada }) => ({ id, estado, para, bloquea, tarea, pregunta, enviada }));
  return { abiertas, bloquean: abiertas.filter((f) => f.bloquea === 'sí'), ...(error && { error }) };
};

function brechasAbiertas(mod, raiz) {
  const t = tablas(leer(path.join(raiz, 'brechas-abiertas.md')) ?? '').find((x) => col(x.cab, /^m[oó]dulo/i) >= 0);
  const filas = (t?.filas ?? []).filter((f) => delModulo(f[col(t.cab, /^m[oó]dulo/i)], mod));
  const est = (f) => (f[col(t.cab, /^estado/i, 2)] ?? '').toLowerCase();
  return {
    abiertas: filas.filter((f) => !/^(cerrada|descartada)/.test(est(f))).map((f) => ({ tarea: quitar(f[0]), brecha: quitar(f[1]), estado: quitar(est(f)), notas: quitar(f[3]) })),
    cerradas: filas.filter((f) => /^cerrada/.test(est(f))).length,
  };
}

function necesita(mod, c, raiz, completo) {
  const pan = c.panorama && leer(path.join(raiz, c.panorama.ruta));
  const re = MODULOS[mod].en;
  const td = tablas(bajo(pan ?? '', 'Decisiones que tengo que pedir'))[0];
  const decisiones = (td?.filas ?? []).filter((f) => re.test(f[td.cab.length - 1] ?? '')).map((f) => ({ n: quitar(f[0]), decision: quitar(f[1]), aQuien: quitar(f[2]), afecta: quitar(f[3]) }));
  const insumos = bajo(pan ?? '', 'Insumos que faltan').split('\n').filter((l) => /^\s*[-*]\s/.test(l)).map((l) => quitar(l.replace(/^\s*[-*]\s/, '')))
    .filter((l) => (/\bMOD-[A-Z]+/.test(l) ? delModulo(l.match(/\bMOD-[A-Z]+/g).join(','), mod) : re.test(l)))
    .map((l) => l.replace(/\s*\((?:MOD-[A-Z]+(?:,\s*)?)+\)\s*$/, ''));
  let dependencias = [];
  if (completo) {
    const planos = c.notas.filter((n) => n.frontmatter.tipo === 'plano-funcional' && (moduloDe(n.frontmatter.modulo) === mod || (mod === 'MOD-MAE' && /Planos 1\.7\.1[\\/]13 /.test(n.ruta))));
    for (const p of planos) {
      const t = tablas(seccion(leer(path.join(raiz, p.ruta)) ?? '', 11))[0];
      if (t) dependencias.push(...t.filas.filter((f) => f.length > 3).map((f) => ({ origen: quitar(f[col(t.cab, /origen/i, 0)]), evento: quitar(f[col(t.cab, /evento/i, 1)]),
        destino: quitar(f[col(t.cab, /destino/i, 3)]), resultado: quitar(f[col(t.cab, /resultado/i, 4)]), plano: p.titulo })));
    }
  }
  return { decisiones, insumos, dependencias };
}

function calendario(mod, c, raiz, hoy) {
  const fm = c.plan?.frontmatter ?? {};
  const t = tablas(leer(path.join(raiz, c.plan?.ruta ?? '')) ?? '').find((x) => col(x.cab, /cierre/i) >= 0);
  const fila = t?.filas.find((f) => MODULOS[mod].en.test(f[col(t.cab, /cierre/i)] ?? ''));
  const dias = fm.entrega ? Math.ceil((Date.parse(fm.entrega) - Date.parse(hoy.toLocaleDateString('sv'))) / 86400_000) : null;
  return { corte: fm.corte_construccion ?? null, entrega: fm.entrega ?? null, arranque: fm.arranque ?? null, diasParaEntrega: dias,
    cierre: fila ? { semana: quitar(fila[0]), sprint: quitar(fila[1]) } : null };
}

function armar(mod, c, ctx, completo) {
  const { raiz, hoy = new Date() } = ctx;
  const nota = c.estado[mod];
  const base = { id: mod, nombre: MODULOS[mod].nombre };
  const vacio = { ...base, aviso: AVISO, nota: null, pct: null, fichas: [], falta: [], contradicciones: [], pesoFalta: 0 };
  try {
    const d = nota ? parsearNota(c.textos[mod] ?? '') : { fichas: [], falta: [], contradicciones: [] };
    const aud = auditoria(mod, c, raiz, ctx.worktrees ?? [], ctx.ligas);
    const dudas = dudasDe(mod, ctx.preguntas);
    const aviso = !nota || !d.fichas.length || !d.falta.length ? AVISO : undefined;
    return {
      ...base, ...(aviso && { aviso }), nota: nota && { ruta: nota.ruta, titulo: nota.titulo, fecha: fecha(nota) },
      ...(({ pct, base }) => ({ pct, basePct: base }))(porcentaje(d.fichas, d.falta)),
      // prioridad (frontmatter de la nota de estado): módulo que va antes que los demás aunque no tenga semana de cierre
      prioridad: nota?.frontmatter.prioridad ? String(nota.frontmatter.prioridad) : null,
      conteos: { construido: d.fichas.filter((f) => f.estado === 'construido').length, parcial: d.fichas.filter((f) => f.estado === 'parcial').length,
        noConstruido: d.fichas.filter((f) => f.estado === 'no construido').length },
      fichas: d.fichas, falta: d.falta, sinTarea: d.falta.filter((f) => f.sinTarea).length,
      pesoFalta: d.falta.reduce((s, f) => s + (TAMANO[f.tamano] ?? TAMANO.M), 0), contradicciones: d.contradicciones,
      dudas, bloquean: dudas.bloquean.length, brechas: brechasAbiertas(mod, raiz), necesita: necesita(mod, c, raiz, completo),
      calendario: calendario(mod, c, raiz, hoy), auditoria: aud, sinSubir: aud.sinSubir.length,
      paraSaberMas: c.notas.filter((n) => n.frontmatter.tipo !== 'estado-modulo' && (delModulo(n.frontmatter.modulo, mod) || delModulo(n.frontmatter.modulos, mod)
        || n.enlaces.some((e) => /^MOD-/i.test(e) && moduloDe(e) === mod))).sort((a, b) => b.mtime - a.mtime).slice(0, 30)
        .map(({ ruta, titulo, mtime }) => ({ ruta, titulo, mtime })),
    };
  } catch { return vacio; }
}

// ctx: {raiz (OFICINA_BOVEDA), preguntas (OFICINA_PREGUNTAS), worktrees (con checkouts principales), ligas? (leerLigas), hoy?}
export function tablero(ctx) {
  const c = cargar(ctx.raiz);
  const modulos = Object.keys(MODULOS).map((id) => {
    const { id: _i, nombre, aviso, nota, pct, prioridad, conteos, falta, sinTarea, bloquean, dudas, sinSubir, auditoria: a, calendario: cal } = armar(id, c, ctx, false);
    return { id, nombre, ...(aviso && { aviso }), nota, pct, prioridad, conteos, brechas: falta?.length ?? 0, sinTarea, bloquean, dudas: dudas?.abiertas.length, sinSubir, alertas: a?.alertas.length, cierre: cal?.cierre };
  });
  modulos.sort((a, b) => !!b.prioridad - !!a.prioridad); // estable: los prioritarios primero, el resto en su orden
  const cal = calendario('MOD-COM', c, ctx.raiz, ctx.hoy ?? new Date());
  const ligadas = new Set(c.expedientes.flatMap((e) => [e.rama, e.id]).filter(Boolean));
  const sinLigar = (ctx.worktrees ?? []).filter((w) => (w.sin_commit > 0 || w.sin_subir > 0) && !ctx.ligas?.has(w.rama) && !ligadas.has(w.rama) && !ligadas.has(w.id) && !ligadas.has(w.nombre))
    .map((w) => ({ ruta: w.ruta, rama: w.rama, sin_commit: w.sin_commit, sin_subir: w.sin_subir }));
  return { corte: cal.corte, entrega: cal.entrega, diasParaEntrega: cal.diasParaEntrega, modulos, sinLigar,
    ligas: [...(ctx.ligas ?? new Map())].map(([rama, modulo]) => ({ rama, modulo })) };
}

export function detalle(id, ctx) {
  const mod = moduloDe(id);
  return MODULOS[mod] ? armar(mod, cargar(ctx.raiz), ctx, true) : null;
}
