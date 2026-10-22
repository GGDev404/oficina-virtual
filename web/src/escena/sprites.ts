// Sprites de personas: 12×16 px lógicos con (x, y) en los pies. Los usa la escena y la vista previa de la Armería.
// El equipo (clase, colores) sale de la Armería; si no hay, de un hash estable del id.
import type { AspectoGuardado, Clase } from '@/lib/tipos'

export interface Aspecto { pelo: string; piel: string; camisa: string; sombra: string; pantalon: string; clase: Clase; brillo: string }
export type Pose = 'teclea' | 'mano' | 'parado' | 'triste' | 'cafe' | 'duerme' | 'camina' | 'espera'
export type Pintar = (x: number, y: number, w: number, h: number, c: string) => void

function hash(t: string) { let h = 2166136261; for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
export const PELOS = ['#2b1d14', '#5a3a1e', '#c99a3e', '#161616', '#8a3b2a', '#d8d2c4', '#3b2a4a']
export const CAMISAS = ['#336fc6', '#c94b30', '#3aa66b', '#9b59b6', '#e0a526', '#2bb3b3', '#e05f8f', '#616e7c']
export const PIELES = ['#f1c7a3', '#dcae84', '#b07a52', '#7d5135']
const PANTALON = '#30364a', ZAPATO = '#1b1a22', OSCURO = '#1e1b26'

// Clases: lo que cambia del sprite y sus colores de fábrica (casco/armadura y brillo del visor).
export const CLASES: Record<Clase, { titulo: string; juego: string; camisa?: string; brillo: string; pantalon?: string; descripcion: string }> = {
  ninguna: { titulo: 'Civil', juego: 'Oficina', brillo: '#ffd84a', descripcion: 'Ropa de oficina, sin casco.' },
  spartan: { titulo: 'Spartan', juego: 'Halo', camisa: '#4b5d3a', brillo: '#f2b33d', pantalon: '#3a4730', descripcion: 'Casco MJOLNIR con visor dorado y hombreras.' },
  netrunner: { titulo: 'Netrunner', juego: 'Cyberpunk 2077', camisa: '#2a2340', brillo: '#4fe3f0', descripcion: 'Visor neón y chaqueta con línea luminosa.' },
  marine: { titulo: 'Doom Slayer', juego: 'DOOM', camisa: '#3f6b2a', brillo: '#9aa3ad', pantalon: '#4a3a2a', descripcion: 'Casco verde de praetor y visor oscuro.' },
  bloque: { titulo: 'Bloque', juego: 'Minecraft', camisa: '#00a8a8', brillo: '#3b5bdb', pantalon: '#3b3bb5', descripcion: 'Cabeza cuadrada, ojos de dos píxeles.' },
}

// Sombra de un color: el mismo un 20 % más oscuro (para el pliegue de la camisa).
export function oscurecer(hex: string, k = 0.8) {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

// Equipo final: lo guardado sobre su base (el rol para una sesión, lo de fábrica para ti), sobre lo que sale del id.
// Los colores de armadura de la base solo valen si la clase es la misma: al cambiar de clase manda la de fábrica.
export function aspecto(id: string, guardado?: AspectoGuardado | null, base?: AspectoGuardado | null): Aspecto {
  const h = hash(id)
  const clase = guardado?.clase ?? base?.clase ?? 'ninguna'
  const c = CLASES[clase]
  const b = base && (base.clase ?? 'ninguna') === clase ? base : { pelo: base?.pelo, piel: base?.piel }
  const g: AspectoGuardado = { ...b, ...guardado }
  const camisa = g.camisa ?? c.camisa ?? CAMISAS[h % CAMISAS.length]
  return {
    clase, camisa, sombra: oscurecer(camisa),
    pelo: g.pelo ?? PELOS[(h >>> 3) % PELOS.length],
    piel: g.piel ?? PIELES[(h >>> 7) % PIELES.length],
    pantalon: g.pantalon ?? c.pantalon ?? PANTALON,
    brillo: g.brillo ?? c.brillo,
  }
}
export const YO_FABRICA: AspectoGuardado = { pelo: '#161616', piel: '#c99572', camisa: '#1f9e8f' }

// Cabeza según la clase (q ya trae el salto de la mano agitada). Devuelve false si la clase no cambia la cabeza.
function cabeza(q: Pintar, a: Aspecto, pose: Pose, espalda: boolean) {
  const casco = oscurecer(a.camisa, 0.9)
  switch (a.clase) {
    case 'spartan':
      q(4, 0, 4, 1, casco); q(3, 1, 6, 5, casco); q(2, 2, 1, 3, casco); q(9, 2, 1, 3, casco)
      if (!espalda) { q(3, 3, 6, 2, a.brillo); q(4, 3, 2, 1, '#fff3c4') } // visor dorado con reflejo
      return true
    case 'marine':
      q(4, 0, 4, 1, casco); q(3, 1, 6, 5, casco); q(3, 5, 6, 1, oscurecer(casco, 0.7))
      if (!espalda) { q(4, 2, 4, 2, '#2b2b33'); q(4, 2, 1, 1, a.brillo) } // visor oscuro del praetor
      return true
    case 'bloque':
      q(3, 0, 6, 2, a.pelo); q(3, 2, 6, 4, espalda ? a.pelo : a.piel)
      if (!espalda) {
        q(3, 2, 1, 1, a.pelo); q(8, 2, 1, 1, a.pelo)
        if (pose === 'duerme') { q(4, 3, 2, 1, oscurecer(a.piel, 0.6)); q(6, 3, 2, 1, oscurecer(a.piel, 0.6)) }
        else { q(4, 3, 1, 1, '#ffffff'); q(5, 3, 1, 1, a.brillo); q(6, 3, 1, 1, a.brillo); q(7, 3, 1, 1, '#ffffff') }
        q(5, 5, 2, 1, oscurecer(a.pelo, 0.8)) // barba de Steve
      }
      return true
    default: return false
  }
}

export function personaje(r: Pintar, x: number, y: number, a: Aspecto, pose: Pose, f: number, { vista = 'frente', reducido = false } = {}) {
  const ox = Math.round(x) - 6, oy = Math.round(y) - 16
  const p: Pintar = (cx, cy, w, h, c) => r(ox + cx, oy + cy, w, h, c)
  if (vista === 'espalda') { // sentado frente a su monitor; quieto si espera un proceso
    const t = reducido || pose === 'espera' ? 0 : f % 2
    if (!cabeza(p, a, pose, true)) { p(4, 0, 4, 1, a.pelo); p(3, 1, 6, 4, a.pelo); p(4, 5, 4, 1, a.piel) }
    p(2, 6, 8, 6, a.camisa); p(2, 11, 8, 1, a.sombra)
    if (a.clase === 'netrunner') p(2, 6, 8, 1, a.brillo) // cuello luminoso
    p(2, 3 + t, 1, 3, a.camisa); p(2, 2 + t, 1, 1, a.piel)
    p(9, 4 - t, 1, 3, a.camisa); p(9, 3 - t, 1, 1, a.piel)
    p(1, 9, 10, 6, '#323a4c'); p(1, 9, 10, 1, '#46516b'); p(2, 15, 1, 1, OSCURO); p(9, 15, 1, 1, OSCURO) // silla
    return
  }
  r(ox + 2, oy + 15, 8, 2, 'rgba(0,0,0,.28)')
  const b = !reducido && pose === 'mano' && f % 2 ? -1 : 0 // la mano levantada se agita
  const q: Pintar = (cx, cy, w, h, c) => p(cx, cy + b, w, h, c)
  if (!cabeza(q, a, pose, false)) {
    q(4, 0, 4, 1, a.pelo); q(3, 1, 6, 1, a.pelo); q(3, 2, 1, 1, a.pelo); q(8, 2, 1, 1, a.pelo)
    q(4, 2, 4, 1, a.piel); q(3, 3, 6, 2, a.piel); q(4, 5, 4, 1, a.piel)
    if (pose === 'duerme') { q(4, 4, 1, 1, '#5b3b2a'); q(7, 4, 1, 1, '#5b3b2a') }
    else { q(4, 3, 1, 1, OSCURO); q(7, 3, 1, 1, OSCURO) }
    if (a.clase === 'netrunner') { q(3, 3, 6, 1, a.brillo); q(9, 3, 1, 1, a.brillo) } // visor neón sobre los ojos
    if (pose === 'triste') q(5, 5, 2, 1, '#8b5a44')
  }
  q(3, 6, 6, 5, a.camisa); q(3, 10, 6, 1, a.sombra); q(2, 7, 1, 3, a.camisa); q(2, 10, 1, 1, a.piel)
  if (a.clase === 'spartan' || a.clase === 'marine') { q(2, 6, 2, 2, oscurecer(a.camisa, 0.75)); q(8, 6, 2, 2, oscurecer(a.camisa, 0.75)) } // hombreras
  if (a.clase === 'netrunner') q(5, 6, 1, 5, a.brillo) // cierre luminoso
  if (pose === 'mano') { q(9, 3, 1, 4, a.camisa); q(9, 2, 1, 1, a.piel); q(9, 7, 1, 1, a.camisa) }
  else if (pose === 'cafe') {
    q(9, 7, 1, 2, a.camisa); q(9, 9, 1, 1, a.piel); q(10, 7, 2, 3, '#f4f1ea'); q(10, 7, 2, 1, '#6b3e1f')
    if (!reducido) p(10 + (f % 2), 5 - (f % 3), 1, 1, 'rgba(255,255,255,.75)') // vapor
  } else { q(9, 7, 1, 3, a.camisa); q(9, 10, 1, 1, a.piel) }
  p(3, 11, 6, 1, a.pantalon)
  if (pose === 'camina' && !reducido) {
    const t = f % 2
    p(4, 12, 2, t ? 2 : 1, a.pantalon); p(4, t ? 14 : 13, 2, 1, ZAPATO)
    p(6, 12, 2, t ? 1 : 2, a.pantalon); p(6, t ? 13 : 14, 2, 1, ZAPATO)
  } else {
    p(4, 12, 2, 2, a.pantalon); p(6, 12, 2, 2, a.pantalon); p(4, 14, 2, 1, ZAPATO); p(6, 14, 2, 1, ZAPATO)
  }
}
