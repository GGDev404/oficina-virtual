// Reparto del tema «cyberpunk» (Night City): homenajes originales y estilizados, sin arte oficial.
// V, Alt, Delamain, Jackie, Judy, Misty, T-Bug y edgerunners de fondo, todos armados con el mismo molde (`armar`).
// Neón = trazo grueso de baja opacidad bajo el trazo fino (nunca filter). Lo firma de cada quien es fijo; lo demás se tiñe con
// camisa / pantalón / brillo guardados. Contrato de rig: ver rig.ts.
import { color, nodo, PROPS, type KitVector, type Pieza, type Reparto } from '../rig'
import { aclarar, oscurecer } from '../sprites'

type El = SVGElement
type Attrs = Record<string, string | number>
const NEGRO = '#14101f', AMA = '#fcee0a', CIAN = '#4fe3f0', MAG = '#ff2a6d', TINTA = '#1e1b26'
const path = (d: string, fill: string, p: El, extra: Attrs = {}, clase?: string) => nodo('path', { d, fill, ...extra }, p, clase)
const rect = (x: number, y: number, w: number, h: number, fill: string, p: El, rx = 0, extra: Attrs = {}, clase?: string) => nodo('rect', { x, y, width: w, height: h, rx, fill, ...extra }, p, clase)
const disco = (cx: number, cy: number, r: number, fill: string, p: El, extra: Attrs = {}) => nodo('circle', { cx, cy, r, fill, ...extra }, p)
/** Línea de neón: aura ancha tenue + trazo fino. */
const neon = (d: string, c: string, p: El, w = 0.7) => {
  nodo('path', { d, fill: 'none', stroke: c, 'stroke-width': w * 3, 'stroke-linecap': 'round', opacity: 0.28 }, p)
  return nodo('path', { d, fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, p)
}
const lin = (d: string, c: string, p: El, w = 0.6, clase?: string, extra: Attrs = {}) => nodo('path', { d, fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra }, p, clase)
/** Suma de canales: variación estable a partir de colores guardados. */
const semilla = (...cs: string[]) => cs.reduce((s, c) => s + parseInt(c.slice(1), 16), 0)

interface Cara { ojo?: string; y?: number; sep?: number; r?: number; boca?: string; luz?: boolean }
/** Ojos (.ojos, .ojo-cerrado) y boca (.boca-s, .boca-t) con las clases del contrato. */
function cara(cab: El, o: Cara = {}) {
  const y = o.y ?? -19.4, s = o.sep ?? 2, tinta = o.ojo ?? TINTA, boca = o.boca ?? '#8a4a3c'
  const ojos = nodo('g', {}, cab, 'ojos')
  for (const x of [-s, s]) { disco(x, y, o.r ?? 0.75, tinta, ojos); if (!o.luz) disco(x + 0.25, y - 0.25, 0.22, '#fff', ojos) }
  for (const x of [-s, s]) lin(`M${x - 1} ${y}q1 .9 2 0`, tinta, cab, 0.6, 'ojo-cerrado')
  boca3(cab, boca)
}
/** Neón legible: si el color guardado es oscuro, se aclara (rostro y halo no se pierden sobre fondo oscuro). */
const claro = (c: string) => { const n = parseInt(c.slice(1), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255 < 0.5 ? aclarar(c, 0.65) : c }
const boca3 = (cab: El, boca: string) => {
  path('M-3.6-18.2q-.9 1.3 0 1.9.9-.6 0-1.9z', '#7fc4ff', cab, {}, 'lagrima')
  lin('M-1.2-17.2q1.2 .9 2.4 0', boca, cab, 0.6, 'boca-s')
  lin('M-1.2-16.6q1.2-.9 2.4 0', boca, cab, 0.6, 'boca-t')
}

/** Extras de pose del contrato (carpeta, taza con vapor, zZ, puntos), con neón. */
function extras(f: El, c: string) {
  const ex = nodo('g', {}, f, 'extra')
  const carpeta = nodo('g', {}, ex, 'carpeta')
  rect(-4.2, -13, 8.4, 6.6, '#1d1830', carpeta, 0.9, { stroke: c, 'stroke-width': 0.7 })
  lin('M-2.4-9.6h4.8M-2.4-8h3', c, carpeta, 0.6)
  for (const [i, [x, y]] of ([[4, -25], [6.8, -27.6], [9.4, -30]] as const).entries()) lin(`M${x} ${y}h2.6l-2.6 2.8h2.6`, '#a79ccc', ex, 0.8, `zz z${i}`)
  for (const i of [0, 1, 2]) nodo('circle', { cx: 6 + i * 2.4, cy: -26, r: 0.8, fill: '#a79ccc' }, ex, `punto p${i}`)
}

interface Cfg {
  ancho?: number; br?: number // medio ancho del torso y grosor de brazo
  camisa: string; manga?: string; pantalon: string; bota?: string; piel: string; mano?: string
  brillo: string // neón del personaje: silla, halo del rasgo y extras
  glow?: string // sombra de color (Alt)
  grupo?: Attrs // atributos del grupo del cuerpo (translucidez)
  defs?: (g: El) => void
  piernaDeco?: (g: El, x: number, lado: 'i' | 'd') => void
  antes?: (f: El, esp: boolean) => void // entre piernas y torso (falda)
  brazo?: (b: El, ab: El, x: number, lado: 'i' | 'd') => void // b = brazo (hombro), ab = antebrazo (codo y mano)
  torso: (c: El, esp: boolean) => void
  cabeza: (cab: El, esp: boolean) => void
  atras?: (f: El) => void // detrás de todo, p. ej. restos digitales
}

/** Molde común del rig: sombra, silla/piernas, torso, brazos, cabeza, rasgo del rol y extras. */
function armar({ aspecto: a, vista }: Pieza, c: Cfg): SVGGElement {
  const esp = vista === 'espalda', w = c.ancho ?? 5.2, br = c.br ?? 2.5
  const manga = c.manga ?? c.camisa, bota = c.bota ?? '#15121f'
  const raiz = nodo('g', {}, undefined, 'pj')
  if (c.defs) c.defs(nodo('defs', {}, raiz))
  nodo('ellipse', { cx: 0, cy: -0.4, rx: w + 1.8, ry: 1.6, fill: c.glow ?? '#000', opacity: c.glow ? 0.3 : 0.35 }, raiz, 'sombra')
  const f = nodo('g', { ...(esp ? { transform: 'translate(0 3.5)' } : {}), ...c.grupo }, raiz, 'asiento')
  c.atras?.(f)
  if (esp) { // respaldo de la silla gamer: oscuro con filo de neón
    rect(-7.5, -17, 15, 15, '#241d38', f, 3, {}, 'silla')
    rect(-7.5, -17, 15, 15, 'none', f, 3, { stroke: c.brillo, 'stroke-width': 0.7, opacity: 0.55 })
    rect(-6, -15.6, 12, 1.2, '#3a2f5c', f, 0.6)
  } else for (const lado of ['i', 'd'] as const) {
    const x = lado === 'i' ? -3.6 : 0.6
    const p = nodo('g', {}, f, `pierna ${lado}`)
    rect(x, -8, 3, 6.6, c.pantalon, p, 1.3)
    nodo('ellipse', { cx: x + 1.5, cy: -1.4, rx: 2.1, ry: 1.2, fill: bota }, p)
    c.piernaDeco?.(p, x, lado)
  }
  c.antes?.(f, esp)
  const cuerpo = nodo('g', { 'data-pivote': '0 -6' }, f, 'cuerpo')
  const brazo = (lado: 'i' | 'd') => { // pivote en el hombro; el antebrazo (con la mano) gira desde el codo
    const x = lado === 'i' ? -w - br - 0.2 : w + 0.2, cx = x + br / 2
    const b = nodo('g', { 'data-pivote': `${cx} -15` }, cuerpo, `brazo ${lado}`)
    const luz = lado === 'i' ? '#fff' : '#000', xl = x + (lado === 'i' ? 0 : br * 0.6), op = lado === 'i' ? 0.15 : 0.22
    rect(x, -15, br, 5.4, manga, b, br / 2)
    rect(xl, -14.4, br * 0.4, 4, luz, b, br / 5, { opacity: op })
    const ab = nodo('g', { 'data-pivote': `${cx} -11` }, b, `antebrazo ${lado}`)
    rect(x, -12, br, 5.6, manga, ab, br / 2)
    rect(xl, -11.4, br * 0.4, 4, luz, ab, br / 5, { opacity: op })
    disco(cx, -6.6, br * 0.6, c.mano ?? c.piel, ab)
    c.brazo?.(b, ab, x, lado)
    return { ab, x, cx }
  }
  const izq = brazo('i')
  rect(-w, -16, w * 2, 10, c.camisa, cuerpo, 3.2, {}, 'torso')
  c.torso(cuerpo, esp)
  const cab = nodo('g', { 'data-pivote': '0 -14.5' }, cuerpo, 'cabeza')
  rect(-1.6, -17, 3.2, 3, oscurecer(c.piel, 0.88), cab)
  c.cabeza(cab, esp)
  const der = brazo('d') // el derecho va al final: sobre la cabeza al saludar y sobre la cara al beber
  // Rasgo del rol: halo de neón detrás y el objeto de siempre; en la mano izquierda (o junto a la silla).
  if (a.rol) {
    const g = nodo('g', { transform: esp ? `translate(${-w - 4.2} -4)` : `translate(${izq.cx} -6.4)` }, esp ? f : izq.ab, 'prop')
    disco(0, -4, 5, c.brillo, g, { opacity: 0.2 })
    PROPS[a.rol]?.(g)
  }
  // Taza en la mano derecha: sube con el antebrazo.
  const t = nodo('g', { 'data-pivote': `${der.cx} -6.4` }, der.ab, 'taza'), tx = der.cx - 1.6
  rect(tx, -10.8, 3.2, 3.8, '#1d1830', t, 0.8, { stroke: c.brillo, 'stroke-width': 0.6 })
  lin(`M${tx + 3.2}-10h.7c.8 0 .8 1.8 0 1.8h-.7`, c.brillo, t, 0.6)
  for (const [i, dx] of [-0.7, 0.7].entries()) lin(`M${der.cx + dx}-12q-.9-1 0-2 .9-1 0-2`, '#fff', t, 0.6, `vapor v${i}`, { opacity: 0.8 })
  extras(f, c.brillo)
  return raiz
}

// ── V: chaqueta de cuello alto con paneles de color y filo de neón; implante cian en un ojo ──
const V: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, camisa = color(a.camisa, '#1f9e8f'), brillo = color(a.brillo, AMA), pelo = color(a.pelo, '#161616'), piel = color(a.piel, '#c99572')
    const solapa = oscurecer(camisa, 0.7), w = 5.5
    return armar(p, {
      camisa, pantalon: color(a.pantalon, '#262033'), piel, brillo, ancho: w,
      piernaDeco: (g, x) => { rect(x - 0.2, -2.7, 3.4, 0.7, brillo, g, 0.3, { opacity: 0.9 }) },
      torso: (c, esp) => {
        rect(-w, -7.4, w * 2, 1.2, NEGRO, c); rect(-0.8, -7.5, 1.6, 1.4, brillo, c, 0.3)
        if (esp) { neon('M-2.6-13.4l2.6 4.2 2.6-4.2', brillo, c, 0.8); rect(-w, -16, w * 2, 1.4, solapa, c, 0.7); return }
        rect(-1.5, -16, 3, 8.6, '#17111f', c); rect(2.2, -15.8, 3.3, 6.6, aclarar(camisa, 0.28), c, 0.6)
        neon('M-1.7-15.6V-7.6', brillo, c, 0.6); neon('M1.7-15.6V-7.6', brillo, c, 0.6)
      },
      cabeza: (cab, esp) => {
        for (const s of [-1, 1]) { // cuello alto abierto
          path(`M${s * 6}-18.4l${-s * 4.6} 2 ${-s * 0.4} 3.8 ${-s * 4}-1z`, solapa, cab)
          lin(`M${s * 6}-18.4l${-s * 4.6} 2`, brillo, cab, 0.6)
        }
        disco(0, -20, 5.2, esp ? pelo : piel, cab)
        if (esp) { lin('M-2.6-23.6q2-1.2 4 0', aclarar(pelo, 0.3), cab, 0.7); return }
        path('M-5.6-20.4C-6.2-27 5.4-27.6 5.6-20.4 4.6-23 .6-23.4-1.2-22.6-3.4-22-4.6-21.4-5.6-20.4z', pelo, cab)
        lin('M-3.2-24.2q2.6-1 5-.2', aclarar(pelo, 0.3), cab, 0.6)
        cara(cab, { y: -19.4 })
        disco(2, -19.4, 1.5, 'none', cab, { stroke: CIAN, 'stroke-width': 0.5, opacity: 0.8 }) // implante ocular
        disco(2, -19.4, 0.45, CIAN, cab)
      },
    })
  },
}

