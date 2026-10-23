// Reparto del tema «halo»: homenajes originales y estilizados al universo Halo (ver el contrato en rig.ts).
// Un solo armador (`armar`) pone el esqueleto común (sombra, silla, piernas, torso, brazos, cabeza, rasgo del rol y extras
// de pose); cada personaje solo aporta cómo se dibujan sus partes. Los detalles firma (visor del Chief, azul de Cortana,
// ojo de Spark, ámbar del Arbiter) son fijos; el resto de la ropa/armadura se tiñe con camisa, pantalón y brillo.
import { onda } from '../animacion'
import { color, nodo, PROPS, type KitVector, type Pieza, type Reparto } from '../rig'
import { aclarar, oscurecer } from '../sprites'

type G = SVGGElement
type At = Record<string, string | number>
const R = (g: Element, x: number, y: number, w: number, h: number, fill: string, rx = 0, o: At = {}) => nodo('rect', { x, y, width: w, height: h, rx, fill, ...o }, g)
const P = (g: Element, d: string, fill: string, o: At = {}) => nodo('path', { d, fill, ...o }, g)
const C = (g: Element, cx: number, cy: number, r: number, fill: string, o: At = {}) => nodo('circle', { cx, cy, r, fill, ...o }, g)
const E = (g: Element, cx: number, cy: number, rx: number, ry: number, fill: string, o: At = {}) => nodo('ellipse', { cx, cy, rx, ry, fill, ...o }, g)
const L = (g: Element, d: string, stroke: string, w = 0.6, o: At = {}) => nodo('path', { d, fill: 'none', stroke, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...o }, g)

const canal = (h: string, s: number) => (parseInt(h.slice(1), 16) >> s) & 255
/** Mezcla de a hacia b (t = cuánto de b). */
const mezcla = (a: string, b: string, t: number) => `#${[16, 8, 0].map((s) => Math.round(canal(a, s) * (1 - t) + canal(b, s) * t).toString(16).padStart(2, '0')).join('')}`

interface Diseno {
  silla?: boolean // false: flota en vez de sentarse
  x: number // centro de cada brazo (±x)
  hombro: number // y del hombro (pivote)
  mano: number // y de la mano, donde va el rasgo del rol
  prop: [number, number] // dónde asoma el rasgo junto a la silla al estar sentado
  codo: number // y del codo (pivote del antebrazo)
  cuello?: number // y del pivote de la cabeza (por defecto -14.5)
  baja?: number // baja el cuerpo (personajes altos) para caber en la celda
  ext?: number // desplazamiento vertical de los zZ y puntos (personajes altos)
  pierna?: (g: G, s: 1 | -1) => void // s = -1 izquierda, 1 derecha
  torso: (g: G, espalda: boolean) => void
  brazo: (g: G, ab: G, s: 1 | -1) => void // g = brazo (hasta el codo), ab = antebrazo y mano
  cabeza: (g: G, espalda: boolean) => void
}

