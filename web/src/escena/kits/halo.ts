// Reparto del tema «halo»: pixel art sobre el motor humanoide compartido (pixel.ts), con los diseños del universo Halo.
// Cada personaje aporta sus piezas: cabeza y torso como rejillas de caracteres (1 carácter = 1 píxel, paleta por letra),
// brazos y piernas por tramos (`miembro`: contorno oscuro, rampa de 3 tonos y costuras). Los detalles firma (visor del Jefe,
// azul de Cortana, ojo de Spark, oro del Arbiter) son fijos; la armadura de los Spartan y la ropa se tiñen con lo guardado.
import { color, type KitPixel, type Pieza, type Reparto, type Ritmo } from '../rig'
import type { Aspecto, Pose } from '../sprites'
import { at, bloque, cuenco, estado, luz, mapa, pintarDe, PROP, puntos, RIT, som, zeta, type P, type Quien } from './pixel'

const canal = (h: string, s: number) => (parseInt(h.slice(1), 16) >> s) & 255
/** Mezcla de a hacia b (t = cuánto de b). */
const mix = (a: string, b: string, t: number) => `#${[16, 8, 0].map((s) => Math.round(canal(a, s) * (1 - t) + canal(b, s) * t).toString(16).padStart(2, '0')).join('')}`
const hash = (s: string) => [...s].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 7)
const LAGRIMA = '#8fd3ff', SILLA = '#4a5560'

/** Pinta una rejilla: '.' es transparente, cada letra se busca en la paleta; agrupa tramos iguales. */
function dib(p: P, x: number, y: number, filas: string[], pal: Record<string, string>) {
  filas.forEach((f, j) => {
    for (let i = 0; i < f.length;) {
      const ch = f[i]
      let k = i
      while (k < f.length && f[k] === ch) k++
      if (ch !== '.' && pal[ch]) p(x + i, y + j, k - i, 1, pal[ch])
      i = k
    }
  })
}
/** Torso más bajo que la rejilla (sentado): se quitan filas del medio y se conserva el borde de abajo. */
const corte = (f: string[], h: number) => (h >= f.length ? f : [...f.slice(0, h - 1), f[f.length - 1]])
const parpadeo = (f: string[], c: { ojos: 'a' | 'c' }, de = /[wi]/g, a = 'l') => (c.ojos === 'c' ? f.map((s) => s.replace(de, a)) : f)

interface Tr { k: string; h?: number }
/** Miembro de w px de ancho: tramos de color (uno con altura libre), contorno oscuro, luz a la izquierda y sombra a la derecha. */
function miembro(p: P, w: number, len: number, segs: Tr[], arriba = false) {
  const hs = segs.map((s) => s.h ?? 0), libre = segs.findIndex((s) => s.h === undefined)
  if (libre >= 0) hs[libre] = Math.max(1, len - hs.reduce((a, b) => a + b, 0))
  for (let i = 0; hs.reduce((a, b) => a + b, 0) > len && i < 40; i++) { const j = hs.findIndex((h, n) => h > 1 && n !== libre); if (j < 0) break; hs[j]-- }
  const orden = segs.map((s, i) => ({ k: s.k, h: hs[i] }))
  if (arriba) orden.reverse()
  let y = 0
  orden.forEach((s, si) => {
    const ol = som(s.k, 0.42)
    for (let j = 0; j < s.h && y < len; j++, y++) {
      if (y === 0 || y === len - 1) { p(1, y, w - 2, 1, ol); continue }
      p(0, y, 1, 1, ol); p(w - 1, y, 1, 1, ol)
      if (j === 0 && si > 0) { p(1, y, w - 2, 1, som(s.k, 0.7)); continue }
      p(1, y, w - 2, 1, s.k); p(1, y, 1, 1, luz(s.k, 0.14)); p(w - 2, y, 1, 1, som(s.k, 0.8))
    }
  })
}

