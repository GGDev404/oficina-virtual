// Reparto del tema «doom»: homenajes originales (siluetas propias, sin arte ni logos oficiales) a DOOM 2016 / Eternal.
// Todos salen de un mismo esqueleto (armar): cada personaje aporta cabeza, torso, piernas y brazos. Los detalles firma
// (visor de brasa, latón, runas) son fijos; la armadura/tela se tiñe con los colores guardados. Brillos = trazo duplicado
// de baja opacidad (nada de filter). Ver el contrato en rig.ts.
import { onda } from '../animacion'
import { color, nodo, PROPS, type KitVector, type Pieza, type Reparto } from '../rig'
import { aclarar, oscurecer } from '../sprites'

const ASCUA = '#ff5a1f', LATON = '#c9a24a', OXIDO = '#8a4a2a', NEGRO = '#1d1512', HUESO = '#f2e6c0'
type E = Element
type Lado = 'i' | 'd'

const hash = (t: string) => { let h = 2166136261; for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
const rect = (p: E, x: number, y: number, w: number, h: number, fill: string, rx = 0, o = 1) =>
  nodo('rect', { x, y, width: w, height: h, rx, fill, opacity: o }, p)
const trazo = (p: E, d: string, stroke: string, w: number, o = 1, clase?: string) =>
  nodo('path', { d, fill: 'none', stroke, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: o }, p, clase)
/** Brillo estático: el mismo trazo ancho y tenue debajo, fino y vivo encima. */
const brasa = (p: E, d: string, c: string, w = 0.9) => { trazo(p, d, c, w * 2.8, 0.28); trazo(p, d, c, w) }
const punto = (p: E, cx: number, cy: number, r: number, c: string) => { nodo('circle', { cx, cy, r: r * 2.2, fill: c, opacity: 0.28 }, p); nodo('circle', { cx, cy, r, fill: c }, p) }

interface Cfg {
  top?: number; cad?: number; tw?: number; aw?: number; largo?: number // torso arriba, cadera, medio ancho, brazo
  silla?: string
  atras?: (c: E) => void // detrás del cuerpo (capa, alas, mochila de perfil)
  pierna: (g: E, x: number, lado: Lado, cad: number) => void
  brazo: (b: E, ab: E, x: number, lado: Lado, aw: number, top: number, largo: number) => void // b = hombro, ab = antebrazo (codo + mano)
  mano?: [number, number] // centro de la mano derecha si no es la de siempre (taza)
  cabY?: number // pivote de la cabeza (cuello)
  prop?: number; propExtra?: (g: E) => void // escala del rasgo del rol y un detalle sobre él
  torso: (c: E, e: boolean) => void
  cabeza: (c: E, e: boolean) => void
}

const pierna = (tela: string, placa: string, bota: string): Cfg['pierna'] => (g, x, _l, cad) => {
  rect(g, x, cad - 1, 3.2, -0.6 - cad, tela, 1.2)
  rect(g, x - 0.3, cad - 1, 3.8, (-0.6 - cad) * 0.45, placa, 1)
  const ky = cad + (-1.6 - cad) * 0.55 - 1.1
  rect(g, x - 0.2, ky, 3.6, 2.2, placa, 0.8)
  nodo('ellipse', { cx: x + 1.6, cy: -1.4, rx: 2.3, ry: 1.3, fill: bota }, g)
  nodo('ellipse', { cx: x + 1.2, cy: -1.9, rx: 0.9, ry: 0.3, fill: '#fff', opacity: 0.15 }, g)
}
/** Brazo con hombrera (pad: alto de la hombrera por lado; 0 = sin ella). */
const brazo = (manga: string, luz: string, guante: string, pad: (l: Lado) => number, hombrera = manga): Cfg['brazo'] => (b, ab, x, lado, aw, top, largo) => {
  const cx = x + aw / 2, fin = top + 1 + largo, codo = top + 1 + largo * 0.5, m = largo * 0.5 + 0.8
  const raya = x + (lado === 'i' ? 0.3 : aw - 1.2)
  rect(b, x, top + 1, aw, m, manga, aw / 2)
  rect(b, raya, top + 1.8, 0.9, m - 1.4, luz, 0.45, 0.55)
  rect(ab, x, codo - 1, aw, m, manga, aw / 2)
  rect(ab, raya, codo - 0.4, 0.9, m - 1.4, luz, 0.45, 0.55)
  nodo('circle', { cx, cy: fin + 0.4, r: aw / 2 + 0.2, fill: guante }, ab)
  const p = pad(lado)
  if (p) { nodo('ellipse', { cx, cy: top + 1.8, rx: aw / 2 + 1.1, ry: p, fill: hombrera }, b); nodo('ellipse', { cx: cx - 0.5, cy: top + 1.2, rx: aw * 0.3, ry: p * 0.35, fill: luz, opacity: 0.5 }, b) }
  b.setAttribute('data-pivote', `${cx} ${top + 1.5}`)
  ab.setAttribute('data-pivote', `${cx} ${codo}`)
}

function armar({ aspecto: a, vista }: Pieza, c: Cfg) {
  const e = vista === 'espalda', top = c.top ?? -16, cad = c.cad ?? -7, tw = c.tw ?? 5.2, aw = c.aw ?? 2.6, largo = c.largo ?? 8
  const raiz = nodo('g', {}, undefined, 'pj')
  nodo('ellipse', { cx: 0, cy: -0.4, rx: 7, ry: 1.6, fill: '#000', opacity: 0.3 }, raiz, 'sombra')
  const f = nodo('g', e ? { transform: 'translate(0 3.5)' } : {}, raiz, 'asiento')
  if (e) {
    rect(f, -7.5, -17, 15, 15, c.silla ?? '#3a2a24', 3).setAttribute('class', 'silla')
    rect(f, -6.5, -16.2, 13, 1.4, '#5a4034', 0.7)
    nodo('circle', { cx: 0, cy: -9, r: 0.9, fill: LATON }, f)
  } else for (const l of ['i', 'd'] as const) {
    const g = nodo('g', {}, f, `pierna ${l}`)
    c.pierna(g, l === 'i' ? -3.8 : 0.6, l, cad)
  }
  const cuerpo = nodo('g', { 'data-pivote': `0 ${cad + 1}` }, f, 'cuerpo')
  c.atras?.(cuerpo)
  const xi = -(tw + aw) + 0.3, xd = tw - 0.3
  const mk = (l: Lado) => {
    const b = nodo('g', {}, cuerpo, `brazo ${l}`), ab = nodo('g', {}, b, `antebrazo ${l}`)
    c.brazo(b, ab, l === 'i' ? xi : xd, l, aw, top, largo)
    return ab
  }
  const izq = mk('i')
  c.torso(cuerpo, e)
  c.cabeza(nodo('g', { 'data-pivote': `0 ${c.cabY ?? top + 1.5}` }, cuerpo, 'cabeza'), e)
  const abd = mk('d') // el derecho va al final: sobre la cabeza al saludar y sobre la cara al beber
  if (a.rol) {
    const s = c.prop ?? 1
    const g = PROPS[a.rol] && (e ? nodo('g', { transform: `translate(${-tw - 3.6 - s * 0.6} -4) scale(${s})` }, f, 'prop') : nodo('g', { transform: `translate(${xi + aw / 2} ${top + largo + 1.6}) scale(${s})` }, izq, 'prop'))
    if (g) { PROPS[a.rol](g); c.propExtra?.(g) }
  }
  // Extras de pose: folio de óxido y latón, taza de metal en la mano derecha, zZ y puntos cálidos.
  const extra = nodo('g', {}, f, 'extra')
  const carpeta = nodo('g', {}, extra, 'carpeta')
  rect(carpeta, -4.2, -13, 8.4, 6.6, '#7a3f22', 0.9)
  trazo(carpeta, 'M-4.2-12.2h3l.8-1.2h4.4', LATON, 0.9)
  trazo(carpeta, 'M-2.4-9.6h4.8M-2.4-8h3', HUESO, 0.6)
  const [hx, hy] = c.mano ?? [xd + aw / 2, top + 1 + largo + 0.4], ox = hx - 6.65, oy = hy + 6.4 // la taza de referencia tiene la mano en (6.65, -6.4)
  const taza = nodo('g', { 'data-pivote': `${hx} ${hy}` }, abd, 'taza')
  rect(taza, 5.05 + ox, -10.8 + oy, 3.2, 3.8, '#aab2bb', 0.8)
  trazo(taza, `M${8.25 + ox} ${-10 + oy}h.7c.8 0 .8 1.8 0 1.8h-.7`, '#aab2bb', 0.7)
  rect(taza, 5.05 + ox, -10.8 + oy, 3.2, 0.9, '#4a2a16')
  for (const [i, x] of [5.95, 7.35].entries()) trazo(taza, `M${x + ox} ${-12 + oy}q-.9-1 0-2 .9-1 0-2`, '#fff', 0.6, 0.8, `vapor v${i}`)
  for (const [i, [x, y]] of ([[4, -25], [6.8, -27.6], [9.4, -30]] as const).entries()) trazo(extra, `M${x} ${y}h2.6l-2.6 2.8h2.6`, '#d9a07a', 0.8, 1, `zz z${i}`)
  for (const i of [0, 1, 2]) nodo('circle', { cx: 6 + i * 2.4, cy: -26, r: 0.8, fill: '#d9a07a' }, extra, `punto p${i}`)
  return raiz
}

/** Visor de brasa (.ojos) y su versión apagada (.ojo-cerrado) sobre una línea de ojos. */
const visor = (cab: E, d: string, c: string, w = 0.9) => {
  brasa(nodo('g', {}, cab, 'ojos'), d, c, w)
  trazo(cab, d, c, w * 0.6, 0.35, 'ojo-cerrado')
}
/** Lágrima (pose triste); solo en caras descubiertas. */
const lagrima = (cab: E, x: number, y: number) => nodo('path', { d: `M${x} ${y}q-.9 1.3 0 1.9.9-.6 0-1.9z`, fill: '#7fc4ff' }, cab, 'lagrima')
/** Cuello oscuro bajo el casco. */
const cuello = (cab: E, fill: string, y = -17, w = 3.6) => rect(cab, -w / 2, y, w, 3, fill)

// ── Doom Slayer ─────────────────────────────────────────────────────────────────────────────────
const slayer: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, camisa = '#3f6b2a', pant = color(a.pantalon, '#4a3a2a'), brillo = color(a.brillo, '#9aa3ad')
    const luz = aclarar(camisa, 0.22), sombra = oscurecer(camisa, 0.65), casco = oscurecer(camisa, 0.92)
    return armar(p, {
      tw: 5.7, aw: 2.8,
      pierna: pierna(pant, camisa, '#2a221d'),
      brazo: (b, ab, x, l, aw, top, largo) => {
        brazo(camisa, luz, '#2a2724', () => 2.5, luz)(b, ab, x, l, aw, top, largo)
        if (l === 'i') { rect(ab, x - 0.1, top + largo - 2.6, aw + 0.2, 2.2, '#3a3f45', 0.6); nodo('circle', { cx: x + aw / 2, cy: top + largo - 1.5, r: 0.5, fill: brillo }, ab) } // computador de muñeca
      },
      torso: (c, e) => {
        rect(c, -5.7, -16, 11.4, 10, camisa, 2.4)
        rect(c, -5.7, -8, 11.4, 2, sombra, 1)
        rect(c, -5.7, -8.7, 11.4, 1.1, NEGRO)
        rect(c, -0.9, -8.9, 1.8, 1.4, LATON, 0.3)
        if (e) { rect(c, -3.4, -15.4, 6.8, 6.4, luz, 1.6, 0.45); trazo(c, 'M0-15.4v6.4', sombra, 0.7) } else {
          nodo('path', { d: 'M-4-15.6h8l-.8 6.2h-6.4z', fill: luz, opacity: 0.55 }, c)
          trazo(c, 'M-2.2-14.4h4.4', sombra, 0.7); trazo(c, 'M-2.6-12.6h5.2', sombra, 0.7)
          brasa(c, 'M-1.4-11l1.4 1.2 1.4-1.2', ASCUA, 0.5)
        }
      },
      cabeza: (c, e) => {
        cuello(c, NEGRO)
        nodo('circle', { cx: 0, cy: -20.4, r: 5.5, fill: casco }, c)
        trazo(c, 'M-4-23.8q4-2.6 8 0', aclarar(casco, 0.4), 0.8)
        for (const x of [-6.2, 4.6]) rect(c, x, -21.8, 1.6, 4.2, sombra, 0.8)
        if (e) { rect(c, -0.8, -25.4, 1.6, 8.4, sombra, 0.6); trazo(c, 'M-3.4-18.4h6.8', sombra, 0.6) } else {
          nodo('path', { d: 'M-4.2-22.2h8.4l-.7 3.8q-3.5 1.5-7 0z', fill: '#0e0908' }, c)
          visor(c, 'M-3.1-20.6h6.2', ASCUA, 1)
          nodo('path', { d: 'M-4.4-17.8q4.4 2.4 8.8 0l-.9 1.8h-7z', fill: sombra }, c)
          trazo(c, 'M-2.4-17h4.8', brillo, 0.5, 0.8)
        }
      },
    })
  },
}