function armar({ aspecto: a, vista }: Pieza, d: Diseno): G {
  const esp = vista === 'espalda'
  const raiz = nodo('g', {}, undefined, 'pj')
  E(raiz, 0, -0.4, 7.4, 1.6, '#000', { opacity: 0.25 }).setAttribute('class', 'sombra')
  const f = nodo('g', esp ? { transform: 'translate(0 3.5)' } : {}, raiz, 'asiento')
  if (esp && d.silla !== false) { // respaldo de la silla UNSC: acero con su brillo
    R(f, -7.5, -17, 15, 15, '#2c363c', 3).setAttribute('class', 'silla')
    R(f, -6.5, -16.2, 13, 1.4, '#415059', 0.7)
  } else if (!esp && d.pierna) for (const s of [-1, 1] as const) d.pierna(nodo('g', {}, f, `pierna ${s < 0 ? 'i' : 'd'}`), s)
  const cuerpo = nodo('g', d.baja ? { transform: `translate(0 ${d.baja})` } : {}, f, 'cuerpo')
  d.torso(cuerpo, esp)
  cuerpo.setAttribute('data-pivote', '0 -6')
  // Brazo articulado: el brazo gira en el hombro y el antebrazo (con la mano) en el codo.
  const brazo = (s: 1 | -1) => {
    const b = nodo('g', { 'data-pivote': `${s * d.x} ${d.hombro}` }, cuerpo, `brazo ${s < 0 ? 'i' : 'd'}`)
    const ab = nodo('g', { 'data-pivote': `${s * d.x} ${d.codo}` }, b, `antebrazo ${s < 0 ? 'i' : 'd'}`)
    d.brazo(b, ab, s)
    return ab
  }
  const izq = brazo(-1)
  d.cabeza(nodo('g', { 'data-pivote': `0 ${d.cuello ?? -14.5}` }, cuerpo, 'cabeza'), esp)
  const der = brazo(1) // el derecho va al final: sobre la cabeza al saludar y sobre la cara al beber
  // Rasgo del rol: en la mano izquierda al estar de pie; junto a la silla al estar sentado.
  if (a.rol) PROPS[a.rol]?.(esp ? nodo('g', { transform: `translate(${d.prop[0]} ${d.prop[1]})` }, f, 'prop') : nodo('g', { transform: `translate(${-d.x} ${d.mano})` }, izq, 'prop'))
  // Extras de cada pose (animacion.ts los muestra según la pose).
  const e = nodo('g', {}, f, 'extra'), dy = d.ext ?? 0
  const carpeta = nodo('g', {}, e, 'carpeta')
  R(carpeta, -4.2, -13, 8.4, 6.6, '#c77d1c', 0.9); L(carpeta, 'M-4.2-12.2h3l.8-1.2h4.4', '#a8650f', 0.9); L(carpeta, 'M-2.4-9.6h4.8M-2.4-8h3', '#f4f1ea')
  const hx = d.x, hy = d.mano // la taza va en la mano derecha y sube con el antebrazo
  const taza = nodo('g', { 'data-pivote': `${hx} ${hy}` }, der, 'taza')
  R(taza, hx - 1.6, hy - 4.4, 3.2, 3.8, '#dfe6e9', 0.8); L(taza, `M${hx + 1.6} ${hy - 3.6}h.7c.8 0 .8 1.8 0 1.8h-.7`, '#dfe6e9', 0.7); R(taza, hx - 1.6, hy - 4.4, 3.2, 0.9, '#5a3a22')
  for (const [i, x] of [-0.7, 0.7].entries()) L(taza, `M${hx + x} ${hy - 5.6}q-.9-1 0-2 .9-1 0-2`, '#fff', 0.6, { opacity: 0.8 }).setAttribute('class', `vapor v${i}`)
  for (const [i, [x, y]] of ([[4, -25], [6.8, -27.6], [9.4, -30]] as const).entries()) L(e, `M${x} ${y + dy}h2.6l-2.6 2.8h2.6`, '#7f93a0', 0.8).setAttribute('class', `zz z${i}`)
  for (const i of [0, 1, 2]) C(e, 6 + i * 2.4, -26 + dy, 0.8, '#7f93a0').setAttribute('class', `punto p${i}`)
  return raiz
}

/** Cara humana (de espaldas: solo cabeza y nuca). `op` = opacidad del relleno (holograma). */
function cara(cab: G, esp: boolean, piel: string, ceja: string, boca = '#7a4a38', op = 1, ojo = '#1e1b26') {
  const sombra = oscurecer(piel, 0.88), o: At = op < 1 ? { 'fill-opacity': op } : {}
  R(cab, -1.6, -17, 3.2, 3, sombra, 0, o)
  if (!esp) for (const x of [-5.3, 5.3]) C(cab, x, -19.6, 1.1, sombra, o)
  C(cab, 0, -20, 5.2, piel, o)
  if (esp) return
  for (const x of [-2, 2]) L(cab, `M${x - 1}-21.3h2`, ceja, 0.7)
  const ojos = nodo('g', {}, cab, 'ojos')
  for (const x of [-2, 2]) { C(ojos, x, -19.4, 0.8, ojo); C(ojos, x + 0.25, -19.65, 0.24, '#fff') }
  for (const x of [-2, 2]) L(cab, `M${x - 1}-19.4q1 .9 2 0`, ojo, 0.6).setAttribute('class', 'ojo-cerrado')
  P(cab, 'M-3.6-18.4q-.9 1.3 0 1.9.9-.6 0-1.9z', '#7fc4ff').setAttribute('class', 'lagrima')
  L(cab, 'M-1.2-17.2q1.2 .9 2.4 0', boca).setAttribute('class', 'boca-s')
  L(cab, 'M-1.2-16.6q1.2-.9 2.4 0', boca).setAttribute('class', 'boca-t')
}

