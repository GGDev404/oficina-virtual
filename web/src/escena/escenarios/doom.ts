// Escenario del tema «doom» (contrato en comun.ts): base UAC oxidada. Rejillas y placas con remaches en pasillo y muros,
// terminales ámbar de escritorio, barriles, grietas de lava en Bloqueados (brillo que respira + brasas que suben) y
// runas grabadas muy tenues en Descanso. Pisos de poco contraste para no competir con los personajes; brillos = trazo
// duplicado de baja opacidad, sin filter. Solo la lava se anima (opacidad y transform, horneado como las figuras).
import { pulso, type PoseDef } from '../animacion'
import { nodo } from '../rig'
import { ESCRITORIOS, MESA_YO, SALAS, W, H, damero, rects, usar, v, type Animado, type Escenario, type Rect } from './comun'

const AMBAR = '#ffb000', ASCUA = '#ff5a1f', LATON = '#c9a24a', OXIDO = '#8a4a2a', NEGRO = '#1d1512', HUESO = '#f2e6c0'
type Pt = [number, number]
const r = (g: Element, x: number, y: number, w: number, h: number, fill: string, o = 1) => nodo('rect', { x, y, width: w, height: h, fill, opacity: o }, g)
/** Tramos rectos (horizontales o verticales) entre puntos consecutivos, de grosor t. */
const tramo = (pts: Pt[], t: number): [number, number, number, number][] => pts.slice(1).map(([x2, y2], i) => {
  const [x1, y1] = pts[i]
  return y1 === y2 ? [Math.min(x1, x2), y1, Math.abs(x2 - x1) + t, t] : [x1, Math.min(y1, y2), t, Math.abs(y2 - y1) + t]
})

// Grietas de lava de Bloqueados (coordenadas de la escena). Cada una pertenece a la celda animada que la ilumina.
const GRIETA_A: Pt[][] = [[[14, 196], [26, 196], [26, 206], [38, 206], [38, 216], [46, 216], [46, 226]], [[26, 206], [26, 212], [18, 212], [18, 222]]]
const GRIETA_B: Pt[][] = [[[54, 232], [54, 240], [66, 240], [66, 248], [76, 248], [76, 262]], [[66, 248], [66, 258], [58, 258]]]
const CELDA_A: Pt = [30, 226], CELDA_B: Pt = [72, 262]
const BRASAS_B: Pt[] = [[60, 238], [70, 244], [76, 254]]

function lavaRig(o: Pt, ramas: Pt[][], brasas: Pt[]) {
  return () => {
    const g = nodo('g', {}, undefined, 'pj')
    const l = nodo('g', { transform: `translate(${-o[0]} ${-o[1]})` }, g)
    const b = nodo('g', {}, l, 'brillo')
    for (const rama of ramas) for (const [x, y, w, h] of tramo(rama, 2)) {
      r(b, x - 2, y - 2, w + 4, h + 4, ASCUA, 0.16) // halo
      r(b, x, y, w, h, AMBAR, 0.95)
    }
    brasas.forEach(([x, y], k) => { const e = nodo('g', {}, l, `brasa b${k}`); r(e, x, y, 2, 2, ASCUA, 0.9); r(e, x, y, 1, 1, AMBAR) })
    return g
  }
}
const frac = (n: number) => n - Math.floor(n)
const LAVA = (brasas: number): PoseDef => ({
  dur: 3, cuadros: 12, // respira cada 3 s en 12 pasos de 0,25 s
  partes: {
    '.brillo': (t) => ({ o: 0.3 + 0.6 * pulso(t) }),
    ...Object.fromEntries(Array.from({ length: brasas }, (_, k) => [`.brasa.b${k}`, (t: number) => {
      const u = frac(t + k / brasas)
      return { y: -9 * u, x: 1.5 * Math.sin(6.28 * (u + k)), o: u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8 }
    }])),
  },
})

