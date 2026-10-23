// Escenario del tema «minecraft» (contrato en comun.ts): todo en bloques de píxel de 16 px. Texturas originales hechas con
// rects (nada de arte oficial): pasto, piedra, adoquín, tablones y arena, con luz y sombra translúcidas muy suaves para que
// el piso no compita con los personajes. Mesas de crafteo como escritorios (con marco donde se enciende la pantalla),
// hornos, cofres, camas, libreros y antorchas; la llama de antorchas y hornos se anima en 2 cuadros lentos (≈2 por segundo).
import { nodo } from '../rig'
import { ESCRITORIOS, MESA_YO, SALAS, W, H, rects, usar, v, type Animado, type Escenario, type Rect, type Sala } from './comun'
import type { PoseDef } from '../animacion'

const NEGRO = (a: number) => `rgba(0,0,0,${a})`, BLANCO = (a: number) => `rgba(255,255,255,${a})`
const azar = (s: number, t: number) => Math.imul(s * 374761393 + t * 668265263 + 1, 2246822519) >>> 16 // determinista: el mismo escenario siempre

/** Baldosa que se repite (w × h) con su contenido dibujado en rects; anclada en (0, 0) de la escena. */
function baldosa(defs: Element, id: string, w: number, h: number, dibujar: (g: Element) => void) {
  dibujar(nodo('pattern', { id, x: 0, y: 0, width: w, height: h, patternUnits: 'userSpaceOnUse' }, defs))
}
/** Granos sueltos de luz y sombra sobre una base (la textura de pasto, piedra y arena). */
function granos(g: Element, w: number, h: number, semilla: number, n: number, oscuro = 0.08, claro = 0.07) {
  for (let i = 0; i < n; i++) {
    const s = azar(semilla, i)
    nodo('rect', { x: s % w, y: (s >> 5) % h, width: i % 3 === 0 ? 2 : 1, height: 1, fill: i % 2 ? NEGRO(oscuro) : BLANCO(claro) }, g)
  }
}
const grupo = (defs: Element, id: string, lista: Rect[]) => rects(nodo('g', { id }, defs), lista)

const SUELO: Record<Sala, string> = { taller: 'tablones', puerta: 'pasto2', bloqueados: 'adoquin', descanso: 'arena', oficina: 'pasto' }
// Antorchas: x de cada una en el muro de su cuarto (el palo es fijo, la llama se anima aparte).
const ANTORCHAS: [Sala, number[]][] = [['taller', [30, 90, 144, 262]], ['puerta', [336, 440]], ['bloqueados', [26, 62]], ['descanso', [130, 215]], ['oficina', [336, 360]]]