// ── Alt Cunningham: figura digital translúcida, pelo largo y restos de píxeles; un glitch breve cada 6 s ──
const CIAN_ALT = '#7ee8ff', VIOLETA = '#b36bff'
const ALT: KitVector = {
  dibujar: (p) => {
    const brillo = claro(color(p.aspecto.brillo, CIAN)), piel = '#cdeeff', pelo = '#2a2166'
    const raiz = armar(p, {
      ancho: 4.6, br: 2.2, camisa: 'url(#cy-alt)', pantalon: 'url(#cy-alt)', piel, mano: CIAN_ALT, bota: VIOLETA, brillo, glow: CIAN_ALT,
      grupo: { opacity: 0.8 },
      defs: (d) => {
        const g = nodo('linearGradient', { id: 'cy-alt', x1: 0, y1: -26, x2: 0, y2: 0, gradientUnits: 'userSpaceOnUse' }, d)
        nodo('stop', { offset: 0, 'stop-color': CIAN_ALT }, g); nodo('stop', { offset: 1, 'stop-color': VIOLETA }, g)
      },
      atras: (f) => { // píxeles que se desprenden de los pies
        for (const [x, y, s] of [[-6, -3, 1.4], [5.4, -5, 1.1], [-4, 0.6, 1], [3.4, 0.8, 1.3]] as const) rect(x, y, s, s, CIAN_ALT, f, 0, { opacity: 0.7 })
      },
      piernaDeco: (g, x) => { rect(x, -2.4, 3, 1.6, VIOLETA, g, 0.8, { opacity: 0.5 }) },
      torso: (c, esp) => {
        if (esp) return
        neon('M0-15.6V-7M-3.6-12.8h2.2l1.4 1.4 1.4-1.4h2.2', '#fff', c, 0.5) // circuito del pecho
      },
      cabeza: (cab, esp) => {
        path('M-5.8-21c-1.4 6 .2 11-1.6 14.4l3.6-.8 1-8.4zM5.8-21c1.4 6-.2 11 1.6 14.4l-3.6-.8-1-8.4z', pelo, cab) // melena
        if (esp) { path('M-5.8-21h11.6l.6 12.6-3.2.8-3.2-1.6-3.2 1.6-3.2-.8z', pelo, cab); lin('M-2-23q2-1 4 0M-1-14.4v4', CIAN_ALT, cab, 0.6); return }
        disco(0, -20, 5, piel, cab)
        path('M-5.4-20.2C-6-26.6 6-26.6 5.4-20.2 3.6-22.6 1-24.4-1.4-23.6-3-23-4.6-21.6-5.4-20.2z', pelo, cab)
        lin('M-5.2-21.4q.4-4 3.4-4.4M5.2-21.4q-.4-4-3.4-4.4', CIAN_ALT, cab, 0.5)
        cara(cab, { ojo: brillo, luz: true, r: 0.9, boca: '#8f86e0' })
        lin('M2.8-21.4l1.6 1.2h1.4', VIOLETA, cab, 0.5) // trazo de circuito en la sien
      },
    })
    const f = raiz.querySelector('.asiento')!
    const gl = nodo('g', { opacity: 0 }, f, 'glitch') // franjas desplazadas, solo en el destello
    rect(-6, -14.6, 12, 1.4, MAG, gl); rect(-4, -10.8, 12, 1.2, CIAN_ALT, gl); rect(-7, -20.6, 12, 1.2, '#fff', gl)
    return raiz
  },
  // Destello de glitch una vez cada 6 s (~0,17 s); el resto del tiempo, quieta.
  poses: {
    parado: { dur: 6, cuadros: 2, pesos: [35, 1], partes: { '.ojos': () => ({}), '.glitch': (t) => (t >= 0.5 ? { o: 0.8, x: 1.2 } : { o: 0 }), '.cuerpo': (t) => (t >= 0.5 ? { x: -0.8 } : {}) } },
  },
}