// ── Samuel Hayden: cuerpo robótico alto ────────────────────────────────────────────────────────
const hayden: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, camisa = '#8a4a2a', pant = color(a.pantalon, '#2f3640')
    const metal = '#8d9bab', oscuro = '#566372', claro = aclarar(metal, 0.35)
    return armar(p, {
      top: -21, cad: -10, tw: 4.6, aw: 2.2, largo: 10,
      pierna: pierna(pant, metal, '#2a2f36'),
      brazo: brazo(metal, claro, oscuro, () => 2.2, metal),
      torso: (c, e) => {
        rect(c, -4.6, -21, 9.2, 11.4, metal, 2)
        rect(c, -4.6, -11, 9.2, 1.6, oscuro, 0.6)
        if (e) { rect(c, -0.8, -21, 1.6, 10, oscuro, 0.5); for (const y of [-19, -16.4, -13.8]) trazo(c, `M-3.6 ${y}h2.2M1.4 ${y}h2.2`, oscuro, 0.7); rect(c, -4.6, -20.6, 9.2, 1.2, camisa, 0.5) } else {
          rect(c, -3, -20.2, 6, 3, camisa, 1)
          nodo('circle', { cx: 0, cy: -14, r: 2.3, fill: NEGRO, stroke: LATON, 'stroke-width': 0.7 }, c)
          punto(c, 0, -14, 0.9, ASCUA)
          trazo(c, 'M-3-11.8h6M-3-10.6h6', oscuro, 0.5)
        }
      },
      cabeza: (c, e) => {
        rect(c, -1, -22.4, 2, 3.4, oscuro)
        rect(c, -4, -29.4, 8, 8.8, metal, 3)
        trazo(c, 'M-2.6-28.6h5.2', claro, 0.7, 0.8)
        for (const x of [-4.6, 3.8]) rect(c, x, -26.2, 0.8, 3.4, LATON, 0.4)
        if (e) { for (const y of [-27, -25.2, -23.4]) trazo(c, `M-2.4 ${y}h4.8`, oscuro, 0.6) } else {
          rect(c, -3.2, -27.2, 6.4, 2.4, NEGRO, 1.1)
          visor(c, 'M-2.4-26h4.8', ASCUA, 0.9)
          trazo(c, 'M-2-23.2h4', oscuro, 0.6, 1, 'boca-s'); trazo(c, 'M-2-22.6q2-1.1 4 0', oscuro, 0.6, 1, 'boca-t')
        }
      },
    })
  },
}

