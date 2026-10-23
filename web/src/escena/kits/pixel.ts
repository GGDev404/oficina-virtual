// Motor de pixel art humanoide compartido por los kits de pixel (Minecraft, Halo, Edgerunners): cada personaje aporta sus
// piezas (cabeza, torso, brazo, pierna) y pintarHum resuelve las 9 poses y sus cuadros. 1 px lógico = 1 píxel del arte.
import type { KitPixel, Pieza, Ritmo } from '../rig'
import type { Pintar } from '../hornear'
import { aclarar, oscurecer, type Aspecto, type Pose } from '../sprites'

export type P = Pintar
export const luz = (k: string, n = 0.18) => aclarar(k, n)
export const som = (k: string, n = 0.8) => oscurecer(k, n)
export const at = (r: P, dx: number, dy: number): P => (x, y, w, h, c) => r(x + dx, y + dy, w, h, c)
export const mezcla = (s: number, t: number) => (Math.imul(s * 31 + t * 17 + 7, 2654435761) >>> 16)

/** Bloque con rampa de 3 tonos y grano: luz arriba, sombra abajo y a la derecha. */
export function bloque(r: P, x: number, y: number, w: number, h: number, k: string) {
  r(x, y, w, h, k)
  if (w >= 3 && h >= 2) r(x, y, w, 1, luz(k))
  if (h >= 3) r(x, y + h - 1, w, 1, som(k))
  if (w >= 3 && h >= 3) {
    r(x + w - 1, y + 1, 1, h - 2, som(k, 0.9))
    for (let i = 0; i < Math.floor((w * h) / 12); i++) {
      const s = mezcla(i * 13 + x * 7 + w, y * 5 + h)
      r(x + 1 + (s % Math.max(1, w - 2)), y + 1 + ((s >> 3) % Math.max(1, h - 2)), 1, 1, i % 2 ? som(k, 0.92) : luz(k, 0.08))
    }
  }
}