// ── Delamain: chofer IA; cabeza-pantalla holográfica con rostro de neón y gorra de taxi, guantes blancos ──
const DELAMAIN: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, brillo = claro(color(a.brillo, CIAN)), traje = oscurecer(color(a.camisa, '#2a3f6e'), 0.6)
    return armar(p, {
      ancho: 5.4, camisa: traje, pantalon: '#101830', piel: '#0b1424', mano: '#f4f6fa', bota: '#0b0b12', brillo,
      torso: (c, esp) => {
        if (esp) { rect(-5.4, -16, 10.8, 1.4, oscurecer(traje, 0.8), c, 0.7); return }
        path('M-2.4-16l2.4 3 2.4-3 1 .6-3.4 4.6-3.4-4.6z', '#f4f6fa', c) // camisa blanca
        path('M0-13.2l-1.2 1.4 1.2 5 1.2-5z', brillo, c) // corbata
        rect(2.4, -13.6, 2.4, 1.8, AMA, c, 0.4); lin('M2.4-12.7h2.4M3.6-13.6v1.8', NEGRO, c, 0.35) // placa de taxi
      },
      brazo: (_b, ab, x) => { rect(x - 0.2, -8.2, 2.9, 1.4, '#f4f6fa', ab, 0.6) }, // puño
      cabeza: (cab, esp) => {
        rect(-5.2, -25.4, 10.4, 9.6, esp ? '#1a2238' : '#0a1626', cab, 2.4, { stroke: brillo, 'stroke-width': 0.6 })
        if (esp) { lin('M-3-22h6M-3-20h6M-3-18h6', '#3a4668', cab, 0.7); neon('M0-26.6v-2', brillo, cab, 0.6) } else {
          for (const y of [-23.2, -17.8]) lin(`M-4 ${y}h8`, brillo, cab, 0.25, undefined, { opacity: 0.35 }) // líneas de barrido
          cara(cab, { y: -21, sep: 2.2, ojo: brillo, luz: true, r: 0.95, boca: brillo })
        }
        path('M-5.8-25.2c.4-3.4 11.2-3.4 11.6 0v1.2h-11.6z', '#0f1a36', cab) // gorra
        rect(-6.2, -25, 12.4, 0.9, brillo, cab, 0.3)
        disco(0, -27.6, 0.9, AMA, cab) // insignia
      },
    })
  },
}

