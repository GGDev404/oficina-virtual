// Escenario de la oficina en SVG: la geometría de los cuartos y el dibujo de fondo, pantallas y tu mesa.
// Pisos, muros y puertas se pintan con los tokens --esc-* (var() en el relleno): al cambiar de tema el navegador los
// recolorea solo, sin reconstruir nada. Los muebles llevan su color propio. Nodos con createElementNS, nunca innerHTML.
// Esta fase dibuja la misma oficina para todos los temas; una fase de escenarios distintos ramificará aquí por tema.
import { nodo } from './personajes'

export type Sala = 'taller' | 'puerta' | 'bloqueados' | 'descanso' | 'oficina'
export const W = 480, H = 272
// Cada cuarto tiene una sola puerta hacia el pasillo horizontal (y 128–160): por ahí caminan los agentes.
export const SALAS: Record<Sala, { titulo: string; x: number; y: number; w: number; h: number; puerta: number; abajo: boolean }> = {
  taller: { titulo: 'Taller', x: 0, y: 0, w: 272, h: 128, puerta: 248, abajo: true },
  puerta: { titulo: 'Tu puerta', x: 304, y: 0, w: 176, h: 128, puerta: 392, abajo: true },
  bloqueados: { titulo: 'Bloqueados', x: 0, y: 160, w: 112, h: 112, puerta: 82, abajo: false },
  descanso: { titulo: 'Descanso', x: 112, y: 160, w: 160, h: 112, puerta: 196, abajo: false },
  oficina: { titulo: 'Tu oficina', x: 304, y: 160, w: 176, h: 112, puerta: 392, abajo: false },
}
export const ESCRITORIOS = [26, 72].flatMap((dy) => [14, 72, 130, 188].map((dx) => ({ dx, dy })))
export const MESA_YO = { dx: SALAS.oficina.x + 104, dy: SALAS.oficina.y + 50 }

type Rect = [number, number, number, number, string]
const v = (n: string) => `var(--esc-${n})`
const rects = (g: Element, lista: Rect[]) => { for (const [x, y, width, height, fill] of lista) nodo('rect', { x, y, width, height, fill }, g) }
const usar = (g: Element, id: string, x: number, y: number) => nodo('use', { href: `#${id}`, x, y }, g)

// Damero de dos colores que se repite: baldosas de `t` px.
function damero(defs: Element, id: string, x: number, y: number, t: number, a: string, b: string) {
  const p = nodo('pattern', { id, x, y, width: t * 2, height: t * 2, patternUnits: 'userSpaceOnUse' }, defs)
  rects(p, [[0, 0, t, t, a], [t, t, t, t, a], [t, 0, t, t, b], [0, t, t, t, b]])
}

