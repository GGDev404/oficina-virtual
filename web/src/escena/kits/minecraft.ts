// Reparto del tema «minecraft»: sus kits y a quién dibuja cada uno (ver el contrato en rig.ts).
// Pixel art original con la estética de bloques (nada de skins ni texturas oficiales): cabeza cuadrada, cuerpo y extremidades
// rectangulares, rampas de 3 tonos (luz arriba, base, sombra abajo/derecha) y un grano sutil. 1 px lógico = 1 píxel del arte.
// Un motor humanoide (pintarHum) resuelve poses y cuadros; cada personaje solo aporta sus piezas (cabeza, torso, brazo, pierna).
import { color, type KitPixel, type Pieza, type Reparto, type Ritmo } from '../rig'
import type { Aspecto, Pose } from '../sprites'
import { at, bloque, cuenco, estado, mapa, mezcla, pintarDe, PROP, puntos, RIT, som, zeta, type P, type Quien } from './pixel'


// ── Steve y Alex: mismo cuerpo, distinta cabeza y brazos (Alex, más delgados y con coleta) ──
const humano = (alex: boolean) => (a: Aspecto): Quien => {
  const piel = color(a.piel, '#c99572'), pelo = alex ? '#c9692b' : color(a.pelo, '#3a2a1e'), iris = color(a.brillo, '#4b3a8c')
  const camisa = color(a.camisa, alex ? '#4a9a3a' : '#1f9e8f'), pant = color(a.pantalon, alex ? '#6b4a2e' : '#3b3bb5')
  const aw = alex ? 2 : 3, oscuro = som(piel, 0.5), ceja = som(pelo, 0.9)
  return {
    cab: [8, 8], tor: [8, 9], bra: [aw, 9], pie: [4, 8], bar: 2,
    cabeza: (p, c) => {
      bloque(p, 0, 0, 8, 8, piel)
      if (c.vista === 'espalda') { bloque(p, 0, 0, 8, alex ? 8 : 6, pelo); if (!alex) { p(1, 6, 6, 1, som(pelo, 0.8)); p(2, 7, 4, 1, som(piel, 0.85)) } else bloque(p, 3, 8, 2, 4, som(pelo, 0.9)); return }
      bloque(p, 0, 0, 8, 2, pelo); p(0, 2, 1, alex ? 4 : 2, pelo); p(7, 2, 1, alex ? 4 : 2, pelo); p(1, 2, 1, 1, som(pelo, 0.9)); p(6, 2, 1, 1, som(pelo, 0.9))
      if (c.humor === 't') { p(2, 3, 1, 1, ceja); p(5, 3, 1, 1, ceja) } else { p(1, 3, 2, 1, ceja); p(5, 3, 2, 1, ceja) }
      if (c.ojos === 'a') { p(1, 4, 1, 1, '#fff'); p(2, 4, 1, 1, iris); p(5, 4, 1, 1, iris); p(6, 4, 1, 1, '#fff') } else { p(1, 4, 2, 1, oscuro); p(5, 4, 2, 1, oscuro) }
      p(3, 5, 2, 1, som(piel, 0.86))
      if (!alex) { p(1, 6, 6, 1, som(piel, 0.8)); p(2, 7, 4, 1, som(piel, 0.8)) }
      if (c.humor === 't') { p(3, 6, 2, 1, oscuro); p(2, 7, 1, 1, oscuro); p(5, 7, 1, 1, oscuro); p(1, 5 + c.k, 1, 1, '#8fd3ff') } else p(3, 6, 2, 1, alex ? '#a3564a' : som(piel, 0.55))
    },
    torso: (p, c, h) => { bloque(p, 0, 0, 8, h, camisa); if (c.vista === 'frente') p(3, 0, 2, 1, piel); p(0, h - 1, 8, 1, som(camisa, 0.72)) },
    brazo: (p, len, _l, arriba, _c) => {
      const m = Math.min(4, Math.max(1, len - 2)), k = len - m
      if (arriba) { bloque(p, 0, 0, aw, k, piel); bloque(p, 0, k, aw, m, camisa) } else { bloque(p, 0, 0, aw, m, camisa); bloque(p, 0, m, aw, k, piel) }
    },
    pierna: (p, len) => { bloque(p, 0, 0, 4, len - 2, pant); bloque(p, 0, len - 2, 4, 2, '#5a5a62') },
  }
}