// ── Jackie Welles: corpulento, chaqueta roja con ribetes dorados, barba y cadena ──
const ROJO = '#c0102c', ORO = '#e8b83a'
const JACKIE: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, brillo = color(a.brillo, AMA), piel = '#8a5a3c', pelo = '#14110f'
    return armar(p, {
      ancho: 6.5, br: 3.3, camisa: ROJO, pantalon: color(a.pantalon, '#2b2a36'), piel, brillo, bota: '#2a1c14',
      brazo: (b, ab, x) => { rect(x + 1.2, -15, 0.9, 4.2, ORO, b, 0.3); rect(x + 1.2, -11, 0.9, 2.4, ORO, ab, 0.3) },
      torso: (c, esp) => {
        if (esp) { disco(0, -11.6, 2.6, 'none', c, { stroke: ORO, 'stroke-width': 0.9 }); disco(0, -11.6, 0.9, ORO, c); return }
        path('M-2.6-16l2.6 5.6 2.6-5.6z', color(a.camisa, '#e8e8f0'), c)
        path('M-6.5-16l3.8 1.2 1.6 8.8h-5.4zM6.5-16l-3.8 1.2-1.6 8.8h5.4z', oscurecer(ROJO, 0.82), c, { opacity: 0.8 })
        lin('M-2.8-16q2.8 4.4 5.6 0', ORO, c, 0.8)
        rect(-6.5, -7.4, 13, 1, '#241a18', c); rect(-6.5, -16, 13, 1, ORO, c, 0.5, { opacity: 0.8 })
      },
      cabeza: (cab, esp) => {
        rect(-2.2, -17, 4.4, 3.4, oscurecer(piel, 0.88), cab)
        nodo('ellipse', { cx: 0, cy: -20, rx: 5.9, ry: 5.4, fill: esp ? pelo : piel }, cab)
        if (esp) return
        path('M-6-20.4C-6.4-26.6 6.4-26.6 6-20.4 4.6-22 1.4-22.6-.6-22.6-3-22.6-4.8-21.8-6-20.4z', pelo, cab)
        path('M-5.8-20c.4 5.2 1.8 6.8 5.8 7.2 4-.4 5.4-2 5.8-7.2-1.2 2.6-2.6 3.4-5.8 3.4S-4.6-17.4-5.8-20z', pelo, cab) // barba
        cara(cab, { y: -20, sep: 2.3, boca: '#d8a888' })
        lin('M-3.6-21.6h2.4M1.2-21.6h2.4', pelo, cab, 0.6)
        lin('M-5.6-22.6l.6-1.4', brillo, cab, 0.4) // corte lateral con tinte
      },
    })
  },
}