// ── VEGA: núcleo holográfico flotante ─────────────────────────────────────────────────────────
const vega: KitVector = {
  poses: {
    parado: { vaiven: 'flota' },
    camina: { vaiven: 'flota', partes: { '.pierna.i': () => ({}), '.pierna.d': () => ({}), '.brazo.i': (t) => ({ r: 9 * onda(t, 1, 0.25) }), '.brazo.d': (t) => ({ r: -9 * onda(t, 1, 0.25) }), '.cabeza': (t) => ({ r: 3 * onda(t, 1, 0.25) }) } },
  },
  dibujar: (p) => {
    const a = p.aspecto, camisa = color(a.camisa, '#2a4a7a'), aro = aclarar(camisa, 0.4), azul = '#4fb8ff', hielo = '#d6f1ff'
    return armar(p, {
      top: -15, cad: -7, tw: 3.4, aw: 2, largo: 5,
      pierna: (g, x) => { // toberas de levitación, no piernas
        rect(g, x + 0.4, -6, 2.2, 3, oscurecer(camisa, 0.7), 0.8)
        nodo('ellipse', { cx: x + 1.5, cy: -2.6, rx: 1.7, ry: 0.8, fill: azul, opacity: 0.45 }, g)
        nodo('ellipse', { cx: x + 1.5, cy: -2.6, rx: 0.9, ry: 0.4, fill: hielo }, g)
      },
      mano: [5.5, -9], cabY: -15.5,
      brazo: (b, ab, x, l, aw, top, largo) => { // módulos flotantes unidos por un haz articulado (codo en medio)
        const sx = x + aw / 2, cx = sx + (l === 'i' ? -1.4 : 1.4), cy = top + largo + 1, ex = (sx + cx) / 2, ey = (top + 1 + cy) / 2
        trazo(b, `M${sx} ${top + 1}L${ex} ${ey}`, azul, 0.6, 0.6)
        trazo(ab, `M${ex} ${ey}L${cx} ${cy}`, azul, 0.6, 0.6)
        nodo('path', { d: `M${cx - 2.2} ${cy}l1.1-1.9h2.2l1.1 1.9-1.1 1.9h-2.2z`, fill: camisa, stroke: aro, 'stroke-width': 0.5 }, ab)
        nodo('circle', { cx, cy, r: 0.7, fill: azul }, ab)
        b.setAttribute('data-pivote', `${sx} ${top + 1}`)
        ab.setAttribute('data-pivote', `${ex} ${ey}`)
      },
      torso: (c) => {
        nodo('path', { d: 'M-3.4-15.4h6.8l-1.4 8h-4z', fill: oscurecer(camisa, 0.8) }, c)
        trazo(c, 'M-1.6-13.6l-.5 5M1.6-13.6l.5 5', azul, 0.5, 0.7)
        rect(c, -3.4, -15.4, 6.8, 1.2, aro, 0.6)
      },
      cabeza: (c, e) => {
        const g = nodo('radialGradient', { id: 'doom-vega-orbe', cx: '38%', cy: '32%', r: '75%' }, nodo('defs', {}, c))
        for (const [o, col] of [[0, hielo], [0.45, azul], [1, '#1d4f9a']] as const) nodo('stop', { offset: o, 'stop-color': col }, g)
        nodo('circle', { cx: 0, cy: -21, r: 6.6, fill: azul, opacity: 0.22 }, c)
        nodo('circle', { cx: 0, cy: -21, r: 5.6, fill: 'url(#doom-vega-orbe)' }, c)
        if (e) trazo(c, 'M-4.6-23q4.6 1.8 9.2 0M-5.2-20.6q5.2 2 10.4 0M-4.6-18.2q4.6 1.8 9.2 0', '#1d4f9a', 0.5, 0.7); else {
          nodo('ellipse', { cx: 0, cy: -21, rx: 3.6, ry: 2.2, fill: '#0b2447' }, c)
          visor(c, 'M-2.2-21h4.4', hielo, 1)
          trazo(c, 'M-1.6-18.6q1.6 1 3.2 0', hielo, 0.5, 0.9, 'boca-s'); trazo(c, 'M-1.6-18q1.6-1 3.2 0', hielo, 0.5, 0.9, 'boca-t')
        }
        nodo('ellipse', { cx: 0, cy: -21, rx: 8.2, ry: 2, fill: 'none', stroke: azul, 'stroke-width': 2.4, opacity: 0.2, transform: 'rotate(-14 0 -21)' }, c)
        nodo('ellipse', { cx: 0, cy: -21, rx: 8.2, ry: 2, fill: 'none', stroke: aro, 'stroke-width': 0.9, transform: 'rotate(-14 0 -21)' }, c)
      },
    })
  },
}