// ───────────── Spartan: el Jefe Maestro (verde MJOLNIR, visor dorado) y los Spartan genéricos ─────────────
const CASCO = ['..OOOO..', '.OLLggSO', 'OLggggSO', 'OyyYYYuO', 'OYYYYYuO', 'OKggggKO', '.OgKKgO.', '..OOOO..']
const CASCO_ESP = ['..OOOO..', '.OLLggSO', 'OLggggSO', 'OLggggSO', 'OgggggSO', 'OgSggSgO', '.OgKKgO.', '..OOOO..']
const PECHO = ['OLLKKKKgSO', 'OLLLggggSO', 'OLgggggSSO', 'OgggSSgggO', 'OgSKKKKSgO', 'OKMKMKMKKO', 'OKKMKKMKKO', 'OgLLggLLgO', 'OOOOOOOOOO']
const ESPALDA = ['OLLggggSSO', 'OLLLggggSO', 'OLgSSSSgSO', 'OggSKKSggO', 'OgSSKKSSgO', 'OKMKMKMKKO', 'OKKMKKMKKO', 'OgLLggLLgO', 'OOOOOOOOOO']

const spartan = (jefe: boolean) => (a: Aspecto): Quien => {
  const v = jefe ? 0 : hash(a.pelo + a.piel) % 4
  const V = jefe ? '#688a3e' : mix(color(a.camisa, '#336fc6'), '#4a5258', 0.25)
  const K = jefe ? '#232a2b' : mix('#1c2124', color(a.pantalon, '#30364a'), 0.3)
  const Y = jefe ? '#f0a818' : color(a.brillo, '#ffd84a')
  const pal = { O: som(V, 0.38), L: luz(V, 0.3), g: V, S: som(V, 0.72), K, M: luz(K, 0.2), Y, y: luz(Y, 0.55), u: som(Y, 0.55) }
  const frente = [...CASCO]
  if (v === 1) { frente[3] = 'OgyYYYgO'; frente[4] = 'OgYYYugO' }
  if (v === 2) frente[1] = '.OLLLgSO'
  if (v === 3) { frente[0] = '..OLLO..'; frente[5] = 'OKKggKKO'; frente[6] = '.OKKKKO.' }
  const mejilla = som(V, 0.6)
  return {
    cab: [8, 8], tor: [10, 9], bra: [5, 9], pie: [5, 9], bar: 2, silla: SILLA,
    agarre: (yt) => [-7, yt + 7],
    cabeza: (p, c) => {
      const esp = c.vista === 'espalda', apagado = c.ojos === 'c'
      if (v === 2) p(3, -1, 2, 1, pal.O)
      dib(p, 0, 0, esp ? CASCO_ESP : parpadeo(frente, c, /[yY]/g, 'u'), pal)
      if (!esp && !apagado) p(1, 3, 1, 1, pal.y)
      if (!esp && c.humor === 't') p(0, 5 + c.k, 1, 1, LAGRIMA)
      if (!jefe && !esp) p(v === 3 ? 3 : 2, 1, 2, 1, mejilla)
    },
    torso: (p, c, h) => dib(p, 0, 0, corte(c.vista === 'frente' ? PECHO : ESPALDA, h), pal),
    brazo: (p, len, _l, arriba) => miembro(p, 5, len, [{ k: luz(V, 0.12), h: 4 }, { k: K, h: 1 }, { k: V }, { k: K, h: 2 }], arriba),
    pierna: (p, len) => miembro(p, 5, len, [{ k: V, h: 3 }, { k: K, h: 1 }, { k: luz(V, 0.12), h: 2 }, { k: V }, { k: som(V, 0.8), h: 2 }]),
  }
}

