// Contrato del rig de personajes (lo comparten todos los kits de kits/*.ts):
// - Pies en (0, 0); el cuerpo cabe en x −14…14, y −36…3 (CELDA de hornear.ts). Alto de referencia: unos 26 px lógicos.
// - Partes con estas clases, que las poses de animacion.ts mueven: .cuerpo (torso, brazos y cabeza), .cabeza, .ojos,
//   .brazo.i / .brazo.d (pivote en el hombro), .pierna.i / .pierna.d (pivote en la cadera), .prop (rasgo del rol, dentro
//   de .brazo.i al estar de pie) y los extras .carpeta, .taza > .vapor.v0/.v1, .zz.z0–z2, .punto.p0–p2, .ojo-cerrado,
//   .boca-s / .boca-t. Una parte que el kit no tenga simplemente no se mueve. data-pivote="x y" fija un pivote a mano.
// - Vista «espalda»: sentado en su escritorio, de espaldas, con silla (poses teclea y espera).
// - Nodos con createElementNS (nunca innerHTML); colores guardados validados como #rrggbb con color().
// - Arte original estilizado: nunca calcar ni incrustar arte, logos o tipografías oficiales de los juegos.
import type { RolId } from '@/lib/tipos'
import type { PoseDef, Vaiven } from './animacion'
import type { Pintar } from './hornear'
import type { Aspecto, Pose } from './sprites'

const NS = 'http://www.w3.org/2000/svg'
export type Vista = 'frente' | 'espalda'
/** Quién es el personaje: tú, un rol, o una sesión sin rol (las que orquestan). */
export type Actor = 'yo' | 'fondo' | `rol:${RolId}`
export interface Pieza { aspecto: Aspecto; vista: Vista; pose: Pose }
/** Kit vectorial: dibuja el rig completo (grupo .pj) y puede ajustar las poses base. */
export interface KitVector { dibujar: (p: Pieza) => SVGGElement; poses?: Partial<Record<Pose, Partial<PoseDef>>> }
/** Kit de pixel art: pinta el cuadro f de la pose (pies en 0, 0), un rectángulo por llamada. */
export interface Ritmo { cuadros: number; dur: number; pesos?: number[]; vaiven?: Vaiven }
export interface KitPixel { pintar: (r: Pintar, p: Pieza, f: number) => void; ritmos?: Partial<Record<Pose, Ritmo>> }
export type Kit = KitVector | KitPixel
/** Lo que aporta cada tema: sus kits y a quién dibuja cada uno. */
export interface Reparto { kits: Record<string, Kit>; quien: Partial<Record<Actor, string>> }

export const SENTADO = new Set<Pose>(['teclea', 'espera']) // de espaldas, frente al monitor
// Ritmo de las poses en pixel art (cuadros por ciclo); los vaivenes son los mismos que en vector.
export const RITMOS: Record<Pose, Ritmo> = {
  parado: { cuadros: 2, dur: 4, pesos: [23, 1], vaiven: 'respira' }, camina: { cuadros: 4, dur: 0.6 }, teclea: { cuadros: 4, dur: 0.8 },
  espera: { cuadros: 4, dur: 2.4 }, mano: { cuadros: 2, dur: 0.6 }, triste: { cuadros: 1, dur: 1, vaiven: 'balanceo' },
  duerme: { cuadros: 3, dur: 2.4, vaiven: 'respira-lenta' }, entrega: { cuadros: 1, dur: 1, vaiven: 'alza' }, cafe: { cuadros: 3, dur: 1.5, vaiven: 'respira' },
}

export const actorDe = (clave: string | null | undefined, rol?: RolId | null): Actor =>
  clave === 'yo' ? 'yo' : rol ? `rol:${rol}` : 'fondo'

export function nodo<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, padre?: Element, clase?: string) {
  const e = document.createElementNS(NS, tag)
  for (const k in attrs) e.setAttribute(k, String(attrs[k]))
  if (clase) e.setAttribute('class', clase)
  padre?.append(e)
  return e
}
const HEX = /^#[0-9a-f]{6}$/i
/** Color guardado si es #rrggbb válido; si no, el de reserva. */
export const color = (c: string | undefined, defecto: string) => (c && HEX.test(c) ? c : defecto)

// Un objeto por rol en la mano izquierda (origen = la mano, unos 8 px): lupa, martillo, escudo, libro, paleta, enchufe.
export const PROPS: Record<RolId, (g: SVGGElement) => void> = {
  'analisis-plan': (g) => { nodo('line', { x1: 0, y1: 0, x2: 2.6, y2: -3, stroke: '#7a4e22', 'stroke-width': 1.3, 'stroke-linecap': 'round' }, g); nodo('circle', { cx: 3.6, cy: -4.6, r: 2.6, fill: '#bfe9ff', stroke: '#d9a62b', 'stroke-width': 1.1 }, g) },
  implementacion: (g) => { nodo('rect', { x: -0.6, y: -6, width: 1.3, height: 7, rx: 0.5, fill: '#7a4e22' }, g); nodo('rect', { x: -3, y: -8, width: 6, height: 3, rx: 0.8, fill: '#9aa3ad' }, g); nodo('rect', { x: -3, y: -8, width: 6, height: 1, rx: 0.5, fill: '#cfd6dd' }, g) },
  'revision-qa': (g) => { nodo('path', { d: 'M-3.2-8h6.4v4.2c0 2.2-1.8 3.4-3.2 4-1.4-.6-3.2-1.8-3.2-4z', fill: '#2f8f5b' }, g); nodo('path', { d: 'M-1.6-4.6l1.2 1.2 2.2-2.6', fill: 'none', stroke: '#fff', 'stroke-width': 0.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g) },
  'docs-entrega': (g) => { nodo('rect', { x: -3, y: -8, width: 6, height: 8, rx: 0.7, fill: '#336fc6' }, g); nodo('rect', { x: -3, y: -8, width: 1.3, height: 8, rx: 0.6, fill: '#1f4a8a' }, g); nodo('path', { d: 'M-0.8-5.4h2.8M-0.8-3.2h2.8', stroke: '#f4f1ea', 'stroke-width': 0.8 }, g) },
  diseno: (g) => { nodo('path', { d: 'M-3.4-4.2c0-2.6 2.4-4 4.6-3.6 2.4.4 3.4 2.6 2.4 4.4-.8 1.4-2 .6-2.8 1.4-.8 1 .2 2-1.2 2.2-2.2.2-3-1.4-3-2.4z', fill: '#e8d5b0' }, g)
    for (const [x, y, c] of [[-1.6, -5.8, '#c94b30'], [0.8, -6.6, '#336fc6'], [2.4, -4.4, '#3aa66b']] as const) nodo('circle', { cx: x, cy: y, r: 0.8, fill: c }, g) },
  integracion: (g) => { nodo('rect', { x: -2.6, y: -5, width: 5.2, height: 4, rx: 1, fill: '#2bb3b3' }, g); nodo('path', { d: 'M-1.3-5v-2.6M1.3-5v-2.6', stroke: '#f4f1ea', 'stroke-width': 1.1, 'stroke-linecap': 'round' }, g); nodo('path', { d: 'M0-1v2.6', stroke: '#1e1b26', 'stroke-width': 1, 'stroke-linecap': 'round' }, g) },
}