// ── Night Sentinel herrero ────────────────────────────────────────────────────────────────────
const centinela: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, camisa = color(a.camisa, '#2f5ea8'), pant = color(a.pantalon, '#3a3a44')
    const acero = '#b4bcc7', luz = aclarar(acero, 0.45), sombra = oscurecer(acero, 0.7), cuero = '#6b4226', capa = oscurecer(camisa, 0.75)
    return armar(p, {
      tw: 5.6, aw: 2.8,
      atras: (c) => rect(c, -6.6, -15.5, 13.2, 12.5, capa, 2),
      pierna: pierna(pant, acero, '#4a3a2e'),
      brazo: brazo(acero, luz, '#4a3a2e', () => 2.4, acero),
      torso: (c, e) => {
        if (e) { rect(c, -6.2, -16, 12.4, 13.4, capa, 2); trazo(c, 'M0-15v11', LATON, 0.8); rect(c, -6.2, -16, 12.4, 1.8, acero, 1) } else {
          rect(c, -5.6, -16, 11.2, 9.4, acero, 2.2)
          trazo(c, 'M-5.4-14.4h10.8', LATON, 0.7)
          rect(c, -5.6, -8.4, 11.2, 1.8, camisa, 0.6)
          rect(c, -4.4, -12.4, 8.8, 9.6, cuero, 1.2) // mandil de herrero
          trazo(c, 'M-4.2-12.4l4.2-2.2 4.2 2.2', cuero, 0.8)
          for (const x of [-2.6, 2.6]) nodo('circle', { cx: x, cy: -11, r: 0.6, fill: LATON }, c)
          rect(c, -3, -7.6, 6, 0.8, oscurecer(cuero, 0.7), 0.4)
        }
      },
      cabeza: (c, e) => {
        const casco = 'M-4.8-14.6v-7q0-4 4.8-4t4.8 4v7q-2.4 1.2-4.8 1.2t-4.8-1.2z'
        nodo('path', { d: 'M-1.2-25.8q-.9-3.8 1.8-6 1 2.6.6 6z', fill: '#a6281c' }, c)
        cuello(c, sombra, -16.4)
        nodo('path', { d: casco, transform: 'translate(0 -.6)', fill: acero }, c)
        nodo('path', { d: casco, transform: 'translate(0 -.6)', fill: 'none', stroke: LATON, 'stroke-width': 0.5 }, c)
        rect(c, -0.6, -26.6, 1.2, 10, LATON)
        trazo(c, 'M-3.6-24.2q1-1.4 2.4-1.6', luz, 0.7)
        if (e) trazo(c, 'M-3.4-19.4h6.8', sombra, 0.7); else {
          rect(c, -3.8, -21.8, 7.6, 1.8, NEGRO, 0.6)
          visor(c, 'M-3.2-20.9h2.4M.8-20.9h2.4', '#ffcf6a', 0.8)
          trazo(c, 'M-2.4-18h1.2M1.2-18h1.2', sombra, 0.6)
        }
      },
    })
  },
}