// ───────────── Cortana: holograma azul translúcido, pelo violeta con circuitos ─────────────
const cortana = (_a: Aspecto): Quien => {
  const B = 'rgba(70,185,245,.9)', Bl = 'rgba(150,228,255,.92)', Bs = 'rgba(38,120,215,.92)', C = '#e2fdff', O = '#2a35b8'
  const pal = { O, H: 'rgba(124,98,255,.92)', h: 'rgba(168,150,255,.95)', d: 'rgba(78,58,205,.95)', c: C, f: 'rgba(158,236,255,.92)', E: '#10205e', m: '#6a5cff', b: B, L: Bl, s: Bs }
  const CAB = ['..OOOO..', '.OhhHHdO', 'OhHHcHdO', 'OHffffdO', 'OHEffEdO', 'OHfmmfdO', '.OHffdO.', '..OOOO..']
  const CAB_ESP = ['..OOOO..', '.OhhHHdO', 'OhHcHHdO', 'OHcHHcdO', 'OHHcHHdO', 'OHcHHcdO', '.OHcHdO.', '..OOOO..']
  const TOR = ['obLLbo', 'obcbbo', 'obccbo', 'obbcbo', 'oLbcbo', 'obbbso', '.obso.', '.oooo.']
  const TOR_ESP = ['obLLbo', 'obbcbo', 'obcbbo', 'obccbo', 'oLbcbo', 'obbbso', '.obso.', '.oooo.']
  return {
    cab: [8, 8], tor: [6, 8], bra: [3, 8], pie: [3, 9], bar: 3, solape: 0, silla: SILLA,
    agarre: (yt) => [-5, yt + 6],
    cabeza: (p, c) => {
      const esp = c.vista === 'espalda'
      dib(p, 0, 0, esp ? CAB_ESP : parpadeo(CAB, c, /E/g, 'd'), pal)
      if (!esp && c.humor === 't') { p(1, 4 + c.k, 1, 1, LAGRIMA); p(3, 5, 2, 1, pal.d) }
    },
    torso: (p, c, h) => dib(p, 0, 0, corte(c.vista === 'frente' ? TOR : TOR_ESP, h), pal),
    brazo: (p, len, lado, arriba) => {
      const x = lado === 'i' ? [0, 1, 2] : [2, 1, 0], y = arriba ? 0 : len - 1
      p(x[0], 0, 1, len, O); p(x[1], 0, 1, len, Bl); p(x[2], 0, 1, len, Bs)
      p(x[1], Math.min(len - 1, arriba ? 3 : 2), 1, 1, C); p(x[1], y, 2, 1, C); p(x[0], y, 1, 1, Bl)
    },
    pierna: (p, len, lado) => {
      const x = lado === 'i' ? [0, 1, 2] : [2, 1, 0]
      p(x[0], 0, 1, len, O); p(x[1], 0, 1, len, Bl); p(x[2], 0, 1, len, Bs)
      p(x[1], 2, 1, 1, C); p(x[1], len - 4, 1, 1, C); p(0, len - 1, 3, 1, C); p(-1, len, 5, 1, 'rgba(160,240,255,.4)')
    },
  }
}