/** Fondo estático (pisos, muros, puertas y muebles) y, encima, la pantalla de cada escritorio. */
export function escenario(): SVGGElement {
  const g = nodo('g', { 'shape-rendering': 'crispEdges' })
  const defs = nodo('defs', {}, g)
  rects(nodo('g', { id: 'esc-escritorio' }, defs), [
    [0, 2, 30, 9, '#c88d55'], [0, 2, 30, 1, '#dba06a'], [0, 11, 30, 3, '#8a5a33'], [1, 14, 2, 2, '#6e4626'], [27, 14, 2, 2, '#6e4626'],
    [7, -9, 16, 11, '#2b2b33'], [14, 2, 2, 2, '#2b2b33'], [8, -8, 14, 8, '#11131a'],
    [9, 6, 12, 3, '#d9d6cf'], [9, 8, 12, 1, '#b7b3aa'], [24, 4, 3, 3, '#f4f1ea'], [24, 4, 3, 1, '#6b3e1f'],
  ])
  rects(nodo('g', { id: 'esc-planta' }, defs), [
    [2, 8, 8, 6, '#a0522d'], [2, 8, 8, 1, '#c0703f'], [3, 1, 6, 7, '#3f9b4f'], [1, 3, 3, 4, '#2f7a3c'], [8, 3, 3, 4, '#2f7a3c'], [5, 0, 2, 2, '#58b866'],
  ])
  damero(defs, 'esc-p-pasillo', 0, 0, 16, v('pasillo'), v('pasillo-2'))
  for (const [k, s] of Object.entries(SALAS)) damero(defs, `esc-p-${k}`, s.x, s.y + 14, 8, v(k), v(`${k}-2`))

  rects(g, [[0, 0, W, H, 'url(#esc-p-pasillo)'], [0, 145, W, 2, v('linea')], [287, 0, 2, H, v('linea')]])
  for (const [k, s] of Object.entries(SALAS)) {
    rects(g, [
      [s.x, s.y + 14, s.w, s.h - 14, `url(#esc-p-${k})`],
      [s.x, s.y, s.w, 2, v('muro-alto')], [s.x, s.y + 2, s.w, 10, v('muro')], [s.x, s.y + 12, s.w, 2, v('zocalo')],
      [s.x, s.y, 2, s.h, v('borde')], [s.x + s.w - 2, s.y, 2, s.h, v('borde')], [s.x, s.y + s.h - 2, s.w, 2, v('borde')],
    ])
    const px = s.puerta - 12 // la puerta: un hueco en el muro con sus dos jambas
    if (s.abajo) rects(g, [[px, s.y + s.h - 2, 24, 2, v(k)], [px - 2, s.y + s.h - 5, 2, 5, v('marco')], [px + 24, s.y + s.h - 5, 2, 5, v('marco')]])
    else rects(g, [[px, s.y, 24, 14, v('pasillo')], [px - 2, s.y, 2, 14, v('marco')], [px + 24, s.y, 2, 14, v('marco')]])
  }
  // Pizarrón y cuadros del taller.
  rects(g, [[150, 3, 52, 9, '#f2f2ee'], [150, 3, 52, 1, '#9a9a96'], [153, 5, 18, 1, '#3a7bd5'], [153, 7, 26, 1, '#d5573a'], [153, 9, 14, 1, '#3aa66b'],
    [208, 4, 9, 7, '#e9d9a6'], [220, 5, 9, 6, '#a6d9e9'], [232, 4, 9, 7, '#f0b7ca']])
  for (const e of ESCRITORIOS) usar(g, 'esc-escritorio', e.dx, e.dy)
  usar(g, 'esc-planta', 4, 104); usar(g, 'esc-planta', 224, 18)
  const p = SALAS.puerta
  rects(g, [[p.x + 12, p.y + 16, 50, 6, '#8a5a33'], [p.x + 12, p.y + 22, 50, 2, '#6e4626'],
    [p.puerta - 16, p.y + p.h - 18, 32, 12, '#a8323f'], [p.puerta - 14, p.y + p.h - 16, 28, 8, '#c64656']])
  usar(g, 'esc-planta', p.x + p.w - 18, p.y + 16)
  const b = SALAS.bloqueados
  rects(g, [[b.x + 84, b.y + 86, 16, 14, '#8a6a42'], [b.x + 84, b.y + 86, 16, 2, '#a9845a'], [b.x + 6, b.y + 90, 12, 10, '#8a6a42'], [b.x + 6, b.y + 90, 12, 2, '#a9845a']])
  const d = SALAS.descanso
  rects(g, [[d.x + 8, d.y + 16, 56, 14, '#b5523b'], [d.x + 8, d.y + 16, 56, 4, '#cf6a50'], [d.x + 6, d.y + 18, 4, 12, '#8f3f2d'], [d.x + 62, d.y + 18, 4, 12, '#8f3f2d'],
    [d.x + 128, d.y + 15, 16, 20, '#4a4a52'], [d.x + 131, d.y + 18, 10, 6, '#22222a'], [d.x + 133, d.y + 27, 6, 5, '#f4f1ea'],
    [d.x + 104, d.y + 18, 14, 10, '#8a5a33'], [d.x + 107, d.y + 16, 4, 3, '#f4f1ea']])
  usar(g, 'esc-planta', d.x + d.w - 18, d.y + d.h - 22)
  const o = SALAS.oficina
  rects(g, [[o.x + 106, o.y + 2, 30, 12, '#6e4626'], ...['#d5573a', '#3a7bd5', '#e0a526', '#3aa66b', '#9b59b6', '#f4f1ea'].map((c, k): Rect => [o.x + 108 + k * 4, o.y + 4, 3, 8, c]),
    [o.x + 140, o.y + 2, 18, 11, '#f4f1ea'], [o.x + 140, o.y + 2, 18, 3, '#d5573a'],
    ...Array.from({ length: 8 }, (_, k): Rect => [o.x + 142 + (k % 4) * 4, o.y + 6 + Math.floor(k / 4) * 3, 2, 2, '#9a9a96']),
    [MESA_YO.dx - 10, MESA_YO.dy - 18, 60, 44, '#3e6b4b'], [MESA_YO.dx - 8, MESA_YO.dy - 16, 56, 40, '#457656']])
  usar(g, 'esc-planta', o.x + 6, o.y + o.h - 22)

  // Pantalla de cada escritorio (el mismo orden que ESCRITORIOS). Apagada por defecto; la clase `teclea` muestra el código
  // que corre y `espera` la barra de progreso (oficina.css las anima).
  const pantallas = nodo('g', {}, g, 'pantallas')
  for (const e of ESCRITORIOS) {
    const s = nodo('g', { transform: `translate(${e.dx} ${e.dy})` }, pantallas, 'pantalla')
    rects(s, [[8, -8, 14, 8, v('monitor')]])
    const lineas = nodo('g', {}, s, 'lineas')
    for (let k = 0; k < 4; k++) nodo('rect', { x: 9 + (k % 2) * 2, y: -7 + k * 2, width: 11, height: 1, fill: v(k % 2 ? 'codigo-2' : 'codigo'), style: `animation-duration:${1.1 + k * 0.35}s;animation-delay:${-(e.dx + k) % 7 * 0.2}s` }, lineas)
    const progreso = nodo('g', {}, s, 'progreso')
    rects(progreso, [[10, -5, 10, 2, '#1d3a5c']])
    nodo('rect', { x: 10, y: -5, width: 10, height: 2, fill: v('resalte') }, progreso, 'barra')
  }
  return g
}

/** Tu escritorio, dibujado sobre tu avatar (que queda detrás, de pie). `.pila` guarda las 6 hojas de la bandeja. */
export function mesaYo(): SVGGElement {
  const m = MESA_YO
  const g = nodo('g', { 'shape-rendering': 'crispEdges' })
  rects(g, [[m.dx, m.dy, 40, 10, '#c88d55'], [m.dx, m.dy, 40, 1, '#dba06a'], [m.dx, m.dy + 10, 40, 6, '#8a5a33'],
    [m.dx + 25, m.dy - 9, 12, 10, '#2b2b33'], [m.dx + 30, m.dy + 1, 2, 2, '#2b2b33'], [m.dx + 2, m.dy + 2, 9, 6, '#6e4626']])
  const pila = nodo('g', {}, g, 'pila')
  for (let k = 0; k < 6; k++) nodo('rect', { x: m.dx + 3, y: m.dy + 5 - k, width: 7, height: 1, fill: k % 2 ? '#e8e4da' : '#ffffff' }, pila)
  return g
}