// ───────────── Spartan: el Jefe Maestro (verde MJOLNIR, visor dorado) y el Spartan-IV genérico ─────────────
function spartan(chief: boolean): KitVector {
  return {
    dibujar: (p) => {
      const a = p.aspecto
      const camisa = color(a.camisa, '#336fc6'), pantalon = color(a.pantalon, '#30364a'), brillo = color(a.brillo, '#ffd84a')
      const armor = chief ? '#5b7a3b' : mezcla(camisa, '#4a5258', 0.4)
      const luz = aclarar(armor, 0.28), sombra = oscurecer(armor, 0.7)
      const bajo = chief ? mezcla('#1f2622', pantalon, 0.25) : oscurecer(pantalon, 0.7)
      const visor = chief ? '#e9b72a' : brillo
      return armar(p, {
        x: 8.3, hombro: -15.8, codo: -11, mano: -7.6, prop: [-10.6, -4],
        pierna: (g, s) => {
          const c = s * 2.7
          R(g, c - 1.8, -10, 3.6, 5.2, armor, 1.3); R(g, c - 1.6, -9.8, 0.9, 4.4, luz, 0.4, { opacity: 0.6 })
          R(g, c - 1.6, -5.2, 3.2, 3.6, sombra, 1.1); E(g, c, -5.2, 2, 1, luz, { opacity: 0.7 }); E(g, c + s * 0.2, -1.3, 2.6, 1.4, '#171b19')
        },
        torso: (g, esp) => {
          R(g, -6, -17.5, 12, 8.4, armor, 2.4); R(g, -4.8, -10.4, 9.6, 2.6, bajo, 0.8); R(g, -5.4, -9.4, 10.8, 2.6, armor, 1)
          if (esp) { R(g, -0.8, -17, 1.6, 7.6, sombra, 0.6); R(g, -3.6, -15.6, 7.2, 4.4, sombra, 1.2) } else {
            P(g, 'M-4.6-16.8h9.2l-.9 5h-7.4z', luz, { opacity: 0.55 })
            if (chief) L(g, 'M-2-14.8h4M-2-13.2h4', sombra, 0.7); else R(g, -0.6, -16.4, 1.2, 4.6, brillo, 0.4)
          }
        },
        brazo: (g, ab, s) => {
          const x = s * 8.3
          R(g, x - 1.7, -16, 3.4, 5.8, armor, 1.4); R(ab, x - 1.5, -11.4, 3, 3.8, sombra, 1.1); C(ab, x, -7.6, 1.7, '#171b19')
          E(g, x, -16.4, 2.9, 2.1, armor); L(g, `M${x - 1.8}-17.3q1.8-1 3.6 0`, luz, 0.7)
          if (!chief && s > 0) R(g, x - 2.4, -16.1, 4.8, 0.9, brillo, 0.3)
        },
        cabeza: (g, esp) => {
          R(g, -2, -16, 4, 1.8, bajo)
          P(g, 'M-5.3-21c0-5.3 2.4-6.7 5.3-6.7s5.3 1.4 5.3 6.7c0 3.4-1.2 5.4-2.6 6.2h-5.4c-1.4-.8-2.6-2.8-2.6-6.2z', armor)
          L(g, 'M-3-26.4q3-1.4 6 0', luz, 0.8)
          if (!chief) P(g, 'M-1.2-27.5h2.4l.7 3.2h-3.8z', sombra)
          if (esp) { R(g, -0.8, -27, 1.6, 8.4, sombra, 0.6); return }
          P(g, 'M-4-22.4c0-1.7 8-1.7 8 0 0 2.3-1.8 3.5-4 3.5s-4-1.2-4-3.5z', visor)
          L(g, 'M-2.8-22.6q1.6-.8 3.2-.2', '#fff', 0.7, { opacity: 0.6 })
          R(g, -2.6, -16.6, 5.2, 1.8, sombra, 0.8); L(g, 'M-1.4-16.6v1.6M1.4-16.6v1.6', oscurecer(sombra, 0.6), 0.5)
        },
      })
    },
  }
}