// ── el Maykr: ser angelical estilizado ────────────────────────────────────────────────────────
const maykr: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, camisa = color(a.camisa, '#2a6fb0'), oro = '#e6c36a', oroOsc = '#b8863a'
    return armar(p, {
      top: -17, cad: -8, tw: 4.2, aw: 2.2, largo: 8,
      atras: (c) => {
        for (const s of [1, -1]) {
          const g = nodo('g', { transform: `scale(${s} 1)` }, c)
          nodo('path', { d: 'M3.2-15.4L12.8-24L9-15.6z', fill: oro }, g)
          nodo('path', { d: 'M3.2-14L13.4-18.8L9.2-12.8z', fill: '#d9b45a' }, g)
          nodo('path', { d: 'M3-12.6L11.4-13.8L8-9.8z', fill: oroOsc }, g)
        }
      },
      pierna: pierna(HUESO, oro, oroOsc),
      brazo: brazo(HUESO, '#fff', oro, () => 1.6, oro),
      torso: (c, e) => {
        nodo('path', { d: 'M-4.2-17h8.4l1.6 14.2h-11.6z', fill: HUESO }, c)
        rect(c, -4.4, -10.8, 8.8, 1.6, camisa, 0.5)
        trazo(c, 'M-5.2-2.8h10.4', oro, 0.8)
        if (e) trazo(c, 'M0-16.4v13M-2-14l2 2.2 2-2.2', oro, 0.6); else {
          trazo(c, 'M-2.6-16.6l2.6 3.4 2.6-3.4', oro, 0.8)
          trazo(c, 'M0-9.2v6.4', oroOsc, 0.6)
          brasa(c, 'M0-13.4v2.4', '#9fe6ff', 0.5)
        }
      },
      cabeza: (c, e) => {
        rect(c, -1.2, -18, 2.4, 2.4, oro)
        nodo('ellipse', { cx: 0, cy: -21.6, rx: 4, ry: 5, fill: '#f8efd4' }, c)
        for (const s of [1, -1]) trazo(c, `M${3.4 * s}-24q${1.6 * s}-2.6 ${0.4 * s}-5.2`, oro, 0.8)
        trazo(c, 'M-4.8-28.6q4.8-1.8 9.6 0', oro, 2.4, 0.25); trazo(c, 'M-4.8-28.6q4.8-1.8 9.6 0', oro, 0.9) // halo
        if (e) trazo(c, 'M-2.4-23.4q2.4-1.4 4.8 0', oroOsc, 0.6); else {
          const o = nodo('g', {}, c, 'ojos')
          for (const x of [-1.8, 1.8]) { nodo('ellipse', { cx: x, cy: -21.8, rx: 1.5, ry: 1, fill: '#9fe6ff', opacity: 0.28 }, o); nodo('ellipse', { cx: x, cy: -21.8, rx: 0.9, ry: 0.55, fill: '#e8fbff' }, o) }
          trazo(c, 'M-2.8-21.8h2M.8-21.8h2', oroOsc, 0.5, 0.8, 'ojo-cerrado')
          lagrima(c, -2.8, -21)
          trazo(c, 'M-1-18.8q1 .6 2 0', oroOsc, 0.5, 1, 'boca-s'); trazo(c, 'M-1-18.4q1-.7 2 0', oroOsc, 0.5, 1, 'boca-t')
        }
      },
    })
  },
}

