// Escenario del tema «halo»: interior de nave UNSC (contrato en comun.ts). Pisos de placas de acero con remaches, mamparos
// con ductos y franjas de peligro en las puertas, escritorios como consolas con pantalla holográfica cian y, animado, el
// barrido de un radar de movimiento y luces de pasillo que pulsan despacio. Arte original; sin logos ni tipografías oficiales.
import { pulso, type PoseDef } from '../animacion'
import { colorDe } from '../hornear'
import { nodo } from '../rig'
import { ESCRITORIOS, MESA_YO, SALAS, W, H, damero, rects, usar, v, type Animado, type Escenario, type Rect } from './comun'

const CIAN = '#5fd4f4'
const op = (g: Element, x: number, y: number, w: number, h: number, fill: string, o: number) => nodo('rect', { x, y, width: w, height: h, fill, opacity: o }, g)

// Placas de acero de t × t px en dos tonos, con junta y cuatro remaches por placa: contraste bajo para no competir con las figuras.
function placas(defs: Element, id: string, x: number, y: number, t: number, a: string, b: string) {
  damero(defs, id, x, y, t, a, b)
  const p = defs.querySelector(`#${id}`)!
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const ox = i * t, oy = j * t
    op(p, ox + t - 1, oy, 1, t, '#000', 0.2); op(p, ox, oy + t - 1, t, 1, '#000', 0.2)
    for (const [rx, ry] of [[2, 2], [t - 4, 2], [2, t - 4], [t - 4, t - 4]]) op(p, ox + rx, oy + ry, 1, 1, '#fff', 0.2)
  }
}