// ── Judy Alvarez: pelo corto turquesa con puntas magenta, visor de braindance en la frente, brazos con tatuajes de neón ──
const JUDY: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, brillo = color(a.brillo, CIAN), piel = '#cf9a76', pelo = '#13b5c2'
    return armar(p, {
      ancho: 4.8, br: 2.3, camisa: color(a.camisa, '#7b3fbf'), manga: piel, pantalon: color(a.pantalon, '#2a2a3a'), piel, brillo,
      brazo: (b, ab, x) => { lin(`M${x + 1.15} -13.4v2.2`, brillo, b, 0.5); lin(`M${x + 1.15} -9.8v1.4`, brillo, ab, 0.5) },
      torso: (c, esp) => {
        for (const s of [-1, 1]) { rect(s < 0 ? -4.8 : 2.2, -16, 2.6, 9.8, '#181420', c, 1); lin(`M${s * 2.2} -15.6V-7`, MAG, c, 0.5) }
        if (esp) rect(-2.2, -16, 4.4, 9.8, '#181420', c)
      },
      cabeza: (cab, esp) => {
        if (esp) { disco(0, -20, 5.2, pelo, cab); path('M-5.2-19h10.4v4q-5.2 2-10.4 0z', pelo, cab); lin('M-5-16.4q5 2 10 0', MAG, cab, 0.7) } else {
          path('M-5.8-19.4c-1 5 0 7.4 1.2 8.6l2.4-3.4zM5.4-19.4c.8 3.4 0 5.4-.6 6.2l-2-3z', pelo, cab) // melena asimétrica
          disco(0, -20, 5.1, piel, cab)
          path('M-5.8-20.4C-6.4-27 6-27.2 5.6-20.6 4.2-22.6 1-23.2-1.2-22.4-3.2-21.6-4.8-21.6-5.8-20.4z', pelo, cab)
          path('M-5.8-20.4l-.6 3.2 1.6-1.4zM5.6-20.6l.6 2.6-1.6-1z', MAG, cab)
          cara(cab, { y: -19.2, boca: '#6a2a3c' })
        }
        rect(-5.1, -23.6, 10.2, 1.8, '#1e1a2c', cab, 0.9) // visor subido
        rect(-4, -23.3, 3.4, 1.2, brillo, cab, 0.5); rect(0.6, -23.3, 3.4, 1.2, brillo, cab, 0.5)
      },
    })
  },
}