// ───────────── 343 Guilty Spark: esfera flotante de un solo ojo (no usa el motor humanoide) ─────────────
const disco = (r: P, cx: number, cy: number, rad: number, k: string) => {
  for (let j = 0; j < rad * 2; j++) { const hw = Math.round(Math.sqrt(rad * rad - (j - rad + 0.5) ** 2)); r(cx - hw, cy - rad + j, hw * 2, 1, k) }
}
function spark(r: P, pz: Pieza, f: number) {
  const a = pz.aspecto, pose = pz.pose, esp = pz.vista === 'espalda', e = estado(pose, f)
  const acc = mix('#7f93a0', color(a.camisa, '#336fc6'), 0.4), OL = '#2c3640', M = '#aab6be', S = '#7a8892', Lz = '#dbe3e8'
  const cerrado = pose === 'duerme' || e.ojos === 'c', triste = pose === 'triste'
  const dy = pose === 'duerme' ? 3 : triste ? 2 : 0, cy = (esp ? -21 : -17) + dy, cx = e.hx
  if (esp) { // silla de acero detrás
    bloque(r, -7, -13, 14, 11, SILLA); r(-7, -13, 14, 1, luz(SILLA)); r(-1, -2, 2, 1, '#2b2b30'); r(-5, -1, 10, 1, '#2b2b30'); r(-5, 0, 2, 1, '#14100b'); r(3, 0, 2, 1, '#14100b')
  } else { r(-4, -1, 8, 1, 'rgba(0,0,0,.28)'); r(-2, 0, 4, 1, 'rgba(0,0,0,.2)') }
  // paneles laterales: se levantan al saludar, tecleo alterno al estar sentado
  const t = pose === 'teclea' ? [[0, 1], [1, 0], [0, 1], [1, 0]][f % 4] : [0, 0]
  const panel = (lado: -1 | 1, dyp: number) => {
    const x = lado < 0 ? cx - 12 : cx + 10, y = cy - 4 + dyp + (triste || pose === 'duerme' ? 1 : 0)
    r(x, y, 3, 8, OL); r(x + 1, y + 1, 1, 6, luz(acc, 0.35)); r(x + (lado < 0 ? 2 : 1), y + 1, 1, 6, acc); r(x + 1, y + 3, 1, 2, '#38b8ff')
    r(lado < 0 ? x + 3 : x - 1, y + 3, 1, 2, '#6b7d88')
  }
  panel(-1, t[0] + (e.modo === 'entrega' ? 1 : 0)); panel(1, t[1] - (e.modo === 'mano' ? 3 + e.onda : 0))
  disco(r, cx, cy, 8, OL); disco(r, cx, cy, 7, S); disco(r, cx - 1, cy - 1, 6, M); disco(r, cx - 3, cy - 3, 3, Lz); r(cx - 4, cy - 5, 2, 1, '#fff')
  r(cx - 1, cy + 6, 4, 1, som(S, 0.8))
  if (esp) { // espalda: franja central y piloto de estado que parpadea
    r(cx - 1, cy - 7, 2, 14, acc); r(cx - 5, cy + 1, 3, 1, S); r(cx + 2, cy + 1, 3, 1, S); r(cx + 3, cy - 5, 1, 1, f % 2 ? '#38b8ff' : '#1a5a80')
  } else if (cerrado) { r(cx - 4, cy - 1, 8, 1, '#10202b'); r(cx - 3, cy, 6, 1, S) } else {
    disco(r, cx, cy, 5, '#10202b'); disco(r, cx, cy, 4, '#2fa8f0'); disco(r, cx + 0, cy + 1, 3, '#7ad4ff'); r(cx - 1, cy - 1, 2, 2, '#06222f'); r(cx - 2, cy - 3, 2, 1, '#fff')
    if (triste) { r(cx - 5, cy - 5, 10, 2, M); r(cx - 4, cy - 3, 8, 1, S); r(cx - 6, cy + 1 + e.k, 1, 1, LAGRIMA) }
  }
  if (e.modo === 'entrega') mapa(at(r, cx - 4, cy + 9), 8)
  if (e.modo === 'cafe') cuenco(at(r, 8 - 3 * e.k, cy + 3 - 2 * e.k), f)
  if (pose === 'duerme') zeta(r, 8, cy - 8, f)
  if (pose === 'espera') puntos(r, 8, cy - 11, f)
  if (a.rol) PROP[a.rol](at(r, esp ? -11 : -14, esp ? -3 : cy + 13))
}
const SPARK_RIT: Partial<Record<Pose, Ritmo>> = {
  parado: { cuadros: 4, dur: 0.8, vaiven: 'flota' }, camina: { cuadros: 4, dur: 0.6, vaiven: 'flota' }, teclea: { cuadros: 4, dur: 0.8 }, espera: { cuadros: 4, dur: 2 },
  mano: { cuadros: 4, dur: 0.6, vaiven: 'flota' }, triste: { cuadros: 2, dur: 3.4, pesos: [10, 1], vaiven: 'suspiro' }, duerme: { cuadros: 3, dur: 2.4, vaiven: 'respira-lenta' },
  entrega: { cuadros: 2, dur: 2.4, pesos: [3, 1], vaiven: 'respira' }, cafe: { cuadros: 4, dur: 2.4, vaiven: 'flota' },
}