export function escenario(): Escenario {
  const g = nodo('g', { 'shape-rendering': 'crispEdges' })
  const defs = nodo('defs', {}, g)
  // Franja de peligro: diagonales amarillas y negras.
  const h = nodo('pattern', { id: 'esc-peligro', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs)
  rects(h, [[0, 0, 4, 8, '#d9ab1f'], [4, 0, 4, 8, '#1b1f22']])
  // Consola UNSC: pie de acero, panel con tira cian, teclado holográfico y monitor (8…22, −8…0) con marco.
  rects(nodo('g', { id: 'esc-escritorio' }, defs), [
    [0, 2, 30, 9, '#56666e'], [0, 2, 30, 1, '#8196a0'], [0, 11, 30, 3, '#2c383e'], [1, 14, 2, 2, '#1c252a'], [27, 14, 2, 2, '#1c252a'],
    [3, 12, 24, 1, '#2f8fb0'], [7, -9, 16, 11, '#27353c'], [7, -9, 16, 1, '#3f525b'], [14, 2, 2, 2, '#27353c'], [8, -8, 14, 8, '#06161d'],
    [8, -8, 14, 1, '#3d9cbc'], [9, 5, 12, 4, '#0d2d38'], [9, 5, 12, 1, CIAN], [10, 7, 4, 1, '#2f8fb0'], [16, 7, 4, 1, '#2f8fb0'],
    [24, 4, 4, 4, '#1c252a'], [25, 5, 2, 1, '#a7d36b'], [25, 7, 2, 1, '#e0b020'],
  ])
  // Cajas de suministro y taquillas.
  rects(nodo('g', { id: 'esc-caja' }, defs), [[0, 0, 14, 12, '#59634a'], [0, 0, 14, 2, '#7a8564'], [0, 5, 14, 1, '#3f4733'], [6, 0, 2, 12, '#3f4733'], [2, 8, 3, 2, '#d9ab1f']])
  rects(nodo('g', { id: 'esc-taquilla' }, defs), [[0, 0, 5, 12, '#5b6b72'], [0, 0, 5, 1, '#8196a0'], [1, 3, 3, 1, '#2c383e'], [1, 5, 3, 1, '#2c383e'], [2, 9, 1, 1, CIAN]])
  placas(defs, 'esc-p-pasillo', 0, 0, 16, v('pasillo'), v('pasillo-2'))
  for (const [k, s] of Object.entries(SALAS)) placas(defs, `esc-p-${k}`, s.x, s.y + 14, 16, v(k), v(`${k}-2`))

  rects(g, [[0, 0, W, H, 'url(#esc-p-pasillo)']])
  for (let x = 6; x < W; x += 24) rects(g, [[x, 145, 12, 2, v('linea')]]) // guía central del pasillo
  rects(g, [[287, 0, 2, H, v('linea')]])
  for (const [k, s] of Object.entries(SALAS)) {
    rects(g, [
      [s.x, s.y + 14, s.w, s.h - 14, `url(#esc-p-${k})`],
      [s.x, s.y, s.w, 2, v('muro-alto')], [s.x, s.y + 2, s.w, 10, v('muro')], [s.x, s.y + 12, s.w, 2, v('zocalo')],
      [s.x, s.y, 2, s.h, v('borde')], [s.x + s.w - 2, s.y, 2, s.h, v('borde')], [s.x, s.y + s.h - 2, s.w, 2, v('borde')],
    ])
    for (let x = s.x + 24; x < s.x + s.w - 4; x += 24) op(g, x, s.y + 2, 1, 10, '#000', 0.22) // juntas de los paneles del mamparo
    rects(g, [[s.x + 2, s.y + 4, s.w - 4, 3, '#53626a'], [s.x + 2, s.y + 4, s.w - 4, 1, '#7d909a'], [s.x + 2, s.y + 7, s.w - 4, 1, '#2f3b41']]) // ducto
    for (let x = s.x + 14; x < s.x + s.w - 6; x += 40) rects(g, [[x, s.y + 3, 2, 6, '#2f3b41']]) // sus abrazaderas
    const px = s.puerta - 12 // la puerta: hueco en el mamparo con jambas de peligro y franja en el umbral
    if (s.abajo) rects(g, [[px, s.y + s.h - 2, 24, 2, v(k)], [px - 2, s.y + s.h - 5, 2, 5, 'url(#esc-peligro)'], [px + 24, s.y + s.h - 5, 2, 5, 'url(#esc-peligro)'], [px - 2, s.y + s.h, 28, 3, 'url(#esc-peligro)']])
    else rects(g, [[px, s.y, 24, 14, v('pasillo')], [px - 2, s.y, 2, 14, 'url(#esc-peligro)'], [px + 24, s.y, 2, 14, 'url(#esc-peligro)'], [px - 2, s.y - 3, 28, 3, 'url(#esc-peligro)']])
  }
  // Taller: mapa táctico en el mamparo y carteles de estado; consolas en cada escritorio; equipo en las esquinas.
  rects(g, [[150, 3, 52, 9, '#0b1a20'], [150, 3, 52, 1, '#3d9cbc'], [150, 11, 52, 1, '#3d9cbc'], [153, 5, 18, 1, CIAN], [153, 7, 26, 1, '#2f8fb0'], [153, 9, 14, 1, CIAN],
    [182, 5, 16, 5, '#12333f'], [186, 6, 2, 3, CIAN], [191, 7, 4, 2, '#a7d36b'],
    [208, 4, 9, 7, '#27353c'], [210, 6, 5, 1, '#d9ab1f'], [220, 5, 9, 6, '#27353c'], [222, 7, 5, 1, CIAN], [232, 4, 9, 7, '#27353c'], [234, 6, 5, 1, '#c74a3a']])
  for (const e of ESCRITORIOS) usar(g, 'esc-escritorio', e.dx, e.dy)
  usar(g, 'esc-caja', 6, 104); usar(g, 'esc-caja', 22, 108); usar(g, 'esc-taquilla', 262, 18)
  // Tu puerta: mostrador, cajas y la plataforma de llegada con sus chevrones.
  const p = SALAS.puerta
  rects(g, [[p.x + 12, p.y + 16, 50, 6, '#56666e'], [p.x + 12, p.y + 16, 50, 1, '#8196a0'], [p.x + 12, p.y + 22, 50, 2, '#2c383e'], [p.x + 16, p.y + 18, 20, 1, CIAN],
    [p.puerta - 16, p.y + p.h - 18, 32, 12, '#1d2a30'], [p.puerta - 14, p.y + p.h - 16, 28, 8, '#2a3b43'],
    [p.puerta - 16, p.y + p.h - 18, 3, 1, '#d9ab1f'], [p.puerta + 13, p.y + p.h - 18, 3, 1, '#d9ab1f'], [p.puerta - 16, p.y + p.h - 7, 3, 1, '#d9ab1f'], [p.puerta + 13, p.y + p.h - 7, 3, 1, '#d9ab1f'],
    ...[-8, -2, 4].map((dx): Rect => [p.puerta + dx, p.y + p.h - 14, 4, 4, CIAN]), ...[-8, -2, 4].map((dx): Rect => [p.puerta + dx + 1, p.y + p.h - 14, 2, 4, '#2a3b43'])])
  usar(g, 'esc-caja', p.x + p.w - 22, p.y + 18); usar(g, 'esc-taquilla', p.x + p.w - 8, p.y + 18)
  // Bloqueados: confinamiento, con el mamparo en rojo y cajas apiladas.
  const b = SALAS.bloqueados
  rects(g, [[b.x + 2, b.y + 8, b.w - 4, 2, '#a8323f'], [b.x + 8, b.y + 6, 14, 1, '#3a1d1d']])
  usar(g, 'esc-caja', b.x + 84, b.y + 88); usar(g, 'esc-caja', b.x + 6, b.y + 90); usar(g, 'esc-caja', b.x + 10, b.y + 80)
  // Descanso: literas de acero y verde, máquina de café y mesa.
  const d = SALAS.descanso
  rects(g, [[d.x + 8, d.y + 16, 56, 14, '#5d6a52'], [d.x + 8, d.y + 16, 56, 4, '#79886a'], [d.x + 6, d.y + 18, 4, 12, '#3f4733'], [d.x + 62, d.y + 18, 4, 12, '#3f4733'],
    [d.x + 128, d.y + 15, 16, 20, '#3a4850'], [d.x + 131, d.y + 18, 10, 6, '#06161d'], [d.x + 131, d.y + 18, 10, 1, CIAN], [d.x + 133, d.y + 27, 6, 5, '#e4eef2'],
    [d.x + 104, d.y + 18, 14, 10, '#56666e'], [d.x + 104, d.y + 18, 14, 1, '#8196a0'], [d.x + 107, d.y + 16, 4, 3, '#e4eef2']])
  usar(g, 'esc-caja', d.x + d.w - 22, d.y + d.h - 18)
  // Tu oficina: taquillas, tablero de misión y tu estación con su alfombra de cubierta.
  const o = SALAS.oficina
  rects(g, [[o.x + 106, o.y + 2, 30, 12, '#2c383e'], ...[0, 1, 2, 3, 4, 5].map((k): Rect => [o.x + 108 + k * 4, o.y + 3, 3, 10, k % 2 ? '#5b6b72' : '#4a5a62']),
    [o.x + 140, o.y + 2, 18, 11, '#0b1a20'], [o.x + 140, o.y + 2, 18, 1, '#3d9cbc'], [o.x + 140, o.y + 12, 18, 1, '#3d9cbc'],
    ...Array.from({ length: 8 }, (_, k): Rect => [o.x + 142 + (k % 4) * 4, o.y + 4 + Math.floor(k / 4) * 4, 3, 2, k === 5 ? '#d9ab1f' : '#2f8fb0']),
    [MESA_YO.dx - 10, MESA_YO.dy - 18, 60, 44, '#1d2a30'], [MESA_YO.dx - 8, MESA_YO.dy - 16, 56, 40, '#2a3b43'], [MESA_YO.dx - 8, MESA_YO.dy - 16, 56, 1, '#3d9cbc'], [MESA_YO.dx - 8, MESA_YO.dy + 23, 56, 1, '#3d9cbc']])
  usar(g, 'esc-caja', o.x + 6, o.y + o.h - 18)
  return { g, animados: [radar(), ...luces()] }
}

// Radar de movimiento: pantalla redonda con anillos, un barrido que da una vuelta cada 4 s y blips que brillan al pasar.
const BLIPS = [[5, -4], [-6, 3], [-2, 8]] as const
function radar(): Animado {
  const rig = () => {
    const cian = colorDe('--esc-resalte', CIAN), r = 12, cy = -13
    const g = nodo('g', {}, undefined, 'pj')
    nodo('rect', { x: -15, y: cy - 15, width: 30, height: 30, rx: 3, fill: '#27353c' }, g)
    nodo('circle', { cx: 0, cy, r: r + 1, fill: '#06161d' }, g)
    for (const q of [r, r * 0.66, r * 0.33]) nodo('circle', { cx: 0, cy, r: q, fill: 'none', stroke: cian, 'stroke-width': 0.5, opacity: 0.5 }, g)
    nodo('path', { d: `M${-r} ${cy}h${2 * r}M0 ${cy - r}v${2 * r}`, stroke: cian, 'stroke-width': 0.4, opacity: 0.4 }, g)
    const b = nodo('g', { 'data-pivote': `0 ${cy}` }, g, 'barrido')
    nodo('path', { d: `M0 ${cy}L${r} ${cy}A${r} ${r} 0 0 0 ${r * Math.cos(-0.6)} ${cy + r * Math.sin(-0.6)}z`, fill: cian, opacity: 0.35 }, b)
    nodo('path', { d: `M0 ${cy}L${r} ${cy}`, stroke: '#d6f6ff', 'stroke-width': 0.8 }, b)
    for (const [i, [x, y]] of BLIPS.entries()) nodo('circle', { cx: x, cy: cy + y, r: 1, fill: '#a7d36b' }, g, `blip b${i}`)
    return g
  }
  const pose: PoseDef = {
    dur: 4, cuadros: 24,
    partes: {
      '.barrido': (t) => ({ r: 360 * t }),
      // cada blip se enciende cuando el barrido pasa por su ángulo (en vueltas, horario en pantalla)
      ...Object.fromEntries(BLIPS.map(([x, y], i) => {
        const ang = (Math.atan2(y, x) / (2 * Math.PI) + 1) % 1
        return [`.b${i}`, (t: number) => ({ o: 0.25 + 0.75 * Math.max(0, 1 - ((t - ang + 1) % 1) * 2.5) })]
      })),
    },
  }
  return { clave: 'radar', x: 246, y: 66, z: 0, rig, pose }
}

// Luces de guía en el pasillo: una cadena que se enciende en secuencia y se apaga despacio (ciclo de 4 s, sin parpadeo rápido).
function luces(): Animado[] {
  const xs = [34, 90, 146, 202, 258, 314, 370, 426]
  return xs.map((x, i): Animado => ({
    clave: `luz${i}`, x, y: 150, z: 0,
    rig: () => {
      const cian = colorDe('--esc-resalte', CIAN), g = nodo('g', {}, undefined, 'pj')
      nodo('rect', { x: -4, y: -1, width: 8, height: 2, rx: 1, fill: '#27353c' }, g)
      nodo('rect', { x: -3, y: -0.5, width: 6, height: 1, rx: 0.5, fill: cian }, g, 'luz')
      return g
    },
    pose: { dur: 4, cuadros: 8, partes: { '.luz': (t) => ({ o: 0.3 + 0.7 * pulso(t, 1, -i / xs.length) }) } },
  }))
}