// ───────────── Cortana: holograma azul translúcido ─────────────
const AZUL = '#5fd4f4', AZUL2 = '#2d8fd6', HIELO = '#d6f6ff', ONDA = '#6f86ff'
const cortana: KitVector = {
  dibujar: (p) => armar(p, {
    x: 5.9, hombro: -15, codo: -11, mano: -7.6, prop: [-8.8, -4],
    pierna: (g, s) => {
      const c = s * 1.9
      R(g, c - 1.3, -9, 2.6, 6, AZUL, 1.2, { 'fill-opacity': 0.55 }); R(g, c - 1.1, -3.4, 2.2, 2.6, AZUL, 1, { 'fill-opacity': 0.28 }); E(g, c, -0.8, 1.6, 0.6, HIELO, { 'fill-opacity': 0.4 })
    },
    torso: (g, esp) => {
      R(g, -4.4, -16, 8.8, 8.2, AZUL2, 2.8, { 'fill-opacity': 0.62 }); R(g, -4.2, -9.2, 8.4, 2.6, AZUL, 1.2, { 'fill-opacity': 0.5 })
      L(g, 'M-3.4-14.6h6.8M-3.4-12.8h6.8M-3.4-11h6.8', '#fff', 0.4, { opacity: 0.3 })
      if (!esp) { L(g, 'M0-15.6v3.6l1.8 1.8', HIELO, 0.6); C(g, 1.8, -10.2, 0.7, HIELO) } else L(g, 'M-1.8-15v7M1.8-15v7', HIELO, 0.5, { opacity: 0.6 })
    },
    brazo: (g, ab, s) => { const x = s * 5.9; R(g, x - 1.1, -15, 2.2, 4.6, AZUL, 1.1, { 'fill-opacity': 0.55 }); R(ab, x - 1.1, -11.6, 2.2, 4.6, AZUL, 1.1, { 'fill-opacity': 0.55 }); C(ab, x, -7.6, 1.3, HIELO, { 'fill-opacity': 0.75 }) },
    cabeza: (g, esp) => {
      cara(g, esp, '#a8e8ff', '#0a3050', '#0a3050', 0.82, '#0a3050')
      if (esp) { // nuca: media melena con circuitos que bajan hasta las puntas
        C(g, 0, -20.2, 5.5, ONDA, { 'fill-opacity': 0.92 }); P(g, 'M-5.4-19.4h10.8q.2 2.6-.6 3.8l-1.1-.6-1.2.8-1.2-.8-1.2.8-1.2-.8-1.2.8-1.2-.8-1.1.6q-.8-1.2-.6-3.8z', ONDA)
        L(g, 'M-3.4-24.4h2.6l1 1.4h2.6M-2-22.4v3l-1.4 1.4v1.8M1.6-21.6v2.4l1.4 1.2v2.6M0-20v4', HIELO, 0.5, { opacity: 0.85 }); C(g, -3.4, -15.8, 0.5, HIELO); C(g, 3, -15.4, 0.5, HIELO); return
      }
      R(g, -5.9, -21, 1.8, 6.2, ONDA, 0.9, { 'fill-opacity': 0.9 }); R(g, 4.1, -21, 1.8, 6.2, ONDA, 0.9, { 'fill-opacity': 0.9 })
      P(g, 'M-5.5-20.4C-6-26.8 6-26.8 5.5-20.4 3.6-22.8-1-23.2-5.5-20.4z', ONDA)
      L(g, 'M-3.6-24h3.2l1 1.4M1.2-24.6h2.4', HIELO, 0.5, { opacity: 0.8 })
    },
  }),
}