// ── Aldeano: nariz grande, cejas unidas, túnica por profesión y brazos cruzados ──
interface Oficio { robe: string; delantal?: string; faja?: string; sombrero?: 'paja' | 'gorra'; raya?: string }
const OFICIOS: Record<string, Oficio> = {
  herrero: { robe: '#7a5a3c', delantal: '#2d2a2e' },
  cartografo: { robe: '#a8875a', faja: '#5a3e24', sombrero: 'gorra' },
  bibliotecario: { robe: '#ebe6d8', raya: '#8a5a34' },
}
const FONDO: Oficio[] = [
  { robe: '#7b5a3a', delantal: '#dcd2b0', sombrero: 'paja' }, // granjero
  { robe: '#7a3a9a' }, // clérigo
  { robe: '#8a6a4a', raya: '#d8cfa8' }, // pastor
  { robe: '#3b7a3b' }, // simplón
]
const aldeano = (oficio: (a: Aspecto) => Oficio, fondo = false) => (a: Aspecto): Quien => {
  const o = oficio(a), piel = color(a.piel, '#b98e6c'), iris = color(a.brillo, '#3a9a4a'), robe = o.robe, manga = som(robe, 0.88), ceja = '#3a2a1f'
  const faja = fondo ? color(a.camisa, '#9b5a3a') : o.faja
  return {
    cab: [8, 9], tor: [8, 13], bra: [3, 8], pie: [3, 2], bar: 2, ts: 10,
    agarre: (yt) => [-6, yt + 8],
    cabeza: (p, c) => {
      bloque(p, 0, 0, 8, 9, piel)
      if (c.vista === 'frente') {
        if (c.humor === 't') { p(2, 2, 4, 1, ceja); p(3, 1, 2, 1, ceja); p(1, 4 + c.k, 1, 1, '#8fd3ff') } else p(1, 2, 6, 1, ceja)
        if (c.ojos === 'a') { p(1, 3, 1, 1, '#fff'); p(2, 3, 1, 1, iris); p(5, 3, 1, 1, iris); p(6, 3, 1, 1, '#fff') } else { p(1, 3, 2, 1, som(piel, 0.5)); p(5, 3, 2, 1, som(piel, 0.5)) }
        bloque(p, 3, 4, 2, 4, som(piel, 0.84))
      }
      if (o.sombrero === 'paja') { bloque(p, -1, 0, 10, 1, '#d9b85a'); bloque(p, 1, -3, 6, 3, '#e8c96a'); p(1, -1, 6, 1, '#a8833a') }
      if (o.sombrero === 'gorra') { bloque(p, 0, -2, 8, 3, '#7b5a36'); p(0, 1, 8, 1, som('#7b5a36', 0.8)) }
    },
    torso: (p, c, h) => {
      bloque(p, 0, 0, 8, h, robe); p(1, 0, 6, 1, som(robe, 0.85))
      if (o.delantal) { bloque(p, 1, 3, 6, h - 4, o.delantal); p(1, 0, 1, 3, o.delantal); p(6, 0, 1, 3, o.delantal) }
      if (o.raya) bloque(p, 3, 0, 2, h - 1, o.raya)
      if (faja) { bloque(p, 0, 8, 8, 2, faja); if (!fondo) p(3, 8, 2, 2, '#d9a62b') }
      p(0, h - 1, 8, 1, som(robe, 0.7))
      if (c.vista === 'frente' && h > 11) p(3, h - 4, 2, 3, som(robe, 0.9))
    },
    brazo: (p, len, _l, arriba) => { if (arriba) { bloque(p, 0, 0, 3, 2, piel); bloque(p, 0, 2, 3, len - 2, manga) } else { bloque(p, 0, 0, 3, len - 2, manga); bloque(p, 0, len - 2, 3, 2, piel) } },
    pierna: (p, len) => bloque(p, 0, 0, 3, len, '#3b2a20'),
    cruce: (p, mitad) => {
      const w = mitad ? 5 : 10
      bloque(p, 0, 0, w, 4, manga); p(0, 0, 1, 4, som(manga, 0.85)); if (!mitad) { p(9, 0, 1, 4, som(manga, 0.85)); bloque(p, 3, 3, 4, 1, piel) } else p(2, 3, 3, 1, piel)
    },
  }
}