// ── Misty: pelo negro larguísimo, flequillo recto, falda larga y ankh de neón ──
const MISTY: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, brillo = color(a.brillo, '#c77dff'), piel = '#efd9cf', pelo = '#12101a'
    return armar(p, {
      ancho: 4.6, br: 2.2, camisa: '#1b1626', pantalon: '#1b1626', piel, brillo, bota: '#241a2e',
      antes: (f, esp) => {
        if (esp) return
        const falda = oscurecer(color(a.camisa, '#7a3fbf'), 0.5)
        path('M-4.8-9h9.6l3.2 6.2q-8 2.4-16 0z', falda, f)
        neon('M-7.6-2.8q7.6 2.4 15.2 0', brillo, f, 0.6)
        lin('M-1.8-8l-1.6 5.4M1.8-8l1.6 5.4', oscurecer(falda, 0.7), f, 0.5)
      },
      torso: (c, esp) => {
        if (esp) return
        neon('M0-14.2v4M-1.2-12.8h2.4', brillo, c, 0.7); lin('M-0.9-14.2a.9.9 0 1 1 1.8 0', brillo, c, 0.6) // ankh
      },
      cabeza: (cab, esp) => {
        path('M-5.8-21h11.6l1 13-2.4.8h-1l-.6-7h-4.4l-.6 7h-1l-2.4-.8z', pelo, cab) // cortina de pelo
        if (esp) { disco(0, -20, 5.2, pelo, cab); lin('M-2.6-23.4q2-1.2 4 0', aclarar(pelo, 0.35), cab, 0.7); return }
        disco(0, -20, 5, piel, cab)
        path('M-5.4-20.2C-6-27 6-27 5.4-20.2v-1.6h-10.8z', pelo, cab) // flequillo recto
        for (const x of [-2, 2]) nodo('ellipse', { cx: x, cy: -19.3, rx: 1.4, ry: 1.2, fill: '#3b2a52', opacity: 0.6 }, cab) // sombra de ojos
        cara(cab, { y: -19.3, r: 0.85, boca: '#6b1f5c' })
      },
    })
  },
}