// ───────────── 343 Guilty Spark: esfera flotante de un solo ojo ─────────────
const spark: KitVector = {
  dibujar: (p) => {
    const banda = mezcla('#7f93a0', color(p.aspecto.camisa, '#336fc6'), 0.35)
    return armar(p, {
      silla: false, x: 8.6, hombro: -15, codo: -11.5, mano: -8, prop: [-10.6, -6],
      torso: (g, esp) => { if (esp) E(g, 0, -7.4, 5, 1.1, '#7dd8ff', { opacity: 0.5 }) },
      brazo: (g, ab, s) => { const x = s * 8.6; R(g, x - 0.7, -15, 1.4, 4, '#8d9ea8', 0.7); C(g, x, -15.4, 1.3, '#aab8c0'); R(ab, x - 0.7, -12, 1.4, 3.8, '#8d9ea8', 0.7); C(ab, x, -11.6, 0.9, '#aab8c0'); C(ab, x, -8.4, 1.5, '#4a5a64') },
      cabeza: (g, esp) => {
        g.setAttribute('data-pivote', '0 -17')
        C(g, 0, -17, 7.5, '#d3dce1'); P(g, 'M-7.4-16.4a7.5 7.5 0 0 0 14.8 0c-3 1.6-11.8 1.6-14.8 0z', '#9fb0ba')
        L(g, 'M-7.3-17h14.6', banda, 1.6); E(g, -2.8, -21.4, 2.4, 1.3, '#fff', { opacity: 0.45, transform: 'rotate(-30 -2.8 -21.4)' })
        if (esp) { L(g, 'M0-24.4v14.8', banda, 0.8); C(g, 0, -17, 1.6, '#4a5a64'); return }
        C(g, 0, -17, 3.9, '#26333b'); const ojos = nodo('g', {}, g, 'ojos')
        C(ojos, 0, -17, 3, '#37b6ff'); C(ojos, 0, -17, 1.5, '#06222f'); C(ojos, -0.9, -18, 0.6, '#fff')
        L(g, 'M-2.8-17q2.8 1.8 5.6 0', '#06222f', 0.8).setAttribute('class', 'ojo-cerrado')
        L(g, 'M-6.4-13.4h2M4.4-13.4h2', '#6b7d88', 0.7); P(g, 'M-2.4-13.8q-.9 1.3 0 1.9.9-.6 0-1.9z', '#7fc4ff').setAttribute('class', 'lagrima')
      },
    })
  },
  poses: Object.fromEntries((['parado', 'camina', 'teclea', 'espera', 'mano', 'cafe'] as const).map((k) => [k, k === 'camina'
    ? { dur: 1.2, vaiven: 'flota' as const, partes: { '.cuerpo': (t: number) => ({ y: -1 * onda(t), r: 3 * onda(t, 1, 0.25) }) } }
    : { vaiven: 'flota' as const }])),
}

// ───────────── Sgt. Johnson: chaleco, brazos al aire, cabeza rapada y puro ─────────────
const johnson: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, camisa = color(a.camisa, '#336fc6'), pantalon = color(a.pantalon, '#30364a'), brillo = color(a.brillo, '#ffd84a')
    const chaleco = mezcla('#6b7448', camisa, 0.18), tela = mezcla('#566043', pantalon, 0.2), piel = '#74492c', tee = '#2a2d2e'
    return armar(p, {
      x: 7.6, hombro: -15.6, codo: -12, mano: -7.6, prop: [-10, -4],
      pierna: (g, s) => { const c = s * 2.5; R(g, c - 1.9, -9, 3.8, 7.4, tela, 1.3); R(g, c - 1.9, -4.6, 3.8, 0.8, oscurecer(tela, 0.8)); E(g, c, -1.4, 2.4, 1.3, '#1d1d1b') },
      torso: (g, esp) => {
        R(g, -6, -16.4, 12, 10.2, tee, 2.4)
        R(g, -6, -16.4, 4.6, 10, chaleco, 1.6); R(g, 1.4, -16.4, 4.6, 10, chaleco, 1.6); R(g, -6.2, -7.2, 12.4, 1.6, '#1f2020', 0.6)
        if (esp) return R(g, -2.4, -14.6, 4.8, 5, oscurecer(chaleco, 0.85), 1)
        R(g, -5, -12.2, 3, 2.6, oscurecer(chaleco, 0.82), 0.6); R(g, 2, -12.2, 3, 2.6, oscurecer(chaleco, 0.82), 0.6); R(g, -5, -12.2, 3, 0.7, brillo, 0.3)
        C(g, 0, -14.4, 0.6, '#cfd6dd'); R(g, -0.8, -7.2, 1.6, 1.6, '#b9a063', 0.3)
      },
      brazo: (g, ab, s) => { const x = s * 7.6; R(g, x - 1.5, -15.8, 3, 3.8, tee, 1.2); R(ab, x - 1.3, -12.6, 2.6, 4.8, piel, 1.2); C(ab, x, -7.6, 1.6, piel) },
      cabeza: (g, esp) => {
        cara(g, esp, piel, '#140d09', '#2a1810'); if (esp) return
        L(g, 'M-4.2-17.4q4.2 2.8 8.4 0', oscurecer(piel, 0.7), 1.1, { opacity: 0.35 }) // barba cerrada
        R(g, 0.8, -17.8, 5.4, 1.1, '#8a5a30', 0.5); C(g, 6.2, -17.25, 0.8, '#ff7a2e'); L(g, 'M-4 -23.2q4-1.2 8 0', '#fff', 0.7, { opacity: 0.22 })
      },
    })
  },
}

