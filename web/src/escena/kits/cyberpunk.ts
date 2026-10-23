// Reparto del tema «cyberpunk»: el elenco de Cyberpunk: Edgerunners (Studio Trigger) en pixel art, sobre el motor de pixel.ts.
// Diseños copiados de las ilustraciones de la serie, a 1 px lógico = 1 píxel: colores planos de cel, contorno oscuro de 1 px,
// rampas de 3 tonos sin degradados. Los rasgos de cada personaje son fijos; los edgerunners anónimos de fondo se tiñen con lo guardado.
// Cada personaje es una `Persona`: cabeza = piel + cara + pelo (mapa de píxeles), torso a mano, brazos y piernas parametrizados.
import { color, type KitPixel, type Reparto } from '../rig'
import type { Aspecto } from '../sprites'
import { luz, mezcla, pintarDe, RIT, som, type Ctx, type P, type Quien } from './pixel'

const TINTA = '#1c1420', ORO = '#f0c63a', CROMO = '#aeb6c2', CROMO_OSC = '#6c7480'

/** Caja con contorno de 1 px (esquinas cortadas), luz arriba y sombra a la derecha y abajo. */
function caja(p: P, x: number, y: number, w: number, h: number, k: string, o = som(k, 0.42)) {
  if (w < 2 || h < 2) return
  p(x + 1, y, w - 2, 1, o); p(x + 1, y + h - 1, w - 2, 1, o); p(x, y + 1, 1, h - 2, o); p(x + w - 1, y + 1, 1, h - 2, o)
  p(x + 1, y + 1, w - 2, h - 2, k)
  if (w >= 5 && h >= 4) p(x + 1, y + 1, w - 3, 1, luz(k, 0.14))
  if (w >= 4 && h >= 3) p(x + w - 2, y + 1, 1, h - 2, som(k, 0.82))
  if (h >= 4) p(x + 1, y + h - 2, w - 2, 1, som(k, 0.82))
}

/** Mapa de píxeles: cada letra es un color de `pal`; «.» y espacio son transparentes. `solo` filtra qué celdas se pintan. */
type Mapa = { x0?: number; y0: number; filas: string[]; pal: Record<string, string> }
function bmp(p: P, m: Mapa, solo?: (x: number, y: number) => boolean) {
  m.filas.forEach((f, j) => {
    const y = m.y0 + j
    for (let i = 0; i < f.length;) {
      const ch = f[i], x = (m.x0 ?? 0) + i
      if (ch === '.' || ch === ' ' || (solo && !solo(x, y))) { i++; continue }
      let n = 1
      while (i + n < f.length && f[i + n] === ch && (!solo || solo(x + n, y))) n++
      p(x, y, n, 1, m.pal[ch] ?? '#f0f'); i += n
    }
  })
}

// ── Cara: cejas, ojos (parpadeo), nariz, boca y lágrima, con el mismo estado que el motor (Ctx) ──
interface Cara { y?: number; iris: string; ceja?: string; boca?: string; alto?: number; blanco?: string; sinCeja?: boolean; sinBoca?: boolean; sinNariz?: boolean; ojos?: 'izq' | 'der' | 'ambos' }
function cara(p: P, c: Ctx, w: number, piel: string, o: Cara) {
  const y = o.y ?? 6, L = w / 2 - 3, R = w / 2 + 1, h = o.alto ?? 2, bl = o.blanco ?? '#fff', mid = w / 2, vis = o.ojos ?? 'ambos'
  if (!o.sinCeja) {
    if (c.humor === 't') { p(L, y - 1, 1, 1, o.ceja!); p(L + 1, y - 2, 1, 1, o.ceja!); p(R + 1, y - 1, 1, 1, o.ceja!); p(R, y - 2, 1, 1, o.ceja!) } else { p(L, y - 2, 2, 1, o.ceja!); p(R, y - 2, 2, 1, o.ceja!) }
  }
  const ojo = (x: number, izq: boolean) => {
    if (c.ojos === 'c') { p(x, y + h - 1, 2, 1, TINTA); return }
    p(x, y, 2, 1, TINTA); p(x + (izq ? 0 : 1), y + 1, 1, h - 1, bl); p(x + (izq ? 1 : 0), y + 1, 1, h - 1, o.iris)
    if (h >= 3) p(x + (izq ? 1 : 0), y + 1, 1, 1, '#fff')
  }
  if (vis !== 'der') ojo(L, true)
  if (vis !== 'izq') ojo(R, false)
  if (!o.sinNariz) p(mid, y + 2, 1, 1, som(piel, 0.74))
  if (!o.sinBoca) {
    const b = o.boca ?? som(piel, 0.5)
    if (c.humor === 't') { p(mid - 1, y + 3, 2, 1, som(b, 0.8)); p(mid - 2, y + 3, 1, 1, som(b, 0.9)) } else p(mid - 1, y + 3, 2, 1, b)
  }
  if (c.humor === 't') p(L - 1, y + 2 + c.k, 1, 1, '#8fd3ff')
}