// ── Guardián del códice (escriba) ─────────────────────────────────────────────────────────────
const escriba: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, camisa = color(a.camisa, '#7a3f22'), piel = color(a.piel, '#d9b08c')
    const tela = oscurecer(camisa, 0.72), claro = aclarar(tela, 0.18), hondo = oscurecer(tela, 0.7)
    return armar(p, {
      aw: 3.2, tw: 5, prop: 1.45, propExtra: (g) => { nodo('rect', { x: -3, y: -8, width: 6, height: 8, rx: 0.7, fill: 'none', stroke: LATON, 'stroke-width': 0.7 }, g) },
      pierna: (g, x) => { rect(g, x, -5, 3.2, 3.4, hondo, 1); nodo('ellipse', { cx: x + 1.6, cy: -1.4, rx: 2.3, ry: 1.3, fill: '#2a1f1a' }, g) },
      brazo: brazo(tela, claro, piel, () => 0, tela),
      torso: (c, e) => {
        nodo('path', { d: 'M-5-16h10l2.6 13.4h-15.2z', fill: tela }, c)
        trazo(c, 'M-7.4-2.9h14.8', LATON, 0.8)
        rect(c, -5, -8.4, 10, 1.2, OXIDO)
        if (e) { trazo(c, 'M0-15.4v11', hondo, 0.7); brasa(c, 'M-1.8-13.4l1.8 2.2 1.8-2.2M0-11.2v3', ASCUA, 0.5) } else {
          trazo(c, 'M-1.6-8l-.6 4.6M1.6-8l.6 4.6', claro, 0.6)
          brasa(c, 'M-1.8-14.4l1.8 2.4 1.8-2.4M0-12v3', ASCUA, 0.55)
          nodo('circle', { cx: 0, cy: -7.8, r: 0.8, fill: LATON }, c)
        }
      },
      cabeza: (c, e) => {
        nodo('path', { d: 'M-5.6-15.4C-6.8-23-3.8-27.4 0-27.4S6.8-23 5.6-15.4q-5.6 1.4-11.2 0z', fill: tela }, c)
        trazo(c, 'M-3.4-25q3.4-1.8 6.8 0', claro, 0.7)
        if (e) trazo(c, 'M0-26.4v9.6', hondo, 0.7); else {
          nodo('ellipse', { cx: 0, cy: -20.2, rx: 3.5, ry: 3.9, fill: '#0d0706' }, c)
          nodo('path', { d: 'M-2.3-17.6q2.3 1.5 4.6 0l-.5 1.4h-3.6z', fill: piel }, c)
          nodo('ellipse', { cx: 0, cy: -20.2, rx: 3.5, ry: 3.9, fill: 'none', stroke: LATON, 'stroke-width': 0.5 }, c)
          const o = nodo('g', {}, c, 'ojos')
          for (const x of [-1.4, 1.4]) punto(o, x, -20.4, 0.95, ASCUA)
          trazo(c, 'M-2.2-20.4h1.6M.6-20.4h1.6', ASCUA, 0.4, 0.4, 'ojo-cerrado')
          trazo(c, 'M-.8-16.8h1.6', hondo, 0.4, 1, 'boca-s'); trazo(c, 'M-.8-16.4q.8-.6 1.6 0', hondo, 0.4, 1, 'boca-t')
        }
      },
    })
  },
}