// ───────────── Dra. Halsey: bata blanca, pelo gris a la altura de la barbilla ─────────────
const halsey: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, camisa = color(a.camisa, '#336fc6'), pantalon = color(a.pantalon, '#30364a'), brillo = color(a.brillo, '#ffd84a')
    const bata = mezcla('#eef2f3', camisa, 0.1), interior = mezcla('#2f5f6e', camisa, 0.2), tela = mezcla('#2b3340', pantalon, 0.3)
    const piel = '#e9c3a0', pelo = '#b8bcc4', sombra = oscurecer(bata, 0.86)
    return armar(p, {
      x: 7, hombro: -15.6, codo: -11, mano: -7.6, prop: [-9.6, -4],
      pierna: (g, s) => { const c = s * 2.1; R(g, c - 1.5, -9, 3, 7.4, tela, 1.2); E(g, c, -1.4, 2, 1.1, '#1b1d22') },
      torso: (g, esp) => {
        R(g, -5, -16.2, 10, 10, interior, 2.6)
        R(g, -5.8, -16.2, 4.6, 11.6, bata, 1.6); R(g, 1.2, -16.2, 4.6, 11.6, bata, 1.6); R(g, -5.8, -6, 11.6, 0.9, sombra, 0.4)
        if (esp) return R(g, -0.4, -15.6, 0.8, 10, sombra, 0.4)
        P(g, 'M-1.4-16.2l-2.8 4.6M1.4-16.2l2.8 4.6', 'none', { stroke: sombra, 'stroke-width': 0.8, 'stroke-linecap': 'round' })
        R(g, 2.6, -11.4, 2.2, 1.6, sombra, 0.4); R(g, 2.9, -13.4, 1.6, 1.1, brillo, 0.3) // bolsillo y credencial
      },
      brazo: (g, ab, s) => { const x = s * 7; R(g, x - 1.4, -15.8, 2.8, 5.2, bata, 1.3); R(ab, x - 1.4, -11.6, 2.8, 4.2, bata, 1.3); R(ab, x - 1.3, -9.4, 2.6, 0.8, sombra, 0.3); C(ab, x, -7.2, 1.5, piel) },
      cabeza: (g, esp) => {
        E(g, 0, -19.2, 6.1, 6.2, pelo)
        cara(g, esp, piel, '#6f7078', '#9a5a52')
        if (esp) { // nuca: media melena gris con mechones y puntas
          E(g, 0, -19.2, 6.1, 6.2, pelo); P(g, 'M-6-19.4h12q.2 3-.8 4.4l-1.2-.8-1.4 1-1.4-1-1.4 1-1.4-1-1.4 1-1.4-1-1.2.8q-1-1.4-.8-4.4z', pelo)
          L(g, 'M-3.4-24.6q-2.2 4-1.6 8.6M0-25.6v9.6M3.4-24.6q2.2 4 1.6 8.6M-1.8-25q-1 4.4-.6 8M1.8-25q1 4.4.6 8', '#e2e6ec', 0.5, { opacity: 0.75 })
          L(g, 'M-4.6-15.6q4.6 1.6 9.2 0', oscurecer(pelo, 0.7), 0.7); return
        }
        P(g, 'M-5.6-20.4C-6.2-26.8 6.2-26.8 5.6-20.4 4-23.2-.8-23.8-5.6-20.4z', pelo); R(g, -6.1, -21, 1.9, 6.4, pelo, 0.9); R(g, 4.2, -21, 1.9, 6.4, pelo, 0.9)
        L(g, 'M-2.6-24.6q2-.8 4.2 0', '#e6e9ee', 0.6, { opacity: 0.7 })
      },
    })
  },
}