// ── Brazos y piernas parametrizados ──
interface Brazo { manga?: string; mano: string; hr?: number; metal?: boolean; manga2?: string }
const brazoDe = (aw: number, b: Brazo) => (p: P, len: number, _l: 'i' | 'd', arriba: boolean) => {
  const hr = Math.min(b.hr ?? 3, len - 1)
  if (b.metal) { // cromo: tubo con junta y mano más oscura
    caja(p, 0, 0, aw, len, b.mano, som(b.mano, 0.4))
    p(1, Math.round(len / 2) - (arriba ? 0 : 1), aw - 2, 1, som(b.mano, 0.72))
    const hy = arriba ? 0 : len - hr
    caja(p, 0, hy, aw, hr, CROMO_OSC, som(CROMO_OSC, 0.4)); p(1, hy + (arriba ? hr - 1 : 0), aw - 2, 1, luz(CROMO_OSC, 0.2))
    return
  }
  const m = len - hr
  caja(p, 0, 0, aw, len, b.mano, som(b.mano, 0.5))
  if (b.manga) {
    const sy = arriba ? len - m : 0
    caja(p, 0, sy, aw, m, b.manga)
    if (b.manga2 && m >= 3) p(0, arriba ? sy : sy + m - 1, aw, 1, b.manga2) // puño o borde de otro color
  }
}
interface Pierna { pant: string; bota: string; corto?: [string, number]; franja?: string }
const piernaDe = (pw: number, d: Pierna) => (p: P, len: number) => {
  const l = Math.max(4, len), bh = Math.min(3, l - 2)
  caja(p, 0, 0, pw, l - bh + 1, d.pant)
  if (d.corto) caja(p, 0, 0, pw, d.corto[1], d.corto[0])
  caja(p, 0, l - bh, pw, bh, d.bota)
  if (d.franja) p(1, l - bh + 1, pw - 2, 1, d.franja)
}

// ── Persona: lo común a todos los edgerunners ──
interface Persona {
  cab: [number, number]; tor: [number, number]; bra: [number, number]; pie: [number, number]
  piel: string; cara: Cara; pelo: Mapa; espalda?: string; punta?: string; fuera?: (p: P, c: Ctx) => void
  extra?: (p: P, c: Ctx) => void // sobre el pelo (bigote, visor, mascarilla)
  torso: (p: P, c: Ctx, h: number) => void
  brazo: Brazo; pierna: Pierna; ts?: number; bar?: number; solape?: number; silla?: string
}
const SILLA = '#2c2064' // respaldo violeta oscuro: su luz arriba hace de borde de neón
const persona = (d: Persona): Quien => {
  const [w, h] = d.cab
  return {
    cab: d.cab, tor: d.tor, bra: d.bra, pie: d.pie, bar: d.bar ?? 2, ts: d.ts, solape: d.solape ?? 1, silla: d.silla ?? SILLA,
    cabeza: (p, c) => {
      d.fuera?.(p, c)
      caja(p, 0, 0, w, h, d.piel)
      if (c.vista === 'frente') { cara(p, c, w, d.piel, d.cara); bmp(p, d.pelo); d.extra?.(p, c) } else { // espalda: casquete de pelo; del mapa solo los picos (arriba o a los lados)
        const k = d.espalda ?? d.pelo.pal.h
        bmp(p, d.pelo, (x, y) => y < 0 || x < 0 || x >= w)
        caja(p, 0, 0, w, h - 2, k); p(2, 1, w - 5, 1, luz(k, 0.2)); p(1, h - 3, w - 2, 1, som(k, 0.82))
        if (d.punta) { p(1, h - 3, 2, 1, d.punta); p(w - 3, h - 3, 2, 1, d.punta) }
      }
    },
    torso: d.torso, brazo: brazoDe(d.bra[0], d.brazo), pierna: piernaDe(d.pie[0], d.pierna),
  }
}