// ───────────── Sgt. Johnson: calvo, bigote y puro, chaleco oliva ─────────────
const johnson = (a: Aspecto): Quien => {
  const piel = '#7a4a2e', V = mix('#6b7448', color(a.camisa, '#336fc6'), 0.15), T = '#39432e', pant = mix('#566043', color(a.pantalon, '#30364a'), 0.2)
  const pal = { O: '#26150b', P: '#9b633d', p: piel, q: '#53321e', m: '#1b1410', w: '#f1ece2', i: '#2a1a10', l: '#3a2316', V: luz(V, 0.15), v: V, s: som(V, 0.75), K: T, B: '#2a2420', G: color(a.brillo, '#d9a62b'), t: som(pant, 0.9), r: som(V, 0.85) }
  const CAB = ['..OOOO..', '.OPPppqO', 'OPPppppO', 'OqqppqqO', 'OwippiwO', 'OpmmmmpO', '.OpqqpO.', '..OOOO..']
  const CAB_ESP = ['..OOOO..', '.OPPppqO', 'OPPppppO', 'OpppppqO', 'OpppppqO', 'OqpppqqO', '.OqqqqO.', '..OOOO..']
  const TOR = ['OVvKKvsO', 'OVvKKvsO', 'OVrvvrsO', 'OVrvvrsO', 'OVvvvvsO', 'OVvvvvsO', 'OBBGGBBO', 'OttttttO', 'OOOOOOOO']
  return {
    cab: [8, 8], tor: [8, 9], bra: [4, 9], pie: [4, 9], bar: 2, silla: SILLA,
    agarre: (yt) => [-6, yt + 7],
    cabeza: (p, c) => {
      const esp = c.vista === 'espalda'
      dib(p, 0, 0, esp ? CAB_ESP : parpadeo(CAB, c), pal)
      if (esp) return
      if (c.humor === 't') { p(1, 3, 2, 1, pal.O); p(5, 3, 2, 1, pal.O); p(0, 5 + c.k, 1, 1, LAGRIMA); p(3, 6, 2, 1, pal.m) } else { p(4, 6, 4, 1, '#8a5a30'); p(8, 6, 1, 1, '#ff7a2e'); p(5, 6, 1, 1, '#b9854e') }
    },
    torso: (p, c, h) => dib(p, 0, 0, corte(c.vista === 'frente' ? TOR : TOR.map((s) => s.replace(/[Kr]/g, 'v')), h), pal),
    brazo: (p, len, _l, arriba) => miembro(p, 4, len, [{ k: T, h: 3 }, { k: piel }], arriba),
    pierna: (p, len) => miembro(p, 4, len, [{ k: pant }, { k: '#1c1a18', h: 2 }]),
  }
}

// ───────────── Dra. Halsey: bata blanca, melena corta oscura y gafas ─────────────
const halsey = (a: Aspecto): Quien => {
  const bata = mix('#eef2f3', color(a.camisa, '#336fc6'), 0.08), pant = mix('#2b3340', color(a.pantalon, '#30364a'), 0.3), piel = '#e2b48f'
  const pal = { O: '#1d1210', h: '#4a382d', H: '#6b5444', F: piel, s: '#c48f6c', g: '#b4bfcb', i: '#1a2030', m: '#a8504a', c: bata, C: '#ffffff', d: som(bata, 0.82), t: '#2f6f80', p: som(bata, 0.9), l: '#1a2030', G: '#9a948c' }
  const CAB = ['..OOOOO..', '.OhHHHhO.', 'OhHhhhhhO', 'OhFFFFFhO', 'OhgigighO', 'OhFFsFFhO', 'OhFFmFFhO', 'OhhFFFhhO', '.OOOOOOO.']
  const CAB_ESP = ['..OOOOO..', '.OhHHHhO.', 'OhHhhhhhO', 'OhhhhhhhO', 'OhhHhhhhO', 'OhhhhhhhO', 'OhhhhhhhO', 'OhhhhhhhO', '.OOOOOOO.']
  const TOR = ['OCcttcdO', 'OcctTcdO', 'OcCttcdO', 'OcpttcdO', 'OccttcdO', 'OcccccdO', 'OcccccdO', 'OddddddO', 'OOOOOOOO']
  return {
    cab: [9, 9], tor: [8, 9], bra: [4, 9], pie: [4, 9], bar: 2, silla: SILLA,
    agarre: (yt) => [-6, yt + 7],
    cabeza: (p, c) => {
      const esp = c.vista === 'espalda'
      dib(p, 0, 0, esp ? CAB_ESP : parpadeo(CAB, c, /i/g, 'g'), pal)
      if (!esp && c.humor === 't') { p(3, 6, 3, 1, pal.s); p(1, 5 + c.k, 1, 1, LAGRIMA) }
      if (!esp) { p(2, 1, 1, 1, pal.G); p(3, 2, 1, 1, pal.G) }
    },
    torso: (p, c, h) => dib(p, 0, 0, corte(c.vista === 'frente' ? TOR.map((s) => s.replace('T', 't')) : TOR.map((s) => s.replace(/[tT]/g, 'c')), h), pal),
    brazo: (p, len, _l, arriba) => miembro(p, 4, len, [{ k: bata }, { k: som(bata, 0.8), h: 1 }, { k: piel, h: 2 }], arriba),
    pierna: (p, len) => miembro(p, 4, len, [{ k: bata, h: 3 }, { k: pant }, { k: '#14161b', h: 2 }]),
  }
}