// ───────────── Cap. Keyes: guerrera de gala azul marino, charreteras y gorra de plato ─────────────
const keyes: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, camisa = color(a.camisa, '#336fc6'), pantalon = color(a.pantalon, '#30364a'), brillo = color(a.brillo, '#ffd84a')
    const saco = mezcla('#2c3a55', camisa, 0.2), tela = mezcla('#1f2736', pantalon, 0.3), oro = '#d1a640', piel = '#8a5a3a'
    return armar(p, {
      x: 7.2, hombro: -15.8, codo: -11, mano: -7.6, prop: [-9.8, -4],
      pierna: (g, s) => { const c = s * 2.4; R(g, c - 1.7, -9, 3.4, 7.4, tela, 1.3); E(g, c, -1.4, 2.2, 1.2, '#14161b') },
      torso: (g, esp) => {
        R(g, -5.6, -16.4, 11.2, 10.6, saco, 2.6); R(g, -5.6, -8, 11.2, 1.2, oscurecer(saco, 0.75), 0.4)
        if (esp) return L(g, 'M0-15.6v7', oscurecer(saco, 0.7), 0.7)
        P(g, 'M-2.2-16.4l2.2 3.2 2.2-3.2z', '#eef2f3'); R(g, -0.5, -14, 1, 3.8, '#14161b', 0.3)
        for (const x of [-2.9, 2.9]) for (const y of [-11.4, -9]) C(g, x, y, 0.55, oro)
        R(g, 2.3, -14.6, 2.4, 0.8, brillo, 0.2); R(g, 2.3, -13.4, 2.4, 0.8, oro, 0.2) // cintas de servicio
      },
      brazo: (g, ab, s) => { const x = s * 7.2; R(g, x - 1.4, -15.8, 2.8, 5.2, saco, 1.3); R(g, x - 1.7, -16.6, 3.4, 1.3, oro, 0.6); R(ab, x - 1.4, -11.6, 2.8, 4.2, saco, 1.3); R(ab, x - 1.4, -9.2, 2.8, 0.8, oro, 0.3); C(ab, x, -7.2, 1.5, piel) },
      cabeza: (g, esp) => {
        cara(g, esp, piel, '#1b120c', '#3a2014')
        if (esp) { C(g, 0, -20, 5.3, '#2b2c33'); L(g, 'M-3.8-18.4q3.8 1.6 7.6 0', '#16171c', 0.9); R(g, -5.3, -21.4, 1.1, 2.4, '#aab0b8', 0.5); R(g, 4.2, -21.4, 1.1, 2.4, '#aab0b8', 0.5) } // nuca: pelo corto con canas
        for (const x of [-4.7, 4.7]) C(g, x, -21.6, 1, '#aab0b8')
        P(g, 'M-6-22.4c.2-4.4 2.6-5.4 6-5.4s5.8 1 6 5.4z', '#222c43'); R(g, -6, -23.4, 12, 1.5, oro, 0.4)
        if (esp) { L(g, 'M0-27.6v4.2M-3.2-27q-.4 1.8-.4 3.6M3.2-27q.4 1.8.4 3.6', '#3a4766', 0.6); C(g, 0, -27.7, 0.8, oro) } // costuras y botón de la gorra
        if (!esp) { P(g, 'M-5.6-21.9h11.2l1.4 1.5h-14z', '#10131b'); C(g, 0, -22.7, 0.9, brillo) }
      },
    })
  },
}