// ── Objetos en mano (origen = el agarre, dibujados hacia arriba): uno por rol, más mapa y cuenco ──
export const PROP: Record<string, (p: P) => void> = {
  'analisis-plan': (p) => { // lupa: aro dorado, cristal celeste, mango
    p(-1, -9, 3, 1, '#d9a62b'); p(-2, -8, 1, 3, '#d9a62b'); p(2, -8, 1, 3, '#d9a62b'); p(-1, -5, 3, 1, '#d9a62b')
    p(-1, -8, 3, 3, '#bfe9ff'); p(-1, -8, 1, 1, '#fff'); p(0, -4, 1, 4, '#7a4e22')
  },
  implementacion: (p) => { // martillo: cabeza de hierro con luz, mango de madera
    p(-3, -9, 7, 3, '#8f98a3'); p(-3, -9, 7, 1, '#d4dbe2'); p(-3, -7, 7, 1, '#5d6670'); p(0, -6, 1, 6, '#7a4e22'); p(0, -6, 1, 1, '#5a3a18')
  },
  'revision-qa': (p) => { // escudo verde con palomita
    p(-3, -8, 6, 5, '#2f8f5b'); p(-2, -3, 4, 1, '#2f8f5b'); p(-1, -2, 2, 1, '#2f8f5b'); p(-3, -8, 6, 1, '#7fd6a2'); p(-3, -7, 1, 4, '#237246')
    p(-2, -5, 1, 1, '#fff'); p(-1, -4, 1, 1, '#fff'); p(0, -5, 1, 1, '#fff'); p(1, -6, 1, 1, '#fff')
  },
  'docs-entrega': (p) => { // libro azul con hojas
    p(-2, -7, 5, 7, '#336fc6'); p(-2, -7, 1, 7, '#1f4a8a'); p(-1, -7, 4, 1, '#5b93e0'); p(3, -6, 1, 5, '#f4f1ea'); p(0, -5, 2, 1, '#f4f1ea'); p(0, -3, 2, 1, '#f4f1ea')
  },
  diseno: (p) => { // paleta de mapa: pergamino con tres manchas de color
    p(-3, -8, 7, 7, '#e8d5b0'); p(-3, -8, 7, 1, '#b89a68'); p(-3, -2, 7, 1, '#b89a68'); p(-3, -8, 1, 7, '#b89a68'); p(3, -8, 1, 7, '#b89a68')
    p(-1, -6, 1, 1, '#c94b30'); p(1, -5, 1, 1, '#336fc6'); p(-1, -3, 1, 1, '#e0a526'); p(2, -3, 1, 1, '#3aa66b'); p(0, -1, 1, 1, '#7a4e22')
  },
  integracion: (p) => { // enchufe: clavijas, cuerpo turquesa, cable
    p(-2, -8, 1, 3, '#f4f1ea'); p(1, -8, 1, 3, '#f4f1ea'); p(-3, -5, 6, 3, '#2bb3b3'); p(-3, -5, 6, 1, '#7fe0e0'); p(-3, -3, 6, 1, '#1d8585'); p(0, -2, 1, 3, '#1e1b26')
  },
}
export const mapa = (p: P, w: number) => { // mapa de papel con borde, ríos y un punto rojo (se ve en la mano al «entregar»)
  p(0, 0, w, 6, '#8a6a3a'); p(1, 1, w - 2, 4, '#e6d3a0'); p(1, 1, w - 2, 1, '#f1e3b8'); p(2, 2, 2, 1, '#5ba35b'); p(w - 4, 3, 2, 1, '#4d8fd1'); p(Math.floor(w / 2), 3, 1, 1, '#c94b30')
}
export const cuenco = (p: P, f: number) => { // cuenco de estofado con vapor
  p(0, 0, 6, 3, '#7a5a3a'); p(0, 0, 6, 1, '#9b7a54'); p(1, 0, 4, 1, '#b5532e'); p(2, 0, 1, 1, '#d9b36a'); p(0, 2, 6, 1, '#5a3e24'); p(1, 3, 4, 1, '#5a3e24')
  const v = (x: number, y: number) => p(x, y, 1, 1, 'rgba(255,255,255,.8)')
  const k = f % 3; v(2, -2 - (k === 1 ? 1 : 0)); v(4, -2 - (k === 2 ? 1 : 0)); v(k === 0 ? 3 : 2, -4 + (k === 2 ? 1 : 0))
}
export const zeta = (p: P, x: number, y: number, f: number) => { // dos «z» que suben y se van apagando
  for (const [k, s] of [[0, 3], [1.5, 4]] as const) {
    const u = ((f + k) % 3) / 3, a = u < 0.3 ? 0.5 + u : 1.1 - u, c = `rgba(92,107,150,${a.toFixed(2)})`, px = x + Math.round(u * 3) + (s - 3) * 2, py = y - Math.round(u * 6) - (s - 3) * 3
    p(px, py, s, 1, c); p(px + s - 2, py + 1, 1, 1, c); if (s === 4) p(px + 1, py + 2, 1, 1, c); p(px, py + s - 1, s, 1, c)
  }
}
export const puntos = (p: P, x: number, y: number, f: number) => { // «…» de espera: se van encendiendo (el cuadro 0 ya los muestra todos)
  const n = [3, 1, 2, 3][f % 4]
  for (let i = 0; i < 3; i++) p(x + i * 2, y, 1, 1, i < n ? '#6b7a99' : 'rgba(107,122,153,.3)')
}