// ── David Martínez: pelo oscuro en púas, laterales rapados, implante en la sien, chaqueta amarilla, camiseta negra, cadena ──
const D = { amarillo: '#f2dc22', gris: '#b4bac4', tee: '#2e2e36', pelo: '#3c2c30', piel: '#eba98e' }
const david = (a: Aspecto): Quien => persona({
  cab: [10, 11], tor: [8, 10], bra: [3, 9], pie: [4, 9], piel: D.piel,
  cara: { iris: '#6a4228', ceja: '#4a2e24' },
  pelo: { y0: -4, pal: { o: '#1c1218', h: D.pelo, l: '#5e4a50', b: '#7a5448', i: '#b8c2ce' }, filas: [
    '.....oo...', '..o..ohho.', '.ohoohhhho', 'ohhhhhhhho', 'ohhlllhhho', 'ohhhhhhhho', 'obhhhhhhbo', 'obbhhhhbio', 'ob.....bio', 'o......bio'] },
  extra: (p) => { p(8, 5, 1, 1, color(a.brillo, '#4fe3f0')) }, // luz del implante, teñida por el brillo
  torso: (p, c, h) => {
    caja(p, 0, 0, 8, h, D.amarillo); p(0, h - 1, 8, 1, som(D.amarillo, 0.7))
    if (c.vista === 'espalda') { p(1, 0, 6, 1, D.gris); p(1, 1, 6, 1, som(D.gris, 0.8)); p(3, 4, 2, 1, som(D.amarillo, 0.85)); return }
    p(2, 1, 4, h - 2, D.tee); p(2, 1, 1, h - 2, som(D.tee, 0.8)); p(1, 0, 1, 4, D.gris); p(6, 0, 1, 4, D.gris) // camiseta y cuello gris
    p(3, 0, 2, 1, som(D.piel, 0.84)); p(2, 1, 1, 1, ORO); p(5, 1, 1, 1, ORO); p(3, 2, 2, 1, ORO); p(3, 3, 2, 2, ORO) // cadena con colgante
  },
  brazo: { manga: D.amarillo, mano: D.piel, hr: 3, manga2: '#e8f6f4' },
  pierna: { pant: '#3c4258', bota: '#f2f0ea', franja: D.amarillo },
})