// ── Golem de hierro: ancho, brazos hasta las rodillas, nariz larga, enredaderas y grietas ──
const golem = (a: Aspecto): Quien => {
  const hierro = '#cfcfc6', vid = '#4f8a36', vid2 = '#3a6a28', nariz = '#b08a6a', ojo = color(a.brillo, '#f2b33d')
  return {
    cab: [8, 7], tor: [16, 12], bra: [4, 14], pie: [4, 9], solape: 1, ts: 10, bar: 3, agarre: (yt) => [-10, yt + 12],
    cabeza: (p, c) => {
      bloque(p, 0, 0, 8, 7, hierro)
      if (c.vista === 'frente') {
        p(0, 1, 8, 1, '#7e7e78')
        if (c.humor === 't') p(3, 0, 2, 1, '#7e7e78')
        if (c.ojos === 'a') { p(1, 2, 1, 1, '#2a2a2a'); p(2, 2, 1, 1, ojo); p(5, 2, 1, 1, ojo); p(6, 2, 1, 1, '#2a2a2a') } else { p(1, 2, 2, 1, '#555'); p(5, 2, 2, 1, '#555') }
        bloque(p, 3, 3, 2, 4, nariz); p(0, 4, 1, 1, vid)
        if (c.humor === 't') p(1, 4 + c.k, 1, 1, '#8fd3ff')
      } else p(2, 4, 4, 2, som(hierro, 0.85))
    },
    torso: (p, c, h) => {
      bloque(p, 0, 0, 16, Math.min(h, 8), hierro); p(0, 1, 2, 6, som(hierro, 0.9)); p(14, 1, 2, 6, som(hierro, 0.82)); if (h > 8) bloque(p, 4, 8, 8, h - 8, som(hierro, 0.9))
      p(2, 2, 3, 1, vid); p(2, 3, 1, 3, vid); p(3, 5, 1, 1, vid2); p(11, 1, 2, 1, vid); p(12, 2, 1, 2, vid2)
      if (c.vista === 'frente') { p(7, 2, 1, 2, '#8a8a82'); p(8, 4, 1, 2, '#8a8a82'); p(6, 6, 1, 1, '#8a8a82') } else { p(7, 1, 2, 6, som(hierro, 0.82)) }
    },
    brazo: (p, len, lado, arriba, c) => {
      bloque(p, 0, 0, 4, len, hierro); p(1, arriba ? len - 5 : 3, 1, 2, vid); bloque(p, 0, arriba ? 0 : len - 3, 4, 3, som(hierro, 0.86))
      if (lado === 'd' && !arriba && len >= 10 && c.pose !== 'cafe' && c.pose !== 'entrega' && c.vista === 'frente') { p(4, len - 3, 1, 3, vid2); p(4, len - 5, 2, 2, '#c0392b'); p(4, len - 5, 1, 1, '#f26a50') }
    },
    pierna: (p, len) => { bloque(p, 0, 0, 4, len, '#b9b9b0'); bloque(p, 0, len - 2, 4, 2, som(hierro, 0.7)); p(1, 2, 1, 2, vid) },
  }
}