// ───────────── Cap. Keyes: oficial de la Armada, gorra de plato, uniforme gris azulado y pipa ─────────────
const keyes = (a: Aspecto): Quien => {
  const J = mix('#3a4a64', color(a.camisa, '#336fc6'), 0.06), pant = mix('#222b40', color(a.pantalon, '#30364a'), 0.25), oro = '#d1a640', piel = '#8a5a3a'
  const pal = { O: '#241610', p: piel, P: '#aa7650', q: '#5d3a24', m: '#2a160e', w: '#f1ece2', i: '#2a1a10', l: '#3a2316', c: '#26324a', C: '#3f5074', b: oro, W: '#eef2f3', a: '#10131b', G: '#aab0b8', J: luz(J, 0.14), j: J, s: som(J, 0.7), T: '#14161b', S: som(J, 0.8), K: J, o: '#13182a' }
  const GORRA = ['.oooooooo.', 'OCCcccccco', 'OCccccccco', 'ObbbbbbbbO', 'OaaaaaaaaO'], INSIGNIA = 'ObbbWWbbbO'
  const TOR = ['OJJWWJSO', 'OJJWTWSO', 'OJjjTjSO', 'OJjGTGSO', 'OJjjTjSO', 'OJjGTGSO', 'OJjjTjSO', 'OSSSSSSO', 'OOOOOOOO']
  return {
    cab: [8, 9], tor: [8, 9], bra: [4, 9], pie: [4, 9], bar: 2, silla: SILLA,
    agarre: (yt) => [-6, yt + 7],
    cabeza: (p, c) => {
      const esp = c.vista === 'espalda'
      dib(p, -1, 0, esp ? GORRA : [...GORRA.slice(0, 3), INSIGNIA, GORRA[4]], pal)
      if (esp) { dib(p, 0, 4, ['OGqqqqGO', 'OqqqqqqO', 'OqqqqqqO', '.OqqqqO.', '..OOOO..'], pal); return }
      dib(p, 0, 5, parpadeo(['OwippiwO', 'OppPPppO', '.OpmmpO.', '..OOOO..'], c), pal)
      p(0, 5, 1, 1, pal.G); p(7, 5, 1, 1, pal.G)
      if (c.humor === 't') { p(1, 7 + c.k, 1, 1, LAGRIMA); p(3, 7, 2, 1, pal.q) } else { p(5, 7, 4, 1, '#4a2f1a'); p(8, 6, 2, 2, '#3a2414'); p(8, 6, 1, 1, '#6a4428') }
    },
    torso: (p, c, h) => {
      const f = c.vista === 'frente'
      dib(p, 0, 0, corte(f ? TOR : TOR.map((s) => s.replace(/[WTG]/g, 'J')), h), pal)
      if (f) { p(5, 2, 1, 1, '#c0392b'); p(6, 2, 1, 1, oro) }
    },
    brazo: (p, len, _l, arriba) => miembro(p, 4, len, [{ k: oro, h: 1 }, { k: J }, { k: oro, h: 1 }, { k: piel, h: 2 }], arriba),
    pierna: (p, len) => miembro(p, 4, len, [{ k: pant }, { k: '#14161b', h: 2 }]),
  }
}