// ── Lucy: melena plateada con mechas rosa y puntas turquesa, delineado rojo, mono negro y chaqueta corta blanca ──
const L = { blanco: '#eef0fa', negro: '#221f30', rojo: '#e2384a', piel: '#fbe0d4' }
const lucy: Quien = persona({
  cab: [10, 11], tor: [8, 10], bra: [3, 9], pie: [4, 9], piel: L.piel,
  cara: { iris: '#7fe4d4', ceja: '#c8b0c8', sinCeja: true, boca: '#e2848c' },
  pelo: { y0: -1, pal: { o: '#2c2438', h: '#f2eef8', p: '#f8c2dc', c: '#78d6e4', d: '#bdb8dc' }, filas: [
    '.oooooooo.', 'oppppppppo', 'opphhhhhpo', 'ohhhhhhhho', 'ohhhhhhhho', 'ohooooooho', 'oh......ho', 'oh......ho', 'oh......ho', 'od......do', 'oc......co', '.c......c.'] },
  espalda: '#f2eef8', punta: '#78d6e4',
  extra: (p) => { p(2, 8, 1, 1, L.rojo); p(7, 8, 1, 1, L.rojo) }, // delineado rojo bajo los ojos
  torso: (p, c, h) => {
    caja(p, 0, 0, 8, h, L.negro); p(0, h - 1, 8, 1, som(L.negro, 0.7))
    caja(p, 0, 0, 3, 3, '#14121c'); caja(p, 5, 0, 3, 3, '#14121c') // hombreras negras
    if (c.vista === 'frente') { p(3, 0, 2, 1, som(L.piel, 0.85)); p(3, 1, 2, 1, L.rojo); p(2, 2, 1, 1, L.rojo); p(5, 2, 1, 1, L.rojo); p(3, 4, 2, 3, '#3a3650') } else p(2, 0, 4, 1, L.rojo)
    p(0, h - 3, 8, 2, L.blanco); p(0, h - 3, 8, 1, luz(L.blanco, 0.1)); p(0, h - 1, 8, 1, som(L.blanco, 0.7)) // chaqueta corta
  },
  brazo: { manga: L.blanco, mano: L.piel, hr: 2, manga2: '#8a90d8' },
  pierna: { pant: '#4e4a68', bota: '#1e1c28', corto: [L.blanco, 3] },
})

// ── Kiwi: media melena rubia con flequillo recto, mascarilla rosa, mono rojo con correas negras y brazalete blanco ──
const K = { rojo: '#c84a62', negro: '#3c2e3a', piel: '#ecd6ec', mask: '#f77cb8' }
const kiwi: Quien = persona({
  cab: [10, 11], tor: [8, 10], bra: [3, 9], pie: [4, 9], piel: K.piel,
  cara: { iris: '#f0d438', ceja: '#a07c58', sinBoca: true, sinNariz: true },
  pelo: { y0: -1, pal: { o: '#7a4a30', h: '#f6d2a2', d: '#dca06e', l: '#ffe8c4' }, filas: [
    '.oooooooo.', 'ohhhhhhhho', 'ohlllhhhho', 'ohhhhhhhho', 'ohhhhhhhho', 'ohooooooho', 'oh......ho', 'oh......ho', 'oh......ho', 'od......do', 'od......do'] },
  espalda: '#f6d2a2',
  extra: (p, c) => { // mascarilla rosa con rejillas oscuras
    caja(p, 2, 7, 6, 4, K.mask); p(3, 8, 2, 1, '#5a1a40'); p(5, 9, 2, 1, '#5a1a40'); p(1, 8, 1, 1, '#c84a8a'); p(8, 8, 1, 1, '#c84a8a')
    if (c.humor === 't') p(2, 6 + c.k, 1, 1, '#8fd3ff')
  },
  torso: (p, c, h) => {
    caja(p, 0, 0, 8, h, K.rojo); p(0, h - 1, 8, 1, som(K.rojo, 0.7))
    p(1, 0, 1, h - 2, K.negro); p(6, 0, 1, h - 2, K.negro)
    if (c.vista === 'frente') { p(3, 0, 2, 2, som(K.piel, 0.8)); p(2, 4, 4, 1, som(K.rojo, 0.8)); p(0, h - 3, 8, 1, K.negro) } else p(2, 2, 4, 3, som(K.rojo, 0.86))
  },
  brazo: { manga: K.rojo, mano: K.piel, hr: 3, manga2: '#e8f8ff' },
  pierna: { pant: K.rojo, bota: '#2c2430', franja: K.negro },
})