// ── Estado de cada pose y cuadro (mismos cuadros que RITMOS) ──
export interface Est { dy: number; hx: number; hy: number; ll: number; lr: number; sl: number; sr: number; ojos: 'a' | 'c'; humor: 'n' | 't'; modo: 'abajo' | 'mano' | 'entrega' | 'cafe'; onda: number; k: number }
export const BASE: Est = { dy: 0, hx: 0, hy: 0, ll: 0, lr: 0, sl: 0, sr: 0, ojos: 'a', humor: 'n', modo: 'abajo', onda: 0, k: 0 }
export function estado(pose: Pose, f: number): Est {
  switch (pose) {
    case 'parado': return { ...BASE, ojos: f === 1 ? 'c' : 'a', hx: f === 2 ? 1 : 0 } // 0 abierto, 1 parpadeo, 2 mira de lado
    case 'camina': { const [ll, lr, sl, sr, dy] = [[2, 0, 0, 2, 0], [0, 0, 0, 0, -1], [0, 2, 2, 0, 0], [0, 0, 0, 0, -1]][f % 4]; return { ...BASE, ll, lr, sl, sr, dy } } // pierna y brazo opuestos
    case 'mano': return { ...BASE, modo: 'mano', onda: [0, 1, 2, 1][f % 4] }
    case 'triste': return { ...BASE, hy: 1 + (f % 2), humor: 't', ojos: f % 2 ? 'c' : 'a', k: f % 2 } // cuadro 1: ojos cerrados y la lágrima baja
    case 'duerme': return { ...BASE, hx: 1, hy: 1, ojos: 'c' }
    case 'entrega': return { ...BASE, modo: 'entrega', k: f % 2, dy: f % 2 } // cuadro 1: se encoge antes de ofrecer
    case 'cafe': return { ...BASE, modo: 'cafe', k: [0, 1, 2, 1][f % 4], ojos: f % 4 === 2 ? 'c' : 'a' } // k: cuánto sube el cuenco a la boca
    case 'espera': return { ...BASE, hx: [0, 1, 1, 0][f % 4] }
    default: return BASE
  }
}

export interface Ctx { vista: 'frente' | 'espalda'; ojos: 'a' | 'c'; humor: 'n' | 't'; pose: Pose; k: number }
export interface Quien {
  cab: [number, number]; tor: [number, number]; bra: [number, number]; pie: [number, number]
  solape?: number // la cabeza se hunde tanto en el torso
  ts?: number // alto del torso al estar sentado
  cabeza: (p: P, c: Ctx) => void
  torso: (p: P, c: Ctx, h: number) => void
  brazo: (p: P, len: number, lado: 'i' | 'd', arriba: boolean, c: Ctx) => void // p = esquina superior izquierda; arriba: la mano queda arriba
  pierna: (p: P, len: number, lado: 'i' | 'd') => void
  cruce?: (p: P, mitad: boolean) => void // brazos cruzados de aldeano (p en el hombro izquierdo)
  agarre?: (yt: number) => [number, number] // dónde sostiene el rasgo
  bar: number // silla: ancho extra a cada lado
  silla?: string // color del respaldo (roble oscuro por defecto)
}