// ── Ingeniero Argent / UAC ────────────────────────────────────────────────────────────────────
const ingeniero: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, camisa = color(a.camisa, '#d9731a'), pant = color(a.pantalon, '#3a3530'), piel = color(a.piel, '#e8b98f'), pelo = color(a.pelo, '#2b1d14')
    const luz = aclarar(camisa, 0.2), sombra = oscurecer(camisa, 0.75), casco = '#e0a526', pielOsc = oscurecer(piel, 0.88), ARG = '#ffb000'
    return armar(p, {
      atras: (c) => rect(c, -6.2, -15, 12.4, 7, '#3a3430', 1.5),
      pierna: pierna(pant, sombra, '#2a221d'),
      brazo: brazo(camisa, luz, '#3a3430', () => 0, camisa),
      torso: (c, e) => {
        rect(c, -5.2, -16, 10.4, 10, camisa, 3)
        rect(c, -5.2, -8, 10.4, 2, sombra, 1)
        rect(c, -5.2, -11.8, 10.4, 1, '#e8c25a'); rect(c, -5.2, -10, 10.4, 1, '#e8c25a')
        rect(c, -5.2, -8.4, 10.4, 1.4, NEGRO)
        rect(c, -0.7, -8.5, 1.4, 1.2, LATON, 0.2)
        if (e) {
          rect(c, -4.4, -15.6, 8.8, 8.4, '#3a3430', 1.6)
          rect(c, -3, -14.6, 6, 6, '#201a17', 1)
          brasa(c, 'M-3-12.6h6M-3-10.4h6', ARG, 0.8)
        } else {
          rect(c, 2.2, -7.8, 2.4, 2.2, OXIDO, 0.5)
          rect(c, -4.4, -15, 2.4, 2.2, sombra, 0.5)
        }
      },
      cabeza: (c, e) => {
        rect(c, -1.6, -17, 3.2, 3, pielOsc)
        if (e) nodo('circle', { cx: 0, cy: -20, r: 5, fill: pelo }, c); else {
          nodo('circle', { cx: 0, cy: -19.4, r: 4.5, fill: piel }, c)
          const o = nodo('g', {}, c, 'ojos')
          for (const x of [-1.9, 1.9]) nodo('circle', { cx: x, cy: -19, r: 0.7, fill: NEGRO }, o)
          for (const x of [-1.9, 1.9]) trazo(c, `M${x - 1} -19q1 .8 2 0`, NEGRO, 0.5, 1, 'ojo-cerrado')
          trazo(c, 'M-1.2-16.8q1.2.9 2.4 0', '#7a4a38', 0.5, 1, 'boca-s'); trazo(c, 'M-1.2-16.3q1.2-.9 2.4 0', '#7a4a38', 0.5, 1, 'boca-t')
          lagrima(c, -2.4, -18.2)
          rect(c, -4.8, -20.4, 9.6, 5.8, '#bfe9ff', 2.6, 0.16) // visor transparente
          trazo(c, 'M-3.6-20q1-.7 2.2-.8', '#fff', 0.5, 0.7)
          for (const x of [-4.9, 4.1]) rect(c, x, -20, 0.8, 2.4, pelo, 0.4)
        }
        nodo('path', { d: 'M-5.8-19.6c-.4-7.2 11.6-7.2 11.6 0z', transform: 'translate(0 -.2)', fill: casco }, c)
        rect(c, -6.4, -20.6, 12.8, 1.4, '#c78a10', 0.7)
        trazo(c, 'M-3.4-23.6q2.4-1.4 5.2-.6', '#fff3c4', 0.6, 0.6)
        punto(c, 0, -22.8, 1, '#fff3c4') // linterna del casco
      },
    })
  },
}