// ── Maine: enorme, cresta blanca, gafas negras con luz roja, bufanda roja, chaqueta negra con discos rojos, manos cromadas ──
const M = { piel: '#8e5c40', negro: '#2a2e2e', rojo: '#a01e16', anillo: '#e04248' }
const maine: Quien = persona({
  cab: [12, 11], tor: [12, 11], bra: [4, 10], pie: [5, 9], bar: 3, ts: 10, piel: M.piel,
  cara: { iris: '#2a1a14', ceja: '#3a2218', sinCeja: true, boca: '#4a2418', blanco: '#e8d8c0' },
  pelo: { y0: -4, pal: { o: '#3a2418', h: '#f6ecc4', l: '#fffbe4', d: '#cfc08a', b: '#5e3c2a' }, filas: [
    '...ohllho...', '...ohhlho...', '..ohhhlhho..', '..ohhlhhdo..', 'obbohhlhdbbo', 'obbohhhhdbbo', 'obbbohhdbbbo'] },
  espalda: '#5e3c2a',
  extra: (p) => { // gafas de visor negro con luz roja y perilla clara
    p(1, 5, 10, 2, '#16181c'); p(1, 5, 10, 1, '#3a3e46'); p(8, 5, 1, 2, '#e8303a')
    p(4, 9, 4, 2, '#d8c690'); p(5, 10, 2, 1, '#b8a468')
  },
  torso: (p, c, h) => {
    caja(p, 0, 0, 12, h, M.negro); p(0, h - 1, 12, 1, som(M.negro, 0.7))
    if (c.vista === 'espalda') { p(2, 0, 8, 3, M.rojo); p(3, 4, 6, 1, '#8a8f92'); return }
    p(3, 0, 6, h - 1, M.piel); p(2, 0, 8, 3, M.rojo); p(3, 0, 6, 1, som(M.rojo, 0.7)) // pecho al aire y bufanda
    p(3, 3, 1, h - 3, som(M.piel, 0.78)); p(8, 3, 1, h - 3, som(M.piel, 0.78)); p(1, 0, 1, h - 1, '#8a8f92'); p(10, 0, 1, h - 1, '#8a8f92') // solapas con ribete gris
    for (const [x, y] of [[4, 5], [6, 5], [4, 7], [6, 7]] as const) p(x, y, 2, 1, '#1c1210') // rendijas del pecho
  },
  brazo: { manga: M.negro, mano: CROMO, hr: 3, manga2: M.anillo },
  pierna: { pant: '#28282e', bota: '#14141a' },
})

// ── Rebecca: diminuta, coletas turquesa con orejeras negras y lima, ojos rosa enormes, chaqueta azul marino enorme, rosa por dentro ──
const RB = { piel: '#eaf6fc', jac: '#2e3a6a', rosa: '#f25a98', lima: '#a0e030' }
const tail = (p: P, x: number, dir: -1 | 1) => { // coleta: cuña que baja y se afila; contorno oscuro al borde exterior
  const ws = [2, 3, 3, 3, 3, 3, 3, 2, 1]
  ws.forEach((w, i) => {
    const y = 2 + i, xx = dir < 0 ? x - w + 1 : x
    p(xx, y, w, 1, i > 5 ? '#7ccab8' : '#b8f2dc'); p(dir < 0 ? xx - 1 : xx + w, y, 1, 1, '#1d5450'); if (i > 1 && i < 8) p(dir < 0 ? xx : xx + w - 1, y, 1, 1, '#7ccab8')
  })
}
const rebecca: Quien = persona({
  cab: [10, 10], tor: [8, 7], bra: [4, 7], pie: [3, 5], piel: RB.piel, ts: 7,
  cara: { y: 5, alto: 3, iris: '#d82a8c', blanco: '#d82a8c', sinCeja: true, boca: '#8a5ac8' },
  fuera: (p) => { tail(p, -1, -1); tail(p, 10, 1) },
  pelo: { y0: -2, pal: { o: '#1d5450', h: '#b8f2dc', d: '#7ccab8', k: '#1c1d36', g: RB.lima }, filas: [
    '.kg....gk.', '.oooooooo.', 'ohhhhhhhho', 'ohdhhhhdho', 'oh.hhhh.ho', 'oh......ho', 'oh......ho'] },
  espalda: '#b8f2dc',
  extra: (p) => { p(1, 7, 1, 1, '#5aa8d8'); p(8, 7, 1, 1, '#5aa8d8') }, // tatuajes de mejilla
  torso: (p, c, h) => {
    caja(p, 0, 0, 8, h, RB.jac); p(0, h - 1, 8, 1, som(RB.jac, 0.7))
    if (c.vista === 'frente') { p(2, 0, 4, 4, RB.rosa); p(3, 0, 2, 1, RB.piel); p(1, 0, 1, h - 2, '#1e2650'); p(6, 0, 1, h - 2, '#1e2650'); p(3, 2, 2, 1, '#ff98c4') } else { p(1, 1, 6, 1, '#1e2650'); p(3, 3, 2, 2, RB.lima) }
  },
  brazo: { manga: RB.jac, mano: RB.piel, hr: 2, manga2: RB.lima },
  pierna: { pant: RB.piel, bota: '#222850', corto: [RB.piel, 2], franja: RB.lima },
})