export function pintarHum(q: Quien, r: P, pz: Pieza, f: number) {
  const [cw, ch] = q.cab, [tw, th] = q.tor, [aw, al] = q.bra, [pw, ph] = q.pie, rol = pz.aspecto.rol
  const e = estado(pz.pose, f), c: Ctx = { vista: pz.vista, ojos: e.ojos, humor: e.humor, pose: pz.pose, k: e.k }
  if (pz.vista === 'espalda') return sentado(q, r, pz, f, e, c)
  const yt = -ph - th + e.dy, xi = -tw / 2 - aw, xd = tw / 2
  q.pierna(at(r, -pw, -ph - e.ll + e.dy), ph - e.dy, 'i'); q.pierna(at(r, 0, -ph - e.lr + e.dy), ph - e.dy, 'd')
  q.torso(at(r, -tw / 2, yt), c, th)
  let corto = e.sl // cuánto sube la mano izquierda (para el rasgo)
  switch (e.modo) {
    case 'mano':
      if (q.cruce) q.cruce(at(r, -tw / 2 - 1, yt + 4), true); else q.brazo(at(r, xi, yt), al - e.sl, 'i', false, c)
      q.brazo(at(r, xd + e.onda, yt + 2 - Math.min(al, 11)), Math.min(al, 11), 'd', true, c); break
    case 'entrega': corto = al - 5; q.brazo(at(r, xi + 1, yt), 5, 'i', false, c); q.brazo(at(r, xd - 1, yt), 5, 'd', false, c); break
    case 'cafe':
      if (q.cruce) q.cruce(at(r, -tw / 2 - 1, yt + 4), true); else q.brazo(at(r, xi, yt), al, 'i', false, c)
      if (e.k) q.brazo(at(r, xd - 1, yt + 3 - 3 * e.k), 2 + 3 * e.k, 'd', true, c); else q.brazo(at(r, xd - 1, yt), 5, 'd', false, c); break
    default:
      if (q.cruce) q.cruce(at(r, -tw / 2 - 1, yt + 4), false)
      else { q.brazo(at(r, xi, yt), al - e.sl, 'i', false, c); q.brazo(at(r, xd, yt), al - e.sr, 'd', false, c) }
  }
  if (e.modo === 'entrega') { const w = tw >= 16 ? 12 : 8; mapa(at(r, -w / 2, yt + 3), w) }
  q.cabeza(at(r, -cw / 2 + e.hx, yt - ch + (q.solape ?? 0) + e.hy), c)
  if (e.modo === 'cafe') { const bx = Math.round(xd + aw / 2 - 3); cuenco(at(r, Math.round(bx - ((bx + 3) * e.k) / 2), yt + 3 - 3 * e.k), f) } // sube a la boca y baja
  if (rol && e.modo !== 'entrega') { const [gx, gy] = q.agarre ? q.agarre(yt) : [xi, yt + al - corto - 1]; PROP[rol](at(r, gx, gy)) }
  if (pz.pose === 'duerme') zeta(r, cw / 2 + 2, yt - ch + 1, f)
}

export function sentado(q: Quien, r: P, pz: Pieza, f: number, e: Est, c: Ctx) {
  const [cw, ch] = q.cab, [tw] = q.tor, [aw] = q.bra, th = q.ts ?? q.tor[1], rol = pz.aspecto.rol
  const yt = -4 - th, mitad = tw / 2 + q.bar, madera = q.silla ?? '#5b4231'
  bloque(r, -mitad, yt + 3, mitad * 2, -2 - (yt + 3), madera); r(-mitad, yt + 3, mitad * 2, 1, luz(madera)) // respaldo (roble oscuro por defecto)
  r(-1, -2, 2, 1, '#2b2118'); r(-mitad + 1, -1, mitad * 2 - 2, 1, '#2b2118'); r(-mitad + 1, 0, 2, 1, '#14100b'); r(mitad - 3, 0, 2, 1, '#14100b')
  q.torso(at(r, -tw / 2, yt), c, th)
  const t = pz.pose === 'teclea' ? [[0, 1], [1, 0], [0, 1], [1, 0]][f % 4] : [0, 0] // teclea: un brazo baja mientras el otro sube
  q.brazo(at(r, -tw / 2 - aw, yt + 1 + t[0]), 5, 'i', false, c); q.brazo(at(r, tw / 2, yt + 1 + t[1]), 5, 'd', false, c)
  q.cabeza(at(r, -cw / 2 + e.hx, yt - ch + (q.solape ?? 0)), c)
  if (pz.pose === 'espera') puntos(r, cw / 2 + 2, yt - ch - 2, f)
  if (rol) PROP[rol](at(r, Math.max(-11, -mitad - 3), -3))
}

export const pintarDe = (q: (a: Aspecto) => Quien): KitPixel['pintar'] => (r, pz, f) => pintarHum(q(pz.aspecto), r, pz, f)

export const RIT = (camina: number): Partial<Record<Pose, Ritmo>> => ({ camina: { cuadros: 4, dur: camina } })