// ── Allay: pequeño, azul, vuela; alas que baten por cuadros (no usa el motor humanoide) ──
// Ala: hoja translúcida de 5×7 (filas [desde, ancho] hacia afuera); arriba apunta hacia arriba, abajo cuelga invertida.
const HOJA: [number, number][] = [[1, 2], [0, 4], [0, 5], [0, 5], [0, 4], [1, 3], [2, 1]]
const ALA_Y = [16, 13, 9] // por fase (arriba, media, abajo): altura de la punta sobre el cuerpo
function allay(r: P, pz: Pieza, f: number) {
  const a = pz.aspecto, pose = pz.pose, esp = pz.vista === 'espalda', brillo = color(a.brillo, '#ffe066')
  const cu = '#4fbdf0', os = '#2c86c9', cl = '#9fe6ff', ojo = '#17335c'
  const e = estado(pose, f)
  const fase = pose === 'triste' || pose === 'duerme' ? 2 : pose === 'entrega' ? f % 2 : pose === 'mano' || pose === 'cafe' || pose === 'parado' || pose === 'camina' || pose === 'teclea' || pose === 'espera' ? [0, 1, 2, 1][f % 4] : pose === 'entrega' ? 0 : 2
  const dy = esp ? 0 : pose === 'duerme' ? 3 : pose === 'triste' ? 2 : 0
  const yb = (esp ? -4 : -5) + dy
  if (esp) { // silla pequeña detrás
    bloque(r, -6, -13, 12, 11, '#5b4231'); r(-6, -13, 12, 1, '#7a5a3a'); r(-1, -2, 2, 1, '#2b2118'); r(-5, -1, 10, 1, '#2b2118'); r(-5, 0, 2, 1, '#14100b'); r(3, 0, 2, 1, '#14100b')
  }
  if (pose !== 'duerme') { const k = f % 2; r(k ? 8 : 6, yb + 1 + k, 1, 3, brillo); r(k ? 7 : 5, yb + 2 + k, 3, 1, brillo) } // destello abajo a la derecha: fuera de las alas, y pintado antes
  for (const s of [-1, 1]) HOJA.forEach((_, i) => { // alas translúcidas: vena central y borde claro
    const fila = fase === 2 ? HOJA.length - 1 - i : i, [d2, w2] = HOJA[fila], y = yb - ALA_Y[fase] + i, x0 = 3 + d2 + (fase === 0 ? 1 : 0), X = s < 0 ? -x0 - w2 : x0
    r(X, y, w2, 1, i === 0 || i === HOJA.length - 1 ? 'rgba(235,252,255,.95)' : 'rgba(205,243,255,.88)')
    if (i === 3) r(s < 0 ? X : X, y, w2, 1, 'rgba(120,205,245,.9)')
    r(s < 0 ? X : X + w2 - 1, y, 1, 1, 'rgba(240,253,255,.98)')
  })
  const mano = (x: number, y: number, len: number) => { r(x, y, 2, len, cu); r(x, y + len - 1, 2, 1, cl) }
  const t = pose === 'teclea' ? [[0, 1], [1, 0], [0, 1], [1, 0]][f % 4] : [0, 0]
  bloque(r, -2, yb - 5, 4, 5, cu); r(-2, yb - 1, 4, 1, os)
  if (e.modo === 'entrega') { mano(-3, yb - 5, 3); mano(1, yb - 5, 3); mapa(at(r, -4, yb - 6), 8) } else {
    mano(-4, yb - 4 + t[0], 3); if (e.modo === 'mano') mano(2 + e.onda, yb - 9, 5); else if (e.modo === 'cafe') mano(2 - e.k, yb - 5 - e.k, 3); else mano(2, yb - 4 + t[1], 3)
  }
  const hx = e.hx, hy = yb - 11 + (pose === 'triste' || pose === 'duerme' ? 1 : 0)
  bloque(r, -4 + hx, hy, 8, 7, cu); r(-5 + hx, hy + 2, 1, 2, os); r(4 + hx, hy + 2, 1, 2, os); r(-1 + hx, hy - 1, 2, 1, cl)
  if (!esp) {
    const cerrado = pose === 'duerme', tri = pose === 'triste'
    if (cerrado) { r(-3 + hx, hy + 4, 2, 1, os); r(1 + hx, hy + 4, 2, 1, os) } else { r(-3 + hx, hy + 3, 1, 2, ojo); r(2 + hx, hy + 3, 1, 2, ojo); r(-3 + hx, hy + 3, 1, 1, '#4a6fa5'); r(2 + hx, hy + 3, 1, 1, '#4a6fa5') }
    if (tri) { r(-1 + hx, hy + 5, 2, 1, os); r(-3 + hx, hy + 5, 1, 1, '#d6f3ff') } else r(-1 + hx, hy + 5, 2, 1, os)
    r(-3 + hx, hy + 5, 1, 1, cl); r(2 + hx, hy + 5, 1, 1, cl)
  } else r(-2 + hx, hy + 4, 4, 2, os)
  if (e.modo === 'cafe') cuenco(at(r, 1 - 2 * e.k, yb - 6 - e.k), f)
  if (pose === 'duerme') zeta(r, 5, hy, f)
  if (pose === 'espera') puntos(r, 6, hy - 2, f)
  if (pz.aspecto.rol) { const [gx, gy] = esp ? [Math.max(-11, -9), -3] : [-6, yb - 1]; PROP[pz.aspecto.rol](at(r, gx, gy)) }
}