// ── Pilar: corpulento, púas de pelo verde oscuro, visor naranja, barba azul oscura, piel gris, brazos cromados, chaleco negro ──
const PL = { piel: '#cdd6d2', negro: '#1e2024', visor: '#f2a22e' }
const pilar: Quien = persona({
  cab: [12, 11], tor: [12, 10], bra: [4, 10], pie: [5, 9], bar: 3, ts: 10, piel: PL.piel,
  cara: { iris: '#2a3a3a', ceja: '#2c4448', sinCeja: true, sinBoca: true, sinNariz: true },
  pelo: { y0: -5, pal: { o: '#0c1618', h: '#2c4448', l: '#46686e' }, filas: [
    '..o.....o...', '..oo..o.oo..', '.ohhoohhhho.', 'ohhhhhhhhllo', 'ohhhlhhhhhho', 'ohhhhhhhhhho', 'ohhhhhhhhhho', 'ohhhhhhhhhho', 'ohh......hho'] },
  espalda: '#2c4448',
  extra: (p, c) => { // visor naranja, placas en las orejas y barba
    p(1, 4, 10, 2, '#1c2230'); p(2, 4, 8, 1, PL.visor); p(2, 5, 8, 1, som(PL.visor, 0.75)); p(1, 6, 10, 1, som(PL.piel, 0.82)); p(10, 6, 1, 3, '#f0c88a'); p(1, 6, 1, 2, '#f0c88a')
    caja(p, 2, 7, 8, 4, '#3c4e72'); p(4, 9, 4, 1, c.humor === 't' ? '#1c2a44' : '#d88a8a')
  },
  torso: (p, c, h) => {
    caja(p, 0, 0, 12, h, PL.negro); p(0, h - 1, 12, 1, som(PL.negro, 0.7))
    if (c.vista === 'frente') { p(4, 0, 4, h - 1, PL.piel); p(4, 0, 1, h - 1, som(PL.piel, 0.7)); p(2, 0, 2, 4, '#3a3e46'); p(8, 0, 2, 4, '#3a3e46'); p(5, 4, 2, 1, '#8a9a9a'); p(2, 6, 1, 1, '#8a8f92') } else p(5, 5, 2, 2, '#3a3e46')
  },
  brazo: { mano: CROMO, metal: true, hr: 3 },
  pierna: { pant: '#252a32', bota: '#101216' },
})

// ── Dorio: alto y delgado, pelo rubio pálido con puntas menta sobre un ojo, ojo azul, marcas cian, chaqueta negra con forro azul, manos cromadas ──
const DO = { piel: '#f6e2d4', negro: '#1c2230', azul: '#5a78d8' }
const dorio: Quien = persona({
  cab: [10, 11], tor: [8, 10], bra: [3, 10], pie: [3, 10], piel: DO.piel,
  cara: { iris: '#3a7ae0', ceja: '#c8b868', ojos: 'izq', boca: '#c88a80' },
  pelo: { y0: -3, pal: { o: '#5a4a24', h: '#f6f1b2', d: '#dcd486', m: '#8ad8bc', l: '#fffbd8' }, filas: [
    '..oooooo..', '.ohhhlhhoo', 'ohhhhhhhho', 'ohhllhhhho', 'ohhhhhhhho', 'ohhhhhhhho', 'oh...hhhho', 'oh....hhho', 'o.....hhho', 'o.....hmmo', 'o......mmo'] },
  espalda: '#f6f1b2',
  extra: (p) => { p(1, 7, 1, 2, '#44e0d8'); p(2, 9, 2, 1, '#44e0d8') }, // marcas de cibernética en la mejilla
  torso: (p, c, h) => {
    caja(p, 0, 0, 8, h, DO.negro); p(0, h - 1, 8, 1, som(DO.negro, 0.6))
    if (c.vista === 'frente') { p(2, 0, 4, h - 1, DO.azul); p(3, 0, 2, h - 1, DO.piel); p(2, 0, 1, h - 1, '#3a52b0'); p(5, 0, 1, h - 1, '#3a52b0'); for (let y = 2; y < h - 1; y += 2) { p(0, y, 2, 1, '#2c3448'); p(6, y, 2, 1, '#2c3448') } } else for (let y = 1; y < h - 1; y += 2) p(1, y, 6, 1, '#2c3448')
  },
  brazo: { manga: DO.negro, mano: CROMO_OSC, hr: 3, manga2: DO.azul },
  pierna: { pant: '#1c1e2c', bota: '#0e0e14' },
})