export function escenario(): Escenario {
  const g = nodo('g', { 'shape-rendering': 'crispEdges' })
  const defs = nodo('defs', {}, g)
  // Terminal ámbar: escritorio de acero con el monitor donde siempre (7,−9)…(23,2); la pantalla viva la pone escena.ts encima.
  const term = nodo('g', { id: 'doom-terminal' }, defs)
  rects(term, [
    [0, 2, 30, 9, '#6a4a38'], [0, 2, 30, 1, '#8a6248'], [0, 11, 30, 3, '#3d2a22'], [1, 14, 2, 2, '#2a1c16'], [27, 14, 2, 2, '#2a1c16'],
    [7, -9, 16, 11, '#26201c'], [14, 2, 2, 2, '#26201c'], [8, -8, 14, 8, '#2a0d06'],
    [9, 6, 12, 3, NEGRO], [9, 8, 12, 1, '#3d2a22'], [10, 6.5, 2, 1, AMBAR], [14, 6.5, 2, 1, AMBAR], [18, 6.5, 2, 1, AMBAR],
    [24, 3, 3, 5, OXIDO], [24, 3, 3, 1, LATON], [20, 1, 2, 1, AMBAR],
  ])
  nodo('rect', { x: 7.5, y: -8.5, width: 15, height: 10, fill: 'none', stroke: AMBAR, 'stroke-width': 1, opacity: 0.22 }, term)
  const barril = (id: string, cuerpo: string, luz: string) => rects(nodo('g', { id }, defs), [
    [1, 3, 10, 12, cuerpo], [2, 3, 2, 12, luz], [1, 6, 10, 1, '#2a1c16'], [1, 11, 10, 1, '#2a1c16'], [1, 1, 10, 3, '#5a3a26'], [2, 1, 8, 1, '#8a6248'],
    [4, 7, 4, 3, '#e8c25a'], [5, 8, 2, 1, NEGRO],
  ])
  barril('doom-barril', '#7a4a2e', '#9a6038'); barril('doom-barril-r', '#8a2a1a', '#ad3d28')
  rects(nodo('g', { id: 'doom-caja' }, defs), [
    [0, 0, 16, 14, '#5a4636'], [0, 0, 16, 2, '#7a604a'], [0, 6, 16, 2, '#3d2f24'], [7, 0, 2, 14, LATON], [1, 12, 14, 2, '#3d2f24'],
  ])
  damero(defs, 'doom-p-pasillo', 0, 0, 16, v('pasillo'), v('pasillo-2'))
  for (const [k, s] of Object.entries(SALAS)) damero(defs, `doom-p-${k}`, s.x, s.y + 14, 8, v(k), v(`${k}-2`))
  // Rejilla (líneas finas oscuras) y placa remachada: texturas que apenas se notan.
  const reja = nodo('pattern', { id: 'doom-reja', width: 8, height: 8, patternUnits: 'userSpaceOnUse' }, defs)
  r(reja, 0, 0, 8, 1, '#000', 0.22); r(reja, 0, 0, 1, 8, '#000', 0.22); r(reja, 3, 3, 2, 2, '#000', 0.08)
  const placa = nodo('pattern', { id: 'doom-placa', width: 16, height: 16, patternUnits: 'userSpaceOnUse' }, defs)
  r(placa, 0, 0, 16, 1, '#000', 0.28); r(placa, 0, 0, 1, 16, '#000', 0.28)
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) { r(placa, x, y, 1, 1, '#000', 0.4); r(placa, x - 1, y - 1, 1, 1, '#fff', 0.1) }
  const raya = nodo('pattern', { id: 'doom-peligro', width: 8, height: 2, patternUnits: 'userSpaceOnUse' }, defs)
  r(raya, 0, 0, 4, 2, LATON, 0.55); r(raya, 4, 0, 4, 2, NEGRO, 0.55)

  rects(g, [[0, 0, W, H, 'url(#doom-p-pasillo)'], [0, 0, W, H, 'url(#doom-reja)'], [0, 145, W, 2, v('linea')], [287, 0, 2, H, v('linea')]])
  for (let x = 6; x < W; x += 24) r(g, x, 143.5, 12, 1, LATON, 0.16) // guía amarilla desgastada del pasillo

  for (const [k, s] of Object.entries(SALAS)) {
    rects(g, [
      [s.x, s.y + 14, s.w, s.h - 14, `url(#doom-p-${k})`],
      [s.x, s.y, s.w, 2, v('muro-alto')], [s.x, s.y + 2, s.w, 10, v('muro')], [s.x, s.y + 12, s.w, 2, v('zocalo')],
      [s.x, s.y, 2, s.h, v('borde')], [s.x + s.w - 2, s.y, 2, s.h, v('borde')], [s.x, s.y + s.h - 2, s.w, 2, v('borde')],
    ])
    if (k === 'taller') r(g, s.x + 2, s.y + 14, s.w - 4, s.h - 16, 'url(#doom-reja)')
    else if (k !== 'descanso') r(g, s.x + 2, s.y + 14, s.w - 4, s.h - 16, 'url(#doom-placa)')
    // Muro de base UAC: paneles con costuras y remaches, zócalo con franja de peligro.
    for (let x = s.x + 16; x < s.x + s.w - 4; x += 32) { r(g, x, s.y + 2, 1, 10, '#000', 0.32); r(g, x + 1, s.y + 2, 1, 10, '#fff', 0.06) }
    for (let x = s.x + 8; x < s.x + s.w - 4; x += 16) for (const y of [3, 9]) { r(g, x, s.y + y, 2, 2, '#8a6a52', 0.8); r(g, x, s.y + y + 1, 2, 1, '#000', 0.3) }
    r(g, s.x + 2, s.y + 12, s.w - 4, 2, 'url(#doom-peligro)')
    const px = s.puerta - 12
    if (s.abajo) rects(g, [[px, s.y + s.h - 2, 24, 2, v(k)], [px - 2, s.y + s.h - 5, 2, 5, v('marco')], [px + 24, s.y + s.h - 5, 2, 5, v('marco')]])
    else rects(g, [[px, s.y, 24, 14, v('pasillo')], [px - 2, s.y, 2, 14, v('marco')], [px + 24, s.y, 2, 14, v('marco')]])
  }

  // Taller: consola mural con líneas ámbar y letreros de aviso.
  rects(g, [[150, 3, 52, 9, NEGRO], [150, 3, 52, 1, '#6a4a38'], [150, 11, 52, 1, '#6a4a38'], [153, 5, 18, 1, AMBAR], [153, 7, 26, 1, ASCUA], [153, 9, 14, 1, LATON],
    [208, 4, 9, 7, LATON], [210, 5, 1, 3, NEGRO], [210, 9, 1, 1, NEGRO], [220, 5, 9, 6, OXIDO], [222, 6, 5, 1, HUESO], [222, 8, 3, 1, HUESO], [232, 4, 9, 7, '#a6281c'], [235, 5, 3, 3, HUESO]])
  r(g, 150, 3, 52, 9, AMBAR, 0.05)
  for (const e of ESCRITORIOS) usar(g, 'doom-terminal', e.dx, e.dy)
  usar(g, 'doom-barril', 4, 104); usar(g, 'doom-barril-r', 224, 18); usar(g, 'doom-barril', 238, 20)

  // Tu puerta: mesa de acero y felpudo oscuro con borde de latón.
  const p = SALAS.puerta
  rects(g, [[p.x + 12, p.y + 16, 50, 6, '#6a4a38'], [p.x + 12, p.y + 22, 50, 2, '#3d2a22'], [p.x + 12, p.y + 16, 50, 1, '#8a6248'],
    [p.puerta - 16, p.y + p.h - 18, 32, 12, LATON], [p.puerta - 15, p.y + p.h - 17, 30, 10, '#4a1610'], [p.puerta - 13, p.y + p.h - 15, 26, 6, '#6e1a10']])
  usar(g, 'doom-barril-r', p.x + p.w - 18, p.y + 16)

  // Bloqueados: grietas de lava (núcleo oscuro y brillo base; la celda animada las hace respirar), cajas UAC.
  const b = SALAS.bloqueados
  for (const rama of [...GRIETA_A, ...GRIETA_B]) for (const [x, y, w, h] of tramo(rama, 2)) {
    r(g, x - 2, y - 2, w + 4, h + 4, '#000', 0.35) // borde chamuscado
    r(g, x - 1, y - 1, w + 2, h + 2, ASCUA, 0.12)
    r(g, x, y, w, h, '#2a0d06')
    r(g, x, y, w, h, ASCUA, 0.45)
  }
  usar(g, 'doom-caja', b.x + 84, b.y + 86); usar(g, 'doom-caja', b.x + 6, b.y + 90); usar(g, 'doom-caja', b.x + 10, b.y + 76)

  // Descanso: sofá de cuero oxidado, expendedora ámbar, y runas grabadas en el piso (circulares, apenas visibles).
  const d = SALAS.descanso
  const c = { x: d.x + 82, y: d.y + 66 }
  const rune = nodo('g', { fill: 'none', stroke: LATON, 'stroke-width': 1, opacity: 0.16 }, g)
  nodo('circle', { cx: c.x, cy: c.y, r: 26 }, rune); nodo('circle', { cx: c.x, cy: c.y, r: 20 }, rune)
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, ca = Math.cos(a), sa = Math.sin(a)
    nodo('path', { d: `M${c.x + 20 * ca} ${c.y + 20 * sa}L${c.x + 26 * ca} ${c.y + 26 * sa}` }, rune)
    const m = a + Math.PI / 8, gx = c.x + 23 * Math.cos(m), gy = c.y + 23 * Math.sin(m) // glifos entre los radios, alternados
    nodo('path', { d: k % 2 ? `M${gx - 1.5} ${gy - 1.5}h3v3` : `M${gx} ${gy - 2}v4M${gx - 1.5} ${gy}h3` }, rune)
  }
  nodo('path', { d: `M${c.x} ${c.y - 13}L${c.x + 11} ${c.y + 8}H${c.x - 11}Z` }, rune)
  rects(g, [[d.x + 8, d.y + 16, 56, 14, '#7a3a28'], [d.x + 8, d.y + 16, 56, 4, '#9a4e36'], [d.x + 6, d.y + 18, 4, 12, '#4a2418'], [d.x + 62, d.y + 18, 4, 12, '#4a2418'],
    [d.x + 128, d.y + 15, 16, 20, '#3d3430'], [d.x + 131, d.y + 18, 10, 6, '#2a0d06'], [d.x + 132, d.y + 19, 8, 1, AMBAR], [d.x + 132, d.y + 21, 5, 1, ASCUA], [d.x + 133, d.y + 27, 6, 5, HUESO],
    [d.x + 104, d.y + 18, 14, 10, '#5a4636'], [d.x + 104, d.y + 18, 14, 2, '#7a604a'], [d.x + 107, d.y + 16, 4, 3, HUESO]])
  usar(g, 'doom-barril', d.x + d.w - 18, d.y + d.h - 22)

  // Tu oficina: archivadores UAC y alfombra de lona oscura con borde ámbar (tu mesa va aparte).
  const o = SALAS.oficina
  rects(g, [[o.x + 106, o.y + 2, 30, 12, '#3d3430'], ...['#a6281c', '#8a4a2a', '#c9a24a', '#5a4636', '#a6281c', '#8a4a2a'].map((col, k): Rect => [o.x + 108 + k * 4, o.y + 4, 3, 8, col]),
    [o.x + 140, o.y + 2, 18, 11, '#5a4636'], [o.x + 140, o.y + 2, 18, 3, '#7a3f22'],
    ...Array.from({ length: 8 }, (_, k): Rect => [o.x + 142 + (k % 4) * 4, o.y + 6 + Math.floor(k / 4) * 3, 2, 2, LATON]),
    [MESA_YO.dx - 10, MESA_YO.dy - 18, 60, 44, '#6a4a2a'], [MESA_YO.dx - 9, MESA_YO.dy - 17, 58, 42, '#2e211a'], [MESA_YO.dx - 8, MESA_YO.dy - 16, 56, 40, '#3a2a20']])
  usar(g, 'doom-barril', o.x + 6, o.y + o.h - 22)

  const animados: Animado[] = [
    { clave: 'lava-a', x: CELDA_A[0], y: CELDA_A[1], z: 0, rig: lavaRig(CELDA_A, GRIETA_A, []), pose: LAVA(0) },
    { clave: 'lava-b', x: CELDA_B[0], y: CELDA_B[1], z: 0, rig: lavaRig(CELDA_B, GRIETA_B, BRASAS_B), pose: LAVA(BRASAS_B.length) },
  ]
  return { g, animados }
}