const ALLAY_RIT: Partial<Record<Pose, Ritmo>> = {
  parado: { cuadros: 4, dur: 0.8, vaiven: 'flota' }, camina: { cuadros: 4, dur: 0.5, vaiven: 'flota' }, teclea: { cuadros: 4, dur: 0.8 }, espera: { cuadros: 4, dur: 2 },
  mano: { cuadros: 4, dur: 0.6, vaiven: 'flota' }, triste: { cuadros: 2, dur: 3.4, pesos: [10, 1], vaiven: 'suspiro' }, duerme: { cuadros: 3, dur: 2.4, vaiven: 'respira-lenta' },
  entrega: { cuadros: 2, dur: 2.4, pesos: [3, 1], vaiven: 'respira' }, cafe: { cuadros: 4, dur: 2.4, vaiven: 'flota' },
}

const steve: KitPixel = { nombre: 'Steve', usa: ['camisa', 'pantalon', 'brillo', 'pelo', 'piel'], pintar: pintarDe(humano(false)), ritmos: RIT(0.72) }
const fondo: KitPixel = { nombre: 'Aldeano', usa: ['camisa', 'brillo', 'piel'], pintar: pintarDe(aldeano((a) => FONDO[(mezcla(a.camisa.length + parseInt(a.camisa.slice(1, 7) || '0', 16), 3)) % FONDO.length], true)), ritmos: RIT(0.8) }

export const reparto: Reparto = {
  kits: {
    steve, bloque: steve, aldeano: fondo,
    alex: { nombre: 'Alex', usa: ['camisa', 'pantalon', 'brillo', 'piel'], pintar: pintarDe(humano(true)), ritmos: RIT(0.72) },
    golem: { nombre: 'Golem de hierro', usa: ['brillo'], pintar: pintarDe(golem), ritmos: RIT(1) },
    herrero: { nombre: 'Aldeano herrero', usa: ['brillo', 'piel'], pintar: pintarDe(aldeano(() => OFICIOS.herrero)), ritmos: RIT(0.8) },
    cartografo: { nombre: 'Aldeano cartógrafo', usa: ['brillo', 'piel'], pintar: pintarDe(aldeano(() => OFICIOS.cartografo)), ritmos: RIT(0.8) },
    bibliotecario: { nombre: 'Aldeano bibliotecario', usa: ['brillo', 'piel'], pintar: pintarDe(aldeano(() => OFICIOS.bibliotecario)), ritmos: RIT(0.8) },
    allay: { nombre: 'Allay', usa: ['brillo'], pintar: (r, pz, f) => allay(r, pz, f), ritmos: ALLAY_RIT },
  },
  quien: {
    yo: 'steve', fondo: 'aldeano', 'rol:analisis-plan': 'alex', 'rol:revision-qa': 'golem', 'rol:implementacion': 'herrero',
    'rol:diseno': 'cartografo', 'rol:docs-entrega': 'bibliotecario', 'rol:integracion': 'allay',
  },
}