// ── Marines UAC de fondo: casco, hombrera y franja varían con los colores guardados ────────────
const marine: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, camisa = color(a.camisa, '#616e7c'), pant = color(a.pantalon, '#3a3530'), brillo = color(a.brillo, '#9aa3ad'), piel = color(a.piel, '#e8b98f')
    const h = hash(`${a.camisa}${a.pantalon}${a.brillo}${a.pelo}${a.piel}`), tipo = h % 3, pie = (h >>> 3) & 1, raya = (h >>> 4) & 1
    const lente = ['#ffb000', '#8fe0ff', '#ff6a2b', '#b4f08c'][(h >>> 6) % 4]
    const luz = aclarar(camisa, 0.22), sombra = oscurecer(camisa, 0.7), casco = oscurecer(camisa, 0.88)
    return armar(p, {
      tw: 5.4, aw: 2.7,
      pierna: pierna(pant, camisa, '#2a221d'),
      brazo: brazo(camisa, luz, '#2f2c2a', (l) => ((l === 'i') === !!pie ? 2.4 : 1.2), luz),
      torso: (c, e) => {
        rect(c, -5.4, -16, 10.8, 10, camisa, 2.4)
        rect(c, -5.4, -8, 10.8, 2, sombra, 1)
        rect(c, -5.4, -8.7, 10.8, 1.1, NEGRO); rect(c, -0.8, -8.8, 1.6, 1.3, LATON, 0.3)
        if (raya) rect(c, -5.4, -13.2, 10.8, 1.1, brillo, 0, 0.5)
        if (e) { rect(c, -3.2, -15.2, 6.4, 6, luz, 1.4, 0.45); trazo(c, 'M0-15.2v6', sombra, 0.6) } else {
          nodo('path', { d: 'M-3.6-15.6h7.2l-.8 5.8h-5.6z', fill: luz, opacity: 0.5 }, c)
          trazo(c, 'M-2-14.2h4', sombra, 0.7)
          rect(c, 1.2, -11.2, 2, 1.6, brillo, 0.4, 0.8)
        }
      },
      cabeza: (c, e) => {
        cuello(c, NEGRO)
        if (tipo === 1) { // cara abierta bajo el casco
          nodo('circle', { cx: 0, cy: -19.4, r: 4.6, fill: e ? casco : piel }, c)
          if (!e) {
            const o = nodo('g', {}, c, 'ojos')
            for (const x of [-1.9, 1.9]) nodo('circle', { cx: x, cy: -19, r: 0.7, fill: NEGRO }, o)
            for (const x of [-1.9, 1.9]) trazo(c, `M${x - 1} -19q1 .8 2 0`, NEGRO, 0.5, 1, 'ojo-cerrado')
            trazo(c, 'M-1.2-16.8q1.2.9 2.4 0', '#7a4a38', 0.5, 1, 'boca-s'); trazo(c, 'M-1.2-16.3q1.2-.9 2.4 0', '#7a4a38', 0.5, 1, 'boca-t')
            lagrima(c, -2.4, -18.2)
          }
          nodo('path', { d: 'M-5.6-19.4c-.6-7 11.2-7 11.2 0q-5.6-2.4-11.2 0z', fill: casco }, c)
          rect(c, -5.8, -20.2, 11.6, 1.2, sombra, 0.6)
          if (raya) trazo(c, 'M-3.4-24q3.4-1.6 6.8 0', brillo, 0.7, 0.9)
          return
        }
        nodo('circle', { cx: 0, cy: -20.4, r: 5.3, fill: casco }, c)
        trazo(c, raya ? 'M0-25.6v4' : 'M-3.6-23.8q3.6-2.4 7.2 0', raya ? brillo : aclarar(casco, 0.4), 0.8, 0.9)
        for (const x of [-6, 4.4]) rect(c, x, -21.6, 1.6, 4, sombra, 0.8)
        if (tipo === 2) trazo(c, 'M5.4-22.4v-4.6', '#6b7480', 0.5)
        if (e) trazo(c, 'M-3.2-18.6h6.4', sombra, 0.6); else {
          nodo('path', { d: 'M-4-22h8l-.6 3.6q-3.4 1.4-6.8 0z', fill: '#0e0908' }, c)
          visor(c, 'M-3-20.5h6', lente, 0.9)
          nodo('path', { d: 'M-4.2-17.6q4.2 2.2 8.4 0l-.8 1.6h-6.8z', fill: sombra }, c)
        }
      },
    })
  },
}

export const reparto: Reparto = {
  kits: { 'doom-slayer': slayer, 'doom-hayden': hayden, 'doom-vega': vega, 'doom-centinela': centinela, 'doom-maykr': maykr, 'doom-escriba': escriba, 'doom-ingeniero': ingeniero, marine },
  quien: {
    yo: 'doom-slayer', fondo: 'marine',
    'rol:analisis-plan': 'doom-hayden', 'rol:revision-qa': 'doom-vega', 'rol:implementacion': 'doom-centinela',
    'rol:diseno': 'doom-maykr', 'rol:docs-entrega': 'doom-escriba', 'rol:integracion': 'doom-ingeniero',
  },
}
