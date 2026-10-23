// Escenario del tema «cyberpunk» (Night City; contrato en comun.ts): piso casi negro con bordes de neón, escritorios
// holográficos (el monitor queda donde está), letreros de neón por cuarto con texto propio (fuente de píxeles de 3×5),
// scanlines estáticas, cables y máquinas expendedoras en Descanso. Neón = rect/trazo duplicado de baja opacidad, nunca
// filter. Lo animado (dentro de `animados`, solo opacity): dos letreros que pulsan suave y uno que parpadea una vez cada 6 s.
import { pulso, type PoseDef } from '../animacion'
import { nodo } from '../rig'
import { damero, ESCRITORIOS, H, MESA_YO, rects, SALAS, usar, v, W, type Animado, type Escenario, type Sala } from './comun'

const CIAN = '#4fe3f0', MAG = '#ff2a6d', AMA = '#fcee0a', ROJO = '#ff5c3a'
const ACENTO: Record<Sala, string> = { taller: CIAN, puerta: MAG, bloqueados: ROJO, descanso: CIAN, oficina: AMA }

/** Rect de neón: núcleo + aura 1 px más grande y tenue. */
const neon = (g: Element, x: number, y: number, w: number, h: number, c: string, aura = 0.22) => {
  nodo('rect', { x: x - 1, y: y - 1, width: w + 2, height: h + 2, fill: c, opacity: aura }, g)
  nodo('rect', { x, y, width: w, height: h, fill: c }, g)
}
/** Marco de neón de 1 px (rect sin relleno) con aura. */
const marco = (g: Element, x: number, y: number, w: number, h: number, c: string, o = 0.9) => {
  nodo('rect', { x: x + 0.5, y: y + 0.5, width: w - 1, height: h - 1, fill: 'none', stroke: c, 'stroke-width': 3, opacity: 0.16 }, g)
  nodo('rect', { x: x + 0.5, y: y + 0.5, width: w - 1, height: h - 1, fill: 'none', stroke: c, 'stroke-width': 1, opacity: o }, g)
}

// Fuente de píxeles 3×5 solo con las letras de los letreros (GIG, ICE, BAR, NET, HUB).
const LETRAS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', E: '111100110100111', G: '011100101101011',
  H: '101101111101101', I: '111010010010111', N: '110101101101101', R: '110101110101101', T: '111010010010010', U: '101101101101111',
}
const anchoTexto = (t: string) => t.length * 4 - 1
/** Letrero: aura (trazo ancho tenue) + píxeles. Devuelve el grupo `.sign`. */
function letrero(p: Element, t: string, x: number, y: number, c: string, o = 1) {
  const g = nodo('g', { opacity: o }, p, 'sign')
  let d = ''
  for (const [i, ch] of [...t].entries()) for (let k = 0; k < 15; k++) if (LETRAS[ch][k] === '1') d += `M${x + i * 4 + (k % 3)} ${y + Math.floor(k / 3)}h1v1h-1z`
  nodo('path', { d, fill: c, stroke: c, 'stroke-width': 2.4, 'stroke-linejoin': 'round', opacity: 0.2 }, g)
  nodo('path', { d, fill: c }, g)
  return g
}

// Letreros por cuarto: texto, color y posición (en el muro, lejos de la etiqueta de la esquina); los animados se avivan encima.
const SIGNS: { sala: Sala; t: string; dx: number; c: string; anim?: 'pulso' | 'parpadeo' }[] = [
  { sala: 'taller', t: 'NET', dx: 100, c: CIAN }, { sala: 'puerta', t: 'GIG', dx: 62, c: MAG, anim: 'pulso' },
  { sala: 'bloqueados', t: 'ICE', dx: 62, c: ROJO, anim: 'parpadeo' }, { sala: 'descanso', t: 'BAR', dx: 64, c: CIAN, anim: 'pulso' },
  { sala: 'oficina', t: 'HUB', dx: 64, c: AMA },
]
const SIGN_Y = 4 // dentro de la franja de muro (10 px de alto)