export function escenario(): Escenario {
  const g = nodo('g', { 'shape-rendering': 'crispEdges' })
  const defs = nodo('defs', {}, g)

  // ── Texturas ──
  baldosa(defs, 'mc-piedra', 16, 16, (p) => { // piedra lisa: veta suave y una junta por bloque
    rects(p, [[0, 0, 16, 16, v('pasillo')], [0, 8, 16, 8, v('pasillo-2')], [0, 15, 16, 1, NEGRO(0.1)], [15, 0, 1, 16, NEGRO(0.1)], [0, 0, 16, 1, BLANCO(0.05)]])
    granos(p, 14, 14, 3, 9)
  })
  baldosa(defs, 'mc-tablones', 16, 16, (p) => { // tablones de roble: 4 tiras con juntas alternadas
    for (let k = 0; k < 4; k++) rects(p, [[0, k * 4, 16, 4, k % 2 ? v('taller-2') : v('taller')], [0, k * 4 + 3, 16, 1, NEGRO(0.12)], [(k * 7 + 3) % 16, k * 4, 1, 3, NEGRO(0.1)], [(k * 7 + 9) % 16, k * 4 + 1, 1, 1, NEGRO(0.1)]])
    granos(p, 16, 16, 5, 6, 0.06, 0.05)
  })
  baldosa(defs, 'mc-pasto', 16, 16, (p) => { rects(p, [[0, 0, 16, 16, v('oficina')], [0, 8, 16, 8, v('oficina-2')]]); granos(p, 15, 15, 7, 14, 0.1, 0.08) })
  baldosa(defs, 'mc-pasto2', 16, 16, (p) => { rects(p, [[0, 0, 16, 16, v('puerta')], [0, 8, 16, 8, v('puerta-2')]]); granos(p, 15, 15, 11, 14, 0.1, 0.08) })
  baldosa(defs, 'mc-adoquin', 16, 16, (p) => { // adoquín oscuro: cuatro piedras irregulares
    rects(p, [[0, 0, 16, 16, v('bloqueados')], [0, 8, 16, 8, v('bloqueados-2')]])
    for (const [x, y, w, h] of [[0, 0, 7, 6], [7, 0, 9, 7], [0, 6, 5, 10], [5, 7, 11, 9]]) rects(p, [[x, y + h - 1, w, 1, NEGRO(0.16)], [x + w - 1, y, 1, h, NEGRO(0.16)], [x, y, w - 1, 1, BLANCO(0.06)]])
    granos(p, 15, 15, 13, 6, 0.06, 0.05)
  })
  baldosa(defs, 'mc-arena', 16, 16, (p) => { rects(p, [[0, 0, 16, 16, v('descanso')], [0, 8, 16, 8, v('descanso-2')]]); granos(p, 15, 15, 17, 16, 0.08, 0.1) })
  baldosa(defs, 'mc-muro', 16, 10, (p) => { // pared de madera oscura: vetas verticales
    rects(p, [[0, 0, 16, 10, v('muro')], [0, 0, 1, 10, NEGRO(0.14)], [8, 0, 1, 10, NEGRO(0.14)], [0, 0, 16, 1, BLANCO(0.07)], [4, 3, 1, 3, NEGRO(0.08)], [12, 5, 1, 3, NEGRO(0.08)]])
    granos(p, 15, 9, 19, 4, 0.08, 0.05)
  })

  // ── Objetos reutilizables (esquina superior izquierda = 0, 0) ──
  grupo(defs, 'mc-mesa', [ // mesa de crafteo con su monitor enmarcado (la pantalla se enciende en 8…22, −8…0)
    [0, 2, 30, 9, '#b8844f'], [0, 2, 30, 1, '#d6a56a'], [10, 3, 1, 7, '#8a6038'], [20, 3, 1, 7, '#8a6038'], [1, 6, 28, 1, '#8a6038'], [0, 10, 30, 1, '#96683c'],
    [0, 11, 30, 3, '#8a5a33'], [0, 11, 30, 1, '#6e4626'], [3, 12, 6, 1, '#cfd6dd'], [3, 13, 2, 1, '#5a3e24'], [13, 12, 4, 2, '#8f98a3'], [15, 13, 1, 1, '#5a3e24'], [22, 12, 5, 1, '#c94b30'], [22, 13, 5, 1, '#7a4e22'],
    [1, 14, 2, 2, '#5a3a1c'], [27, 14, 2, 2, '#5a3a1c'],
    [7, -9, 16, 11, '#5a3e24'], [7, -9, 16, 1, '#8a6a40'], [7, -9, 1, 11, '#7a5a36'], [22, -9, 1, 11, '#4a321c'], [8, -8, 14, 8, '#0f1612'], [14, 2, 2, 2, '#4a321c'],
    [9, 6, 12, 3, '#9a9a9a'], [9, 6, 12, 1, '#b8b8b8'], [9, 8, 12, 1, '#6f6f6f'], [24, 4, 3, 3, '#7a5a3a'], [24, 4, 3, 1, '#b5532e'],
  ])
  grupo(defs, 'mc-brote', [ // brote de roble
    [5, 6, 2, 8, '#6e4a26'], [4, 12, 4, 2, '#5a3a1c'], [1, 2, 10, 6, '#3f8f3a'], [3, 0, 6, 3, '#4fa845'], [1, 5, 3, 3, '#2f7030'], [8, 4, 3, 3, '#2f7030'], [4, 3, 1, 1, '#6cc25e'], [7, 1, 1, 1, '#6cc25e'],
  ])
  grupo(defs, 'mc-cofre', [ // cofre 16 × 14
    [0, 0, 16, 14, '#8a5a2b'], [0, 0, 16, 1, '#b57c3e'], [0, 5, 16, 1, '#5a3a1c'], [0, 6, 16, 7, '#a06a34'], [0, 13, 16, 1, '#5a3a1c'], [0, 0, 1, 14, '#5a3a1c'], [15, 0, 1, 14, '#5a3a1c'],
    [7, 4, 2, 4, '#3a3a3a'], [7, 5, 2, 2, '#d9a62b'], [3, 8, 3, 1, '#b57c3e'], [10, 9, 3, 1, '#8a5a2b'],
  ])
  const libros: Rect[] = [[0, 0, 30, 12, '#9a6a38'], [0, 0, 30, 2, '#b8844f'], [0, 5, 30, 2, '#b8844f'], [0, 10, 30, 2, '#8a5a2b'], [0, 0, 1, 12, '#7a5226'], [29, 0, 1, 12, '#7a5226']]
  const cols = ['#c94b30', '#336fc6', '#3aa66b', '#e0a526', '#8a4fb5', '#e8dcc0', '#7a4e22']
  for (let k = 0; k < 13; k++) libros.push([2 + k * 2, 2, 2, 3, cols[azar(23, k) % cols.length]], [2 + k * 2, 7, 2, 3, cols[azar(29, k) % cols.length]], [3 + k * 2, 2, 1, 1, BLANCO(0.25)], [3 + k * 2, 7, 1, 1, BLANCO(0.25)])
  grupo(defs, 'mc-librero', libros) // librero 30 × 12: tabla, libros, tabla, libros, tabla
  grupo(defs, 'mc-horno', [ // horno de piedra 16 × 20 con la boca oscura (el fuego va animado encima)
    [0, 0, 16, 20, '#8a8a8a'], [0, 0, 16, 2, '#b0b0b0'], [0, 2, 16, 1, '#6f6f6f'], [0, 19, 16, 1, '#5a5a5a'], [0, 0, 1, 20, '#9a9a9a'], [15, 0, 1, 20, '#6a6a6a'],
    [3, 5, 10, 2, '#4a4a4a'], [2, 8, 12, 8, '#4f4f4f'], [3, 9, 10, 6, '#161616'], [3, 8, 10, 1, '#2a2a2a'], [5, 17, 6, 1, '#5a5a5a'], [2, 3, 2, 1, '#777'], [11, 3, 3, 1, '#777'],
  ])
  grupo(defs, 'mc-cama', [ // cama: marco, manta roja, almohada
    [0, 2, 56, 14, '#6e4626'], [1, 0, 55, 12, '#d6d0c0'], [0, 2, 12, 9, '#f0eee6'], [0, 10, 12, 1, '#bfbab0'], [12, 2, 44, 10, '#b5322e'], [12, 2, 44, 2, '#d6504a'], [12, 11, 44, 1, '#8f2420'],
    [20, 4, 2, 2, '#9a2622'], [34, 6, 2, 2, '#9a2622'], [46, 3, 2, 2, '#9a2622'], [0, 12, 3, 4, '#4a2e14'], [53, 12, 3, 4, '#4a2e14'],
  ])
  grupo(defs, 'mc-tarta', [ // bloque de roble con una tarta
    [0, 4, 14, 10, '#b8844f'], [0, 4, 14, 1, '#d6a56a'], [0, 13, 14, 1, '#7a5226'], [1, 0, 12, 5, '#f4f0e6'], [1, 0, 12, 1, '#c94b5b'], [3, 2, 2, 1, '#c94b5b'], [8, 2, 2, 1, '#c94b5b'], [5, 3, 4, 1, '#d6d0c0'],
  ])
  grupo(defs, 'mc-barril', [[0, 0, 12, 10, '#8a5a2b'], [0, 0, 12, 1, '#b57c3e'], [0, 3, 12, 1, '#4a4a4a'], [0, 7, 12, 1, '#4a4a4a'], [4, 2, 4, 1, '#3a2814'], [0, 9, 12, 1, '#5a3a1c']])

  // ── Suelos y muros ──
  const tex = (x: number, y: number, w: number, h: number, id: string): Rect => [x, y, w, h, `url(#${id})`]
  rects(g, [tex(0, 0, W, H, 'mc-piedra'), [0, 145, W, 2, NEGRO(0.12)], [287, 0, 2, H, NEGRO(0.12)]])
  for (const [k, s] of Object.entries(SALAS) as [Sala, (typeof SALAS)[Sala]][]) {
    rects(g, [
      tex(s.x, s.y + 14, s.w, s.h - 14, `mc-${SUELO[k]}`),
      [s.x, s.y, s.w, 2, v('muro-alto')], tex(s.x, s.y + 2, s.w, 10, 'mc-muro'), [s.x, s.y + 12, s.w, 2, v('zocalo')], [s.x, s.y + 14, s.w, 1, NEGRO(0.16)],
      [s.x, s.y, 2, s.h, '#3a3a3a'], [s.x + s.w - 2, s.y, 2, s.h, '#3a3a3a'], [s.x, s.y + s.h - 2, s.w, 2, '#3a3a3a'], [s.x, s.y, 1, s.h, '#585858'],
    ])
    const px = s.puerta - 12 // la puerta: hueco hacia el pasillo con dos jambas de tronco
    if (s.abajo) rects(g, [tex(px, s.y + s.h - 2, 24, 2, 'mc-piedra'), [px - 2, s.y + s.h - 5, 2, 5, '#5a3e24'], [px + 24, s.y + s.h - 5, 2, 5, '#5a3e24']])
    else rects(g, [tex(px, s.y, 24, 14, 'mc-piedra'), [px - 2, s.y, 2, 14, '#5a3e24'], [px + 24, s.y, 2, 14, '#5a3e24']])
  }

  // ── Taller: cartel de roble, cuadros, mesas de crafteo, horno y cofres ──
  rects(g, [[149, 2, 54, 11, '#5a3e24'], [150, 3, 52, 9, '#e8dcc0'], [150, 3, 52, 1, '#bfae88'], [153, 5, 18, 1, '#3a7bd5'], [153, 7, 26, 1, '#d5573a'], [153, 9, 14, 1, '#3aa66b']])
  ;([['#8fc4ee', '#5b8731', '#ffe066'], ['#e8a86a', '#7a6a3a', '#f4f0e6'], ['#a98fd6', '#3a6a4a', '#ffffff']] as const).forEach(([cielo, tierra, sol], i) => {
    const x = 208 + i * 12
    rects(g, [[x, 3, 10, 9, '#6b4a2b'], [x + 1, 4, 8, 4, cielo], [x + 1, 8, 8, 3, tierra], [x + 6, 5, 2, 2, sol], [x + 1, 7, 3, 1, tierra]])
  })
  for (const e of ESCRITORIOS) usar(g, 'mc-mesa', e.dx, e.dy)
  usar(g, 'mc-horno', 230, 20); usar(g, 'mc-cofre', 6, 102); usar(g, 'mc-cofre', 24, 106); usar(g, 'mc-brote', 4, 84)

  // ── Tu puerta: mostrador de roble, alfombra roja y un cofre ──
  const p = SALAS.puerta
  rects(g, [[p.x + 12, p.y + 16, 50, 6, '#a06a34'], [p.x + 12, p.y + 16, 50, 1, '#c48a4e'], [p.x + 12, p.y + 22, 50, 3, '#6e4626'], [p.x + 14, p.y + 25, 3, 3, '#4a2e14'], [p.x + 57, p.y + 25, 3, 3, '#4a2e14'],
    [p.puerta - 16, p.y + p.h - 18, 32, 12, '#8f2420'], [p.puerta - 15, p.y + p.h - 17, 30, 10, '#b5322e'], [p.puerta - 15, p.y + p.h - 17, 30, 1, '#d6504a']])
  usar(g, 'mc-cofre', p.x + p.w - 22, p.y + 16); usar(g, 'mc-brote', p.x + p.w - 36, p.y + 50)

  // ── Bloqueados: cofres, barril y barrotes de hierro ──
  const b = SALAS.bloqueados
  usar(g, 'mc-cofre', b.x + 82, b.y + 84); usar(g, 'mc-cofre', b.x + 8, b.y + 86); usar(g, 'mc-barril', b.x + 40, b.y + 88)
  for (let k = 0; k < 5; k++) rects(g, [[b.x + 8 + k * 6, b.y + 18, 2, 12, '#8e9298'], [b.x + 8 + k * 6, b.y + 18, 1, 12, '#c4c8cc']])
  rects(g, [[b.x + 6, b.y + 17, 32, 2, '#6a6e74'], [b.x + 6, b.y + 29, 32, 2, '#6a6e74']])

  // ── Descanso: cama, mesa con tarta y un horno ──
  const d = SALAS.descanso
  usar(g, 'mc-cama', d.x + 8, d.y + 16); usar(g, 'mc-tarta', d.x + 104, d.y + 18); usar(g, 'mc-horno', d.x + 128, d.y + 15); usar(g, 'mc-brote', d.x + d.w - 18, d.y + d.h - 22)

  // ── Tu oficina: piso de roble oscuro bajo tu mesa, librero, cofre y brote ──
  const o = SALAS.oficina, mx = MESA_YO.dx - 10, my = MESA_YO.dy - 18
  rects(g, [[mx, my, 60, 44, '#4a321c'], [mx + 1, my + 1, 58, 42, '#6b4d32']])
  for (let k = 0; k < 10; k++) rects(g, [[mx + 1, my + 1 + k * 4 + 3, 58, 1, NEGRO(0.14)], [mx + 1 + ((k * 13 + 7) % 50), my + 1 + k * 4, 1, 3, NEGRO(0.12)]])
  usar(g, 'mc-librero', o.x + 106, o.y + 2); usar(g, 'mc-cofre', o.x + 142, o.y + 16); usar(g, 'mc-brote', o.x + 6, o.y + o.h - 22)

  // ── Antorchas en los muros y llamas de los hornos ──
  const animados: Animado[] = []
  for (const [sala, xs] of ANTORCHAS) for (const x of xs) {
    const y = SALAS[sala].y
    rects(g, [[x - 1, y + 7, 2, 5, '#7a5230'], [x - 1, y + 7, 2, 1, '#2b2b2b'], [x - 3, y + 11, 6, 1, NEGRO(0.18)]])
    animados.push({ clave: 'mc-antorcha', x, y: y + 7, z: 0, rig: antorcha, pose: LLAMA })
  }
  for (const [x, y] of [[238, 34], [d.x + 136, d.y + 29]] as const) animados.push({ clave: 'mc-fuego', x, y, z: 0, rig: fuego, pose: LLAMA })
  return { g, animados }
}