// ── T-Bug: netrunner con traje negro de LEDs, visor de interfaz y cable neural ──
const TBUG: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, brillo = color(a.brillo, CIAN), piel = '#e6c6b6', pelo = '#ff2a6d', traje = '#171329'
    return armar(p, {
      ancho: 4.8, br: 2.3, camisa: traje, pantalon: traje, piel, brillo, bota: '#0e0b18',
      piernaDeco: (g, x, lado) => { lin(`M${lado === 'i' ? x + 0.4 : x + 2.6} -7.6v5`, brillo, g, 0.5) },
      brazo: (b, ab, x) => { lin(`M${x + 1.15} -14.4v3.2`, brillo, b, 0.5); lin(`M${x + 1.15} -10.6v1.8`, brillo, ab, 0.5) },
      torso: (c, esp) => {
        rect(-2.8, -15.6, 5.6, 5.6, oscurecer(color(a.camisa, '#5a2fbf'), 0.55), c, 1.2)
        if (esp) { neon('M0-15.6v8M-3-12h6', brillo, c, 0.5); return }
        neon('M-2.8-13h1.8l1 1.4h2l1-1.4h1.8M0-10v3.6', brillo, c, 0.5)
        neon('M5.8-19q4.2 2.6 2.6 9.2t-1.8 4.8', brillo, c, 0.5) // cable neural
      },
      cabeza: (cab, esp) => {
        disco(0, -20, 5.2, esp ? pelo : piel, cab)
        if (esp) { lin('M-3-23.6q3-1.2 6 0', aclarar(pelo, 0.3), cab, 0.7); rect(-5.4, -21.4, 10.8, 1.4, '#0a0f1c', cab, 0.7); lin('M-4-20.7h8', brillo, cab, 0.5); return }
        path('M-5.8-18.4c-.6-9 11.6-9 11.4 1.2l-1.4 2.2-1-4.2c-3.2-.4-6-1.6-7.6-3.2z', pelo, cab)
        path('M-5.6-20l-1 5.6 2.4-1z', pelo, cab)
        disco(-5.4, -19.4, 1, '#3a3552', cab); disco(-5.4, -19.4, 0.4, brillo, cab) // puerto neural
        const v = nodo('g', {}, cab, 'ojos') // el visor es el «ojo»: parpadea con la pose
        rect(-4.6, -21.2, 9.2, 2.8, '#0a0f1c', v, 1.4); neon('M-3.6-19.8h7.2', brillo, v, 0.9)
        for (const x of [-2, 2]) lin(`M${x - 1}-19.8q1 .9 2 0`, brillo, cab, 0.6, 'ojo-cerrado')
        boca3(cab, '#7a3a4a')
      },
    })
  },
}