// ───────────── El Arbiter: Sangheili alto, mandíbula de cuatro puntas, armadura plata y oro ─────────────
const arbiter = (a: Aspecto): Quien => {
  const S = mix('#b4bdc8', color(a.camisa, '#336fc6'), 0.12), oro = mix('#e0b13a', color(a.brillo, '#ffd84a'), 0.25), piel = '#6c7c8a', K = '#46525e'
  const pal = { O: '#1c2228', h: S, H: luz(S, 0.5), s: som(S, 0.72), G: oro, g: som(oro, 0.7), d: piel, D: K, e: '#ffc400', L: luz(S, 0.5), S, K, B: oro }
  const CAB = ['...OOO...', '..OHGHO..', '.OhHGhhO.', '.OGGGGGgO', 'OeedDdeeO', 'OddDDDddO', '.OdDdDdO.', 'OdOdOdOdO', 'OdOdOdOdO', '.O.O.O.O.']
  const CAB_ESP = ['...OOO...', '..OHGHO..', '.OhHGhhO.', '.OGGGGGgO', 'OhhhGhhhO', 'OhhHGhhsO', '.OhhGhhO.', 'OdDdddDdO', '..OdDdO..', '...OOO...']
  const TOR = ['OLGKKKKGsO', 'OLLLSSSSsO', 'OLSSGGSSsO', 'OLSSGGSSsO', 'OsSSSSSSsO', 'OGGGGGGGGO', 'OKgKKKKgKO', 'OSSsSSsSSO', 'OSsKKKKsSO', 'OsKKKKKKsO', 'OOOOOOOOOO']
  return {
    cab: [9, 10], tor: [10, 11], bra: [4, 12], pie: [5, 11], solape: 1, ts: 9, bar: 2, silla: SILLA,
    agarre: (yt) => [-7, yt + 10],
    cabeza: (p, c) => {
      const esp = c.vista === 'espalda'
      dib(p, 0, 0, esp ? CAB_ESP : parpadeo(CAB, c, /e/g, 'D'), pal)
      if (!esp && c.humor === 't') p(1, 5 + c.k, 1, 1, LAGRIMA)
    },
    torso: (p, c, h) => dib(p, 0, 0, corte(c.vista === 'frente' ? TOR : TOR.map((s) => s.replace(/[GL]/g, 'S').replace(/K/g, 's')), h), pal),
    brazo: (p, len, _l, arriba) => miembro(p, 4, len, [{ k: S, h: 4 }, { k: oro, h: 1 }, { k: piel }, { k: K, h: 2 }], arriba),
    pierna: (p, len) => miembro(p, 5, len, [{ k: S, h: 3 }, { k: oro, h: 2 }, { k: piel }, { k: som(S, 0.8), h: 2 }]),
  }
}

const jefe: KitPixel = { nombre: 'Jefe Maestro', usa: [], pintar: pintarDe(spartan(true)), ritmos: RIT(0.72) }
const fondo: KitPixel = { nombre: 'Spartan', usa: ['camisa', 'pantalon', 'brillo'], pintar: pintarDe(spartan(false)), ritmos: RIT(0.72) }

export const reparto: Reparto = {
  kits: {
    chief: jefe, spartan: fondo,
    cortana: { nombre: 'Cortana', usa: [], pintar: pintarDe(cortana), ritmos: RIT(0.6) },
    spark: { nombre: '343 Guilty Spark', usa: ['camisa'], pintar: (r, pz, f) => spark(r, pz, f), ritmos: SPARK_RIT },
    johnson: { nombre: 'Sgt. Johnson', usa: ['camisa', 'pantalon', 'brillo'], pintar: pintarDe(johnson), ritmos: RIT(0.72) },
    halsey: { nombre: 'Dra. Halsey', usa: ['camisa', 'pantalon'], pintar: pintarDe(halsey), ritmos: RIT(0.72) },
    keyes: { nombre: 'Cap. Keyes', usa: ['camisa', 'pantalon'], pintar: pintarDe(keyes), ritmos: RIT(0.76) },
    arbiter: { nombre: 'El Arbiter', usa: ['camisa', 'brillo'], pintar: pintarDe(arbiter), ritmos: RIT(0.8) },
  },
  quien: {
    yo: 'chief', fondo: 'spartan', 'rol:analisis-plan': 'cortana', 'rol:revision-qa': 'spark', 'rol:implementacion': 'johnson',
    'rol:diseno': 'halsey', 'rol:docs-entrega': 'keyes', 'rol:integracion': 'arbiter',
  },
}
