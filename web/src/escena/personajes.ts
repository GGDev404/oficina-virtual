// Personajes vectoriales: un rig SVG (pies en (0,0), caja x −8…8, y −26…0) y kits que lo dibujan.
// Quién se dibuja lo decide `elegirKit(tema, actor, clase)`: el REPARTO de cada tema asigna un kit a «yo», a cada
// rol y a las sesiones de fondo. Sumar un personaje de un tema = escribir su kit y una línea en REPARTO.
// Los nodos se crean con createElementNS (nunca innerHTML); los colores se validan como #rrggbb.
// Las poses son clases en el grupo raíz (.pj.pose-teclea): cambiar de pose es cambiar className, sin reconstruir.
import type { Clase, RolId } from '@/lib/tipos'
import type { TemaId } from '@/lib/tema'
import { oscurecer, type Aspecto, type Pose } from './sprites'

const NS = 'http://www.w3.org/2000/svg'
export type Vista = 'frente' | 'espalda'
/** Quién es el personaje: tú, un rol, o una sesión sin rol (las que orquestan). */
export type Actor = 'yo' | 'fondo' | `rol:${RolId}`
export interface Pieza { aspecto: Aspecto; vista: Vista }
/** Un kit dibuja el rig completo (grupo `.pj`, sin pose). */
export type Kit = (p: Pieza) => SVGGElement

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
const color = (c: string | undefined, defecto: string) => (c && HEX.test(c) ? c : defecto)