// ── Edgerunners de fondo: chaqueta teñida con neón, y una variante de pelo/implante según sus colores ──
const EDGE: KitVector = {
  dibujar: (p) => {
    const a = p.aspecto, camisa = color(a.camisa, '#2a2340'), brillo = color(a.brillo, CIAN), pelo = color(a.pelo, '#161616'), piel = color(a.piel, '#c99572')
    const v = semilla(color(a.pelo, '#161616'), camisa, piel) % 4, solapa = aclarar(camisa, 0.25)
    return armar(p, {
      camisa, pantalon: color(a.pantalon, '#262033'), piel, brillo, ancho: 5.4,
      piernaDeco: (g, x) => { rect(x, -2.5, 3, 0.6, brillo, g, 0.3, { opacity: 0.85 }) },
      brazo: (b, ab, x, lado) => { if (lado === 'd') { lin(`M${x + 1.2} -14.6v3.4`, brillo, b, 0.5); lin(`M${x + 1.2} -10.6v1.6`, brillo, ab, 0.5) } },
      torso: (c, esp) => {
        if (esp) { neon('M-3.4-14.2h6.8', brillo, c, 0.6); rect(-5.4, -16, 10.8, 1.4, oscurecer(camisa, 0.9), c, 0.7); return }
        rect(-1.2, -16, 2.4, 8.4, '#15101f', c); neon('M-2.4-15.6V-7.6', brillo, c, 0.5)
        path('M-5.4-16l3.2.4.4 4.4-3.6-1.4z', solapa, c); rect(-5.4, -7.4, 10.8, 1, '#15101f', c)
      },
      cabeza: (cab, esp) => {
        if (v === 0 && !esp) for (const [x, h] of [[-3, 3], [-1, 5], [1, 5.6], [3, 3.4]] as const) path(`M${x - 1.1} -23.5l1.1 ${-h} 1.1 ${h}z`, pelo, cab) // cresta
        disco(0, -20, 5.2, esp ? pelo : piel, cab)
        if (esp) { lin('M-2.6-23.6q2-1.2 4 0', aclarar(pelo, 0.3), cab, 0.7); return }
        path('M-5.4-20.4C-5.8-26.4 5.8-26.4 5.4-20.4 3.6-22.6-.6-22.6-5.4-20.4z', v === 3 ? oscurecer(camisa, 0.8) : pelo, cab)
        if (v === 3) rect(-5.5, -22.4, 11, 1.1, brillo, cab, 0.5) // gorro con ribete
        if (v === 1) {
          const g = nodo('g', {}, cab, 'ojos'); rect(-4.8, -20.8, 9.6, 2.4, '#0a0f1c', g, 1.2); neon('M-3.8-19.6h7.6', brillo, g, 0.9)
          for (const x of [-2, 2]) lin(`M${x - 1}-19.4q1 .9 2 0`, brillo, cab, 0.6, 'ojo-cerrado')
          boca3(cab, '#8b5a44'); return
        }
        cara(cab, { y: -19.4 })
        if (v === 2) { rect(3, -22.2, 2.6, 4.4, '#9aa3c0', cab, 0.8); disco(4.3, -20, 0.8, brillo, cab); lin('M3-17.6q.2 1.6 1.4 2', brillo, cab, 0.4) } // placa sobre la sien
        else lin('M-3.8-18.2l1 1.6', brillo, cab, 0.4) // implante en la mejilla
      },
    })
  },
}

export const reparto: Reparto = {
  kits: { v: V, alt: ALT, delamain: DELAMAIN, jackie: JACKIE, judy: JUDY, misty: MISTY, tbug: TBUG, netrunner: EDGE },
  quien: {
    yo: 'v', 'rol:analisis-plan': 'alt', 'rol:revision-qa': 'delamain', 'rol:implementacion': 'jackie',
    'rol:diseno': 'judy', 'rol:docs-entrega': 'misty', 'rol:integracion': 'tbug', fondo: 'netrunner',
  },
}