export function escenario(): Escenario {
  const g = nodo('g', { 'shape-rendering': 'crispEdges' })
  const defs = nodo('defs', {}, g)

  // ── Símbolos: escritorio holográfico y planta de neón ──
  const esc = nodo('g', { id: 'esc-escritorio' }, defs)
  nodo('rect', { x: -1, y: 12, width: 32, height: 6, fill: CIAN, opacity: 0.08 }, esc) // luz bajo la mesa
  rects(esc, [[0, 2, 30, 9, '#0b1428'], [0, 11, 30, 3, '#0a0d1a']])
  nodo('rect', { x: 0, y: 2, width: 30, height: 9, fill: CIAN, opacity: 0.16 }, esc) // tablero translúcido
  rects(esc, [[0, 2, 30, 1, CIAN], [0, 10, 30, 1, '#2a8f9a'], [2, 13, 26, 1, MAG], [2, 14, 1, 3, '#2a8f9a'], [27, 14, 1, 3, '#2a8f9a']])
  rects(esc, [[7, -9, 16, 11, '#080c18'], [8, -8, 14, 8, v('monitor')], [14, 2, 2, 2, '#1b2a44']]) // pantalla en dx+8…22, dy−8…0
  marco(esc, 7, -9, 16, 11, CIAN, 0.8)
  rects(esc, [[9, 6, 12, 3, '#1b4a5a'], [9, 6, 12, 1, CIAN], [24, 4, 3, 3, MAG], [24, 4, 3, 1, '#ffd0de']]) // teclado holográfico y taza
  const pl = nodo('g', { id: 'esc-planta' }, defs)
  rects(pl, [[2, 8, 8, 6, '#221a3a'], [2, 8, 8, 1, CIAN], [3, 1, 6, 7, '#22b583'], [1, 3, 3, 4, '#168a62'], [8, 3, 3, 4, '#168a62'], [5, 0, 2, 2, '#6dffc3']])
  // ── Texturas: piso en damero casi negro, scanlines estáticas ──
  damero(defs, 'esc-p-pasillo', 0, 0, 16, v('pasillo'), v('pasillo-2'))
  for (const [k, s] of Object.entries(SALAS)) damero(defs, `esc-p-${k}`, s.x, s.y + 14, 8, v(k), v(`${k}-2`))
  const scan = nodo('pattern', { id: 'esc-scan', x: 0, y: 0, width: 4, height: 3, patternUnits: 'userSpaceOnUse' }, defs)
  nodo('rect', { x: 0, y: 0, width: 4, height: 1, fill: '#000', opacity: 0.24 }, scan)

  rects(g, [[0, 0, W, H, 'url(#esc-p-pasillo)']])
  neon(g, 0, 145, W, 1, MAG, 0.16); neon(g, 287, 0, 1, H, CIAN, 0.14) // líneas del pasillo
  for (const [k, s] of Object.entries(SALAS) as [Sala, (typeof SALAS)[Sala]][]) {
    const c = ACENTO[k], px = s.puerta - 12
    rects(g, [
      [s.x, s.y + 14, s.w, s.h - 14, `url(#esc-p-${k})`],
      [s.x, s.y, s.w, 2, v('muro-alto')], [s.x, s.y + 2, s.w, 10, v('muro')], [s.x, s.y + 12, s.w, 2, v('zocalo')],
    ])
    nodo('rect', { x: s.x, y: s.y + 14, width: s.w, height: s.h - 14, fill: '#000', opacity: 0.32 }, g) // piso más oscuro: no compite con las figuras
    neon(g, s.x + 3, s.y + 12, s.w - 6, 1, c, 0.2) // tira de neón al pie del muro
    // Contorno de neón del cuarto, con hueco en la puerta (abajo si el cuarto abre hacia abajo; si no, arriba).
    const lado = (x: number, y: number, w: number, h: number) => neon(g, x, y, w, h, c, 0.16)
    const borde = (y: number, conPuerta: boolean) => {
      if (conPuerta) { lado(s.x, y, px - s.x, 1); lado(px + 24, y, s.x + s.w - px - 24, 1) } else lado(s.x, y, s.w, 1)
    }
    borde(s.y, !s.abajo); borde(s.y + s.h - 1, s.abajo)
    lado(s.x, s.y, 1, s.h); lado(s.x + s.w - 1, s.y, 1, s.h)
    // Puerta: hueco con dos jambas de neón (el piso del pasillo entra por él).
    if (s.abajo) rects(g, [[px, s.y + s.h - 2, 24, 2, v(k)]])
    else rects(g, [[px, s.y, 24, 14, v('pasillo')]])
    const yj = s.abajo ? s.y + s.h - 5 : s.y
    neon(g, px - 1, yj, 1, 5, c, 0.3); neon(g, px + 24, yj, 1, 5, c, 0.3)
  }
  rects(g, [[0, 0, W, H, 'url(#esc-scan)']]) // scanlines sobre pisos y muros; los muebles van encima

  // ── Letreros (los animados, apagados al 55 %; la capa animada los aviva por encima) ──
  for (const s of SIGNS) letrero(g, s.t, SALAS[s.sala].x + s.dx, SALAS[s.sala].y + SIGN_Y, s.c, s.anim ? 0.55 : 0.95)
  // ── Taller: pizarra holográfica con gráficas y tres marcos de neón ──
  rects(g, [[150, 3, 52, 9, '#071526']]); marco(g, 150, 3, 52, 9, CIAN, 0.8)
  rects(g, [[153, 5, 18, 1, CIAN], [153, 7, 26, 1, MAG], [153, 9, 14, 1, AMA], [183, 5, 1, 5, '#2a8f9a'], [187, 7, 1, 3, '#2a8f9a'], [191, 4, 1, 6, '#2a8f9a'], [195, 6, 1, 4, '#2a8f9a']])
  for (const [x, c] of [[208, MAG], [220, CIAN], [232, AMA]] as const) { rects(g, [[x, 4, 9, 7, '#0b0a18'], [x + 3, 6, 3, 3, c]]); marco(g, x, 4, 9, 7, c, 0.7) }
  for (const e of ESCRITORIOS) usar(g, 'esc-escritorio', e.dx, e.dy)
  usar(g, 'esc-planta', 4, 104); usar(g, 'esc-planta', 224, 18)
  // ── Tu puerta: mostrador de neón y alfombra luminosa ──
  const p = SALAS.puerta
  rects(g, [[p.x + 12, p.y + 16, 50, 6, '#150f2a'], [p.x + 12, p.y + 22, 50, 2, '#0a0814']]); neon(g, p.x + 12, p.y + 16, 50, 1, CIAN, 0.2); neon(g, p.x + 14, p.y + 23, 46, 1, MAG, 0.2)
  rects(g, [[p.puerta - 16, p.y + p.h - 18, 32, 12, '#150a22']]); marco(g, p.puerta - 16, p.y + p.h - 18, 32, 12, MAG, 0.85); neon(g, p.puerta - 11, p.y + p.h - 13, 22, 1, CIAN, 0.2)
  usar(g, 'esc-planta', p.x + p.w - 18, p.y + 16)
  // ── Bloqueados: cajas con franjas de peligro ──
  const b = SALAS.bloqueados
  for (const [x, y, w, h] of [[b.x + 84, b.y + 86, 16, 14], [b.x + 6, b.y + 90, 12, 10]] as const) {
    rects(g, [[x, y, w, h, '#160f20']]); marco(g, x, y, w, h, ROJO, 0.75)
    for (let k = 2; k < w - 3; k += 4) rects(g, [[x + k, y + 2, 2, h - 4, '#7a2a1c']])
  }
  // ── Descanso: sofá magenta, dos máquinas expendedoras y cables por el piso ──
  const d = SALAS.descanso
  const cable = (dd: string, c: string) => {
    for (const [col, w, o] of [['#0a0814', 2.4, 1], ['#2d2447', 1.6, 1], [c, 0.5, 0.55]] as const) nodo('path', { d: dd, fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linecap': 'round', opacity: o }, g)
  }
  cable(`M${d.x + 118} ${d.y + 37}q-8 10-22 5t-24 4`, MAG); cable(`M${d.x + 136} ${d.y + 37}q6 8 14 4t10 10`, CIAN); cable(`M${d.x + 76} ${d.y + 46}q-8-2-14-12`, AMA)
  rects(g, [[d.x + 8, d.y + 16, 56, 14, '#2a1238'], [d.x + 6, d.y + 18, 4, 12, '#1e0c2b'], [d.x + 62, d.y + 18, 4, 12, '#1e0c2b'], [d.x + 12, d.y + 20, 22, 8, '#3a1a4e'], [d.x + 38, d.y + 20, 22, 8, '#3a1a4e']])
  neon(g, d.x + 8, d.y + 16, 56, 1, MAG, 0.22)
  const COLS = [MAG, CIAN, AMA]
  for (const [m, x] of [d.x + 110, d.x + 128].entries()) {
    rects(g, [[x, d.y + 15, 16, 22, '#121024'], [x + 2, d.y + 18, 12, 11, '#05202a']])
    nodo('rect', { x: x + 1, y: d.y + 17, width: 14, height: 13, fill: CIAN, opacity: 0.14 }, g) // brillo de la vitrina
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) rects(g, [[x + 3 + q * 4, d.y + 19 + r * 3, 3, 2, COLS[(r + q + m) % 3]]])
    rects(g, [[x + 3, d.y + 31, 10, 3, '#05080f']]); neon(g, x, d.y + 15, 16, 1, m ? MAG : CIAN, 0.25)
  }
  usar(g, 'esc-planta', d.x + d.w - 18, d.y + d.h - 22)
  // ── Tu oficina: rack de datos con LEDs, panel holográfico y tu tapete ──
  const o = SALAS.oficina
  rects(g, [[o.x + 106, o.y + 2, 30, 12, '#0c0a1a']])
  for (const [k, c] of [CIAN, MAG, AMA, CIAN, MAG, AMA].entries()) rects(g, [[o.x + 108 + k * 4, o.y + 4, 3, 8, '#171330'], [o.x + 108 + k * 4, o.y + 5 + (k % 3) * 2, 3, 1, c]])
  rects(g, [[o.x + 140, o.y + 2, 18, 11, '#071526']]); marco(g, o.x + 140, o.y + 2, 18, 11, CIAN, 0.8)
  for (let k = 0; k < 8; k++) rects(g, [[o.x + 142 + (k % 4) * 4, o.y + 6 + Math.floor(k / 4) * 3, 2, 2, k % 3 ? '#2a8f9a' : MAG]])
  cable(`M${o.x + 112} ${o.y + 14}q4 10 12 8t14-4`, MAG)
  rects(g, [[MESA_YO.dx - 10, MESA_YO.dy - 18, 60, 44, '#120d24']]); marco(g, MESA_YO.dx - 10, MESA_YO.dy - 18, 60, 44, AMA, 0.55)
  usar(g, 'esc-planta', o.x + 6, o.y + o.h - 22)

  // ── Animados: el letrero encendido por encima del apagado (solo opacity) ──
  const POSE_PULSO: PoseDef = { dur: 4, cuadros: 12, partes: { '.sign': (t) => ({ o: 0.25 + 0.75 * pulso(t) }) } }
  // Parpadeo: encendido casi siempre; un apagón de ~0,08 s cada 6 s (un solo destello).
  const POSE_PARPADEO: PoseDef = { dur: 6, cuadros: 2, pesos: [71, 1], partes: { '.sign': (t) => ({ o: t >= 0.5 ? 0 : 1 }) } }
  const animados: Animado[] = SIGNS.filter((s) => s.anim).map((s) => {
    const sa = SALAS[s.sala], w = anchoTexto(s.t)
    return {
      clave: `neon-${s.sala}`, x: sa.x + s.dx + w / 2, y: sa.y + 14, z: 0,
      rig: () => { const r = nodo('g', {}, undefined, 'pj'); letrero(r, s.t, -w / 2, SIGN_Y - 14, s.c); return r },
      pose: s.anim === 'pulso' ? POSE_PULSO : POSE_PARPADEO,
    }
  })
  return { g, animados, mesa }
}

/** Tu mesa holográfica (misma caja que mesaYo): tablero translúcido, monitor de neón, bandeja luminosa con `.pila` de 6 hojas. */
function mesa(): SVGGElement {
  const m = MESA_YO, g = nodo('g', { 'shape-rendering': 'crispEdges' })
  nodo('rect', { x: m.dx - 1, y: m.dy + 15, width: 42, height: 3, fill: AMA, opacity: 0.1 }, g) // luz bajo la mesa
  rects(g, [[m.dx, m.dy, 40, 10, '#0b1428'], [m.dx, m.dy + 10, 40, 6, '#0a0d1a']])
  nodo('rect', { x: m.dx, y: m.dy, width: 40, height: 10, fill: AMA, opacity: 0.12 }, g)
  rects(g, [[m.dx, m.dy, 40, 1, AMA], [m.dx, m.dy + 9, 40, 1, '#8a8420'], [m.dx + 3, m.dy + 12, 34, 1, MAG], [m.dx + 3, m.dy + 13, 1, 4, '#8a8420'], [m.dx + 36, m.dy + 13, 1, 4, '#8a8420']])
  rects(g, [[m.dx + 25, m.dy - 9, 12, 10, '#080c18'], [m.dx + 26, m.dy - 8, 10, 7, v('monitor')], [m.dx + 30, m.dy + 1, 2, 2, '#1b2a44']])
  marco(g, m.dx + 25, m.dy - 9, 12, 10, CIAN, 0.85)
  rects(g, [[m.dx + 27, m.dy - 6, 6, 1, CIAN], [m.dx + 27, m.dy - 4, 4, 1, MAG]])
  rects(g, [[m.dx + 2, m.dy + 2, 9, 6, '#150f2a']]); marco(g, m.dx + 2, m.dy + 2, 9, 6, CIAN, 0.7) // bandeja
  const pila = nodo('g', {}, g, 'pila')
  for (let k = 0; k < 6; k++) nodo('rect', { x: m.dx + 3, y: m.dy + 5 - k, width: 7, height: 1, fill: k % 2 ? '#bff6fb' : '#ffffff' }, pila)
  return g
}