// Un objeto por rol en la mano izquierda (origen = la mano, unos 8 px): lupa, martillo, escudo, libro, paleta, enchufe.
const PROPS: Record<RolId, (g: SVGGElement) => void> = {
  'analisis-plan': (g) => { nodo('line', { x1: 0, y1: 0, x2: 2.6, y2: -3, stroke: '#7a4e22', 'stroke-width': 1.3, 'stroke-linecap': 'round' }, g); nodo('circle', { cx: 3.6, cy: -4.6, r: 2.6, fill: '#bfe9ff', stroke: '#d9a62b', 'stroke-width': 1.1 }, g) },
  implementacion: (g) => { nodo('rect', { x: -0.6, y: -6, width: 1.3, height: 7, rx: 0.5, fill: '#7a4e22' }, g); nodo('rect', { x: -3, y: -8, width: 6, height: 3, rx: 0.8, fill: '#9aa3ad' }, g); nodo('rect', { x: -3, y: -8, width: 6, height: 1, rx: 0.5, fill: '#cfd6dd' }, g) },
  'revision-qa': (g) => { nodo('path', { d: 'M-3.2-8h6.4v4.2c0 2.2-1.8 3.4-3.2 4-1.4-.6-3.2-1.8-3.2-4z', fill: '#2f8f5b' }, g); nodo('path', { d: 'M-1.6-4.6l1.2 1.2 2.2-2.6', fill: 'none', stroke: '#fff', 'stroke-width': 0.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g) },
  'docs-entrega': (g) => { nodo('rect', { x: -3, y: -8, width: 6, height: 8, rx: 0.7, fill: '#336fc6' }, g); nodo('rect', { x: -3, y: -8, width: 1.3, height: 8, rx: 0.6, fill: '#1f4a8a' }, g); nodo('path', { d: 'M-0.8-5.4h2.8M-0.8-3.2h2.8', stroke: '#f4f1ea', 'stroke-width': 0.8 }, g) },
  diseno: (g) => { nodo('path', { d: 'M-3.4-4.2c0-2.6 2.4-4 4.6-3.6 2.4.4 3.4 2.6 2.4 4.4-.8 1.4-2 .6-2.8 1.4-.8 1 .2 2-1.2 2.2-2.2.2-3-1.4-3-2.4z', fill: '#e8d5b0' }, g)
    for (const [x, y, c] of [[-1.6, -5.8, '#c94b30'], [0.8, -6.6, '#336fc6'], [2.4, -4.4, '#3aa66b']] as const) nodo('circle', { cx: x, cy: y, r: 0.8, fill: c }, g) },
  integracion: (g) => { nodo('rect', { x: -2.6, y: -5, width: 5.2, height: 4, rx: 1, fill: '#2bb3b3' }, g); nodo('path', { d: 'M-1.3-5v-2.6M1.3-5v-2.6', stroke: '#f4f1ea', 'stroke-width': 1.1, 'stroke-linecap': 'round' }, g); nodo('path', { d: 'M0-1v2.6', stroke: '#1e1b26', 'stroke-width': 1, 'stroke-linecap': 'round' }, g) },
}

// ---- kit «oficina»: persona redondeada, sin contornos, corbata del color del brillo ----
const oficina: Kit = ({ aspecto: a, vista }) => {
  const camisa = color(a.camisa, '#336fc6'), pelo = color(a.pelo, '#2b1d14'), piel = color(a.piel, '#f1c7a3')
  const pantalon = color(a.pantalon, '#30364a'), brillo = color(a.brillo, '#ffd84a')
  const sombra = oscurecer(camisa), zapato = '#1b1a22', tinta = '#1e1b26'
  const raiz = nodo('g', {}, undefined, 'pj')
  const espalda = vista === 'espalda'
  const f = nodo('g', espalda ? { transform: 'translate(0 3.5)' } : {}, raiz, 'asiento') // sentado: baja el cuerpo
  nodo('ellipse', { cx: 0, cy: -0.4, rx: 7, ry: 1.6, fill: '#000', opacity: 0.25 }, raiz, 'sombra')
  if (espalda) nodo('rect', { x: -7.5, y: -17, width: 15, height: 15, rx: 3, fill: '#323a4c' }, f, 'silla')
  else for (const lado of ['i', 'd']) {
    const x = lado === 'i' ? -3.6 : 0.6
    const p = nodo('g', {}, f, `pierna ${lado}`)
    nodo('rect', { x, y: -8, width: 3, height: 6.6, rx: 1.3, fill: pantalon }, p)
    nodo('ellipse', { cx: x + 1.5, cy: -1.4, rx: 2.1, ry: 1.2, fill: zapato }, p)
  }
  const cuerpo = nodo('g', {}, f, 'cuerpo')
  nodo('rect', { x: -5.2, y: -16, width: 10.4, height: 10, rx: 3.2, fill: camisa }, cuerpo, 'torso')
  nodo('rect', { x: -5.2, y: -8, width: 10.4, height: 2, rx: 1, fill: sombra }, cuerpo)
  if (!espalda) { // cuello de camisa y corbata
    nodo('path', { d: 'M-2.2-16l2.2 2.4 2.2-2.4 1 1.6-3.2 2.8-3.2-2.8z', fill: '#f4f1ea' }, cuerpo)
    nodo('path', { d: 'M0-13.6l-.9 1 .6 4.4.3.4.3-.4.6-4.4z', fill: brillo }, cuerpo)
  } else nodo('rect', { x: -5.2, y: -16, width: 10.4, height: 1.4, rx: 0.7, fill: oscurecer(camisa, 0.9) }, cuerpo)
  for (const lado of ['i', 'd']) {
    const x = lado === 'i' ? -7.9 : 5.4
    const b = nodo('g', {}, cuerpo, `brazo ${lado}`)
    nodo('rect', { x, y: -15, width: 2.5, height: 8, rx: 1.25, fill: camisa }, b)
    nodo('circle', { cx: x + 1.25, cy: -6.6, r: 1.5, fill: piel }, b)
  }
  const cab = nodo('g', {}, cuerpo, 'cabeza')
  nodo('rect', { x: -1.6, y: -17, width: 3.2, height: 3, fill: oscurecer(piel, 0.9) }, cab)
  nodo('circle', { cx: 0, cy: -20, r: 5.2, fill: espalda ? pelo : piel }, cab)
  if (espalda) nodo('path', { d: 'M-4.2-17.4q4.2 2.6 8.4 0', fill: 'none', stroke: oscurecer(pelo, 0.8), 'stroke-width': 0.8, 'stroke-linecap': 'round' }, cab)
  else {
    nodo('path', { d: 'M-5.4-20.4C-5.8-26.4 5.8-26.4 5.4-20.4 3.6-22.6-.6-22.6-5.4-20.4z', fill: pelo }, cab)
    const ojos = nodo('g', {}, cab, 'ojos')
    for (const x of [-2, 2]) nodo('circle', { cx: x, cy: -19.4, r: 0.75, fill: tinta }, ojos)
    for (const x of [-2, 2]) nodo('path', { d: `M${x - 1}-19.4q1 .9 2 0`, fill: 'none', stroke: tinta, 'stroke-width': 0.6, 'stroke-linecap': 'round' }, cab, 'ojo-cerrado')
    nodo('path', { d: 'M-1.2-17.2q1.2 .9 2.4 0', fill: 'none', stroke: '#8b5a44', 'stroke-width': 0.6, 'stroke-linecap': 'round' }, cab, 'boca-s')
    nodo('path', { d: 'M-1.2-16.6q1.2-.9 2.4 0', fill: 'none', stroke: '#8b5a44', 'stroke-width': 0.6, 'stroke-linecap': 'round' }, cab, 'boca-t')
  }
  // Rasgo del rol: en la mano al estar de pie; asoma junto a la silla al estar sentado.
  if (a.rol) PROPS[a.rol]?.(nodo('g', { transform: espalda ? 'translate(-9.4 -4)' : 'translate(-6.7 -6.4)' }, f, 'prop'))
  // Extras de cada pose: se muestran por CSS según la clase de pose.
  const extra = nodo('g', {}, f, 'extra')
  const carpeta = nodo('g', {}, extra, 'carpeta')
  nodo('rect', { x: -4.2, y: -13, width: 8.4, height: 6.6, rx: 0.9, fill: '#e0a526' }, carpeta)
  nodo('path', { d: 'M-4.2-12.2h3l.8-1.2h4.4', fill: 'none', stroke: '#c78a10', 'stroke-width': 0.9 }, carpeta)
  nodo('path', { d: 'M-2.4-9.6h4.8M-2.4-8h3', stroke: '#fff', 'stroke-width': 0.6, 'stroke-linecap': 'round' }, carpeta)
  const taza = nodo('g', {}, extra, 'taza')
  nodo('rect', { x: 5.2, y: -10.8, width: 3.2, height: 3.8, rx: 0.8, fill: '#f4f1ea' }, taza)
  nodo('path', { d: 'M8.4-10h.7c.8 0 .8 1.8 0 1.8h-.7', fill: 'none', stroke: '#f4f1ea', 'stroke-width': 0.7 }, taza)
  nodo('rect', { x: 5.2, y: -10.8, width: 3.2, height: 0.9, fill: '#6b3e1f' }, taza)
  for (const [i, x] of [6.1, 7.5].entries()) nodo('path', { d: `M${x}-12q-.9-1 0-2 .9-1 0-2`, fill: 'none', stroke: '#fff', 'stroke-width': 0.6, 'stroke-linecap': 'round', opacity: 0.8 }, taza, `vapor v${i}`)
  for (const [i, [x, y]] of ([[4, -25], [6.8, -27.6], [9.4, -30]] as const).entries())
    nodo('path', { d: `M${x} ${y}h2.6l-2.6 2.8h2.6`, fill: 'none', stroke: '#6b7a99', 'stroke-width': 0.8, 'stroke-linejoin': 'round' }, extra, `zz z${i}`)
  for (const i of [0, 1, 2]) nodo('circle', { cx: 6 + i * 2.4, cy: -26, r: 0.8, fill: '#6b7a99' }, extra, `punto p${i}`)
  return raiz
}

// ---- reparto: qué kit dibuja a quién ----
export const KITS: Record<string, Kit> = { oficina }
// Por tema y actor. Vacío en la fase de «oficina limpia»; la fase de temas añade, p. ej.
// REPARTO.halo = { yo: 'jefe-maestro', 'rol:analisis-plan': 'cortana', fondo: 'spartan-iv' }.
export const REPARTO: Partial<Record<TemaId, Partial<Record<Actor, string>>>> = {}
// La clase guardada decide el kit en Claro/Oscuro/Automático cuando haya kits por clase (hoy todas se ven como «oficina»).
export const KIT_DE_CLASE: Partial<Record<Clase, string>> = {}

export function elegirKit(tema: TemaId, actor: Actor, clase: Clase): string {
  const id = REPARTO[tema]?.[actor] ?? KIT_DE_CLASE[clase] ?? 'oficina'
  return id in KITS ? id : 'oficina'
}

/** Rig listo para meter en un <svg>: el kit del reparto, con la clase de pose puesta. */
export function construirPersonaje(p: Pieza, tema: TemaId, actor: Actor): SVGGElement {
  return KITS[elegirKit(tema, actor, p.aspecto.clase)](p)
}
export const clasePose = (pose: Pose) => `pj pose-${pose}`