// ── Falco: veterano de pelo oscuro con sienes grises, patillas largas, bigotón, túnica crema, chaleco marrón ──
const F = { piel: '#dca47a', chaleco: '#7a3a28', crema: '#ece4cc' }
const falco: Quien = persona({
  cab: [10, 11], tor: [8, 10], bra: [3, 9], pie: [4, 9], piel: F.piel,
  cara: { iris: '#3a2418', ceja: '#2a1c16', sinBoca: true },
  pelo: { y0: -2, pal: { o: '#1c1410', h: '#3a2c26', g: '#8c8896' }, filas: [
    '.oooooooo.', 'ohhhhhhhho', 'ohhhhhhhho', 'ohhhhhhhho', 'ohhhhhhhho', 'ogh....hgo', 'oh......ho', 'oh......ho', 'oh......ho'] },
  espalda: '#3a2c26',
  extra: (p, c) => { p(2, 9, 6, 1, '#1c1410'); p(1, 9, 1, 1, '#1c1410'); p(8, 9, 1, 1, '#1c1410'); p(3, 10, 2, 1, som(F.piel, 0.6)); if (c.humor === 't') p(4, 10, 2, 1, '#1c1410') }, // bigote
  torso: (p, c, h) => {
    caja(p, 0, 0, 8, h, F.chaleco); p(0, h - 1, 8, 1, som(F.chaleco, 0.7))
    if (c.vista === 'frente') { p(2, 0, 4, h - 1, F.crema); p(2, 0, 1, h - 1, som(F.crema, 0.85)); p(3, 0, 2, 1, som(F.piel, 0.84)); p(3, 3, 2, 1, '#4a3a28'); p(3, 5, 2, 1, '#4a3a28') } else { p(1, 0, 6, 1, F.crema); p(2, 2, 4, 1, som(F.chaleco, 0.8)) }
  },
  brazo: { manga: '#8a8a70', mano: F.piel, hr: 3, manga2: '#4a4a3a' },
  pierna: { pant: '#3a3028', bota: '#201810' },
})