// ── Llamas: dos cuadros alternados (la llama «respira» unas 2 veces por segundo) ──
const LLAMA: PoseDef = { dur: 0.9, cuadros: 2, pesos: [5, 4], partes: { '.fa': (t) => ({ o: t < 0.5 ? 1 : 0 }), '.fb': (t) => ({ o: t < 0.5 ? 0 : 1 }) } }
function llama(cuadros: Rect[][], aura: [number, number, number, number]) {
  const g = nodo('g', { 'shape-rendering': 'crispEdges' }, undefined, 'pj')
  cuadros.forEach((f, i) => { const c = nodo('g', {}, g, i ? 'fb' : 'fa'); nodo('rect', { x: aura[0], y: aura[1], width: aura[2], height: aura[3], fill: 'rgba(255,170,60,.16)' }, c); rects(c, f) })
  return g
}
const antorcha = () => llama([
  [[-1, -1, 3, 1, '#e8590c'], [-1, -2, 3, 1, '#ff8a1e'], [-1, -3, 2, 1, '#ffb938'], [0, -4, 1, 1, '#ffe27a']],
  [[-1, -1, 3, 1, '#e8590c'], [-1, -2, 3, 1, '#ff8a1e'], [0, -3, 2, 1, '#ffb938'], [1, -4, 1, 1, '#ffe27a']],
], [-4, -6, 8, 8])
const fuego = () => llama([
  [[-4, -1, 8, 1, '#e8590c'], [-3, -2, 2, 1, '#ff8a1e'], [0, -2, 3, 1, '#ff8a1e'], [-2, -3, 1, 1, '#ffd34a'], [1, -3, 1, 1, '#ffd34a']],
  [[-4, -1, 8, 1, '#e8590c'], [-3, -2, 3, 1, '#ff8a1e'], [1, -2, 2, 1, '#ff8a1e'], [-1, -3, 1, 1, '#ffd34a'], [2, -3, 1, 1, '#ffd34a']],
], [-5, -5, 10, 6])