// ───────────── El Arbiter: Sangheili alto y delgado, mandíbulas de cuatro puntas, ámbar y oro ─────────────
const arbiter: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, camisa = color(a.camisa, '#336fc6'), brillo = color(a.brillo, '#ffd84a')
    const armor = mezcla('#34404e', camisa, 0.22), luz = aclarar(armor, 0.25), piel = '#55646b', hondo = '#3d4a51', oro = mezcla('#d1a640', brillo, 0.3)
    return armar(p, {
      x: 6.9, hombro: -22.6, codo: -18.6, cuello: -25, mano: -14.6, prop: [-10.2, -5], baja: 3.4, ext: -1,
      pierna: (g, s) => {
        const c = s * 2.4
        R(g, c - 1.6, -13, 3.2, 6.6, armor, 1.2); E(g, c, -6.6, 1.9, 1, luz, { opacity: 0.7 }); R(g, c - 1, -6.6, 2, 4.8, piel, 0.9)
        P(g, `M${c - 2} -1.2q2-1.6 4 0v1.2h-4z`, hondo); L(g, `M${c - 0.7}-.2v-1M${c + 0.7}-.2v-1`, oro, 0.4)
      },
      torso: (g, esp) => {
        R(g, -4.8, -23.4, 9.6, 11, armor, 2.4); R(g, -4.8, -14.2, 9.6, 1.6, oro, 0.6); R(g, -4.2, -12.6, 8.4, 3.6, oscurecer(armor, 0.8), 1.2)
        if (esp) return L(g, 'M0-22.6v8', hondo, 0.9)
        P(g, 'M-3.4-22.4h6.8l-.8 5h-5.2z', luz, { opacity: 0.5 }); L(g, 'M-3.2-20.4h6.4', oro, 0.6); C(g, 0, -16.8, 0.9, oro)
      },
      brazo: (g, ab, s) => {
        const x = s * 6.9
        R(g, x - 1.2, -22.6, 2.4, 4.4, armor, 1.1); R(ab, x - 1, -19.4, 2, 7.8, piel, 0.9); C(ab, x, -14.4, 1.4, hondo)
        E(g, x, -23, 2.7, 2, armor); L(g, `M${x - 2.4}-22.6h4.8`, oro, 0.7)
      },
      cabeza: (g, esp) => {
        R(g, -1.6, -26.4, 3.2, 3.6, hondo)
        P(g, 'M-3.5-27.6c0-3.8 1.4-5.6 3.5-5.6s3.5 1.8 3.5 5.6c0 1.8-.6 2.8-1.3 3.4h-4.4c-.7-.6-1.3-1.6-1.3-3.4z', piel)
        P(g, 'M-.9-32.8l.9-1.8.9 1.8z', oro)
        if (esp) { R(g, -0.7, -32.4, 1.4, 7, hondo, 0.6); return }
        L(g, 'M-3.2-31q3.2-1.6 6.4 0', oro, 0.6)
        const ojos = nodo('g', {}, g, 'ojos'); for (const x of [-1.5, 1.5]) E(ojos, x, -29.8, 0.9, 0.55, '#ffb300', { transform: `rotate(${x < 0 ? 18 : -18} ${x} -29.8)` })
        for (const x of [-1.5, 1.5]) L(g, `M${x - 1}-29.8h2`, '#1c2428', 0.6).setAttribute('class', 'ojo-cerrado')
        P(g, 'M-2.6-29q-.8 1.2 0 1.7.8-.5 0-1.7z', '#7fc4ff').setAttribute('class', 'lagrima')
        for (const s of [-1, 1]) { L(g, `M${s * 1.1}-26.8q${s * 2.4}-.2 ${s * 3.2} 1.6`, hondo, 1.1); L(g, `M${s * 0.6}-25.6q${s * 1.6}.6 ${s * 2.2} 2.2`, hondo, 1.1) }
        L(g, 'M-.8-26.4h1.6', '#1c2428', 0.5).setAttribute('class', 'boca-s'); L(g, 'M-.8-25.8q.8-.8 1.6 0', '#1c2428', 0.5).setAttribute('class', 'boca-t')
      },
    })
  },
}

export const reparto: Reparto = {
  kits: { chief: spartan(true), spartan: spartan(false), cortana, spark, johnson, halsey, keyes, arbiter },
  quien: {
    yo: 'chief', fondo: 'spartan', 'rol:analisis-plan': 'cortana', 'rol:revision-qa': 'spark', 'rol:implementacion': 'johnson',
    'rol:diseno': 'halsey', 'rol:docs-entrega': 'keyes', 'rol:integracion': 'arbiter',
  },
}