// ── Edgerunners anónimos de Night City: cinco estilos según el color guardado (Dorio sale en una de las variantes) ──
const ANON = (a: Aspecto): Quien => {
  const n = mezcla(parseInt(a.camisa.slice(1, 7) || '0', 16), parseInt(a.pelo.slice(1, 7) || '0', 16)) % 5
  if (n === 0) return dorio
  const piel = color(a.piel, '#dcae84'), pelo = color(a.pelo, '#2b1d14'), jac = color(a.camisa, '#e0a526'), pant = color(a.pantalon, '#30364a'), br = color(a.brillo, '#4fe3f0')
  const pal = { o: som(pelo, 0.4), h: pelo, l: luz(pelo, 0.22), i: br }
  const cuerpo = (cuello: string) => (p: P, c: Ctx, h: number) => {
    caja(p, 0, 0, 8, h, jac); p(0, h - 1, 8, 1, som(jac, 0.7))
    if (c.vista === 'frente') { p(2, 1, 4, h - 2, '#26232e'); p(1, 0, 1, 4, cuello); p(6, 0, 1, 4, cuello); p(3, 0, 2, 1, som(piel, 0.82)); p(3, 3, 2, 1, br) } else { p(1, 0, 6, 2, cuello); p(2, 3, 4, 1, br) }
  }
  const base = { cab: [10, 11] as [number, number], tor: [8, 10] as [number, number], bra: [3, 9] as [number, number], pie: [4, 9] as [number, number], piel, brazo: { manga: jac, mano: piel, hr: 3 }, pierna: { pant, bota: '#1e1c24', franja: br } }
  if (n === 1) return persona({ ...base, cara: { iris: '#4a3020', ceja: som(pelo, 0.9) }, torso: cuerpo(som(jac, 0.8)), // púas con implante
    pelo: { y0: -4, pal, filas: ['....oo....', '.o..ohho..', '.ohooohhho', 'ohhhhhhhho', 'ohhlllhhho', 'ohhhhhhhho', 'oh.hhhhhho', 'oh......io', 'o.......io'] } })
  if (n === 2) return persona({ ...base, cara: { iris: br, ceja: som(pelo, 0.9) }, torso: cuerpo(luz(jac, 0.2)), // capucha y visor de neón
    pelo: { y0: -2, pal: { ...pal, h: som(jac, 0.9), l: luz(jac, 0.2), o: som(jac, 0.42) }, filas: ['.oooooooo.', 'ohhhhhhhho', 'ohlllhhhho', 'ohhhhhhhho', 'ohhhhhhhho', 'oh......ho', 'oh......ho'] },
    extra: (p) => { p(1, 5, 8, 2, '#10131c'); p(2, 5, 6, 1, br); p(2, 6, 6, 1, som(br, 0.6)) } })
  if (n === 3) return persona({ ...base, cara: { iris: '#3a2418', ceja: som(pelo, 0.9) }, torso: cuerpo('#8a909c'), // cresta teñida con el brillo
    pelo: { y0: -4, pal: { o: som(br, 0.35), h: br, l: luz(br, 0.3), b: pelo }, filas: ['....oo....', '...ohho...', '...ohlho..', '..ohhlhho.', 'obboohhoob', 'obbbohhbbo'] } })
  return persona({ ...base, cara: { iris: '#3a2a50', ceja: som(pelo, 0.9) }, torso: cuerpo('#c8ccd6'), // melena larga
    pelo: { y0: -1, pal, filas: ['.oooooooo.', 'ohhhhhhhho', 'ohlllhhhho', 'ohhhhhhhho', 'ohooooooho', 'oh......ho', 'oh......ho', 'oh......ho', 'oh......ho', 'oh......ho'] }, espalda: pelo })
}

const kit = (nombre: string, q: (a: Aspecto) => Quien, usa: KitPixel['usa'], dur = 0.7): KitPixel => ({ nombre, usa, pintar: pintarDe(q), ritmos: RIT(dur) })
const TODO: KitPixel['usa'] = ['camisa', 'pantalon', 'brillo', 'pelo', 'piel']

export const reparto: Reparto = {
  kits: {
    david: kit('David Martinez', david, ['brillo']),
    lucy: kit('Lucy', () => lucy, []),
    kiwi: kit('Kiwi', () => kiwi, []),
    maine: kit('Maine', () => maine, [], 0.85),
    rebecca: kit('Rebecca', () => rebecca, [], 0.5),
    pilar: kit('Pilar', () => pilar, [], 0.85),
    falco: kit('Falco', () => falco, []),
    dorio: kit('Dorio', () => dorio, [], 0.8),
    fondo: kit('Edgerunner de Night City', ANON, TODO),
    netrunner: kit('Edgerunner de Night City', ANON, TODO), // la clase «netrunner» de personajes.ts apunta aquí
  },
  quien: {
    yo: 'david', 'rol:analisis-plan': 'lucy', 'rol:revision-qa': 'kiwi', 'rol:implementacion': 'maine',
    'rol:diseno': 'rebecca', 'rol:docs-entrega': 'falco', 'rol:integracion': 'pilar', fondo: 'fondo',
  },
}
