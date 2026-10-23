// Tiras de sprites: un dibujo (rig SVG o pixel art) se muestrea en N cuadros y queda en una sola imagen, cuadro tras
// cuadro a lo ancho. En pantalla, una <img> dentro de una caja con overflow: hidden se recorre con transform y saltos
// (step-end): el navegador lo anima en la GPU, sin estilo ni layout por cuadro en el hilo principal. Encima, `.vaiven`
// mueve el cuerpo entero con curvas suaves, también solo con transform.
// Se animan con Web Animations (element.animate), no con animaciones CSS: React escucha animationiteration en la raíz y,
// con ese oyente, Chrome despierta al hilo principal en cada vuelta de cada animación CSS para recalcular estilos.
// Las imágenes SVG no ven las variables CSS de la página: los colores de tema se resuelven antes (colorDe) y entran en la clave.
import { OCULTOS, type Mov, type PoseDef, type Vaiven } from './animacion'

const NS = 'http://www.w3.org/2000/svg'
/** Caja de cada cuadro en px lógicos, con los pies en (0, 0). */
export const CELDA = { x: -20, y: -38, w: 40, h: 42 } // ancho de sobra para props y alas en la mano
/** Resolución del pixel art: px de imagen por px lógico (se reduce suave al mostrarlo: píxeles parejos a cualquier escala). */
const PIXEL = 6

export interface Tira { src: string; n: number; dur: number; anim: string; vaiven: Vaiven }
export type Pintar = ((x: number, y: number, w: number, h: number, c: string) => void) & {
  /** Solo al hornear pixel art: copia el recorte (sx, sy, sw, sh) de una imagen ya cargada a (x, y, w, h) en px lógicos. */
  imagen?: (img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, h: number) => void
}

// ── Caché: la misma tira (kit, colores, pose, tema) se hornea una vez y la comparten escena, Armería y ficha ──
// Tope por peso además de por cantidad: una tira vectorial de 16 cuadros pesa hasta ~170 kB de data URL (la escena usa
// ~2,5 MB; la galería entera ~14 MB).
const cache = new Map<string, Tira>()
let peso = 0
export function enCache(clave: string, hacer: () => Tira): Tira {
  const t = cache.get(clave)
  if (t) { cache.delete(clave); cache.set(clave, t); return t } // la más usada queda al final
  const nueva = hacer()
  cache.set(clave, nueva); peso += nueva.src.length
  while (cache.size > 400 || peso > 32e6) { const [k, v] = cache.entries().next().value!; cache.delete(k); peso -= v.src.length }
  return nueva
}

// ── Keyframes por (cuadros, pesos): se calculan una vez y los usan todas las tiras con ese ritmo ──
const ritmos = new Map<string, Keyframe[]>()
function animacion(n: number, pesos?: number[]) {
  if (n < 2) return 'none'
  const nombre = `tira-${n}${pesos ? `-${pesos.join('_')}` : ''}`
  if (ritmos.has(nombre)) return nombre
  const total = pesos ? pesos.reduce((a, b) => a + b, 0) : n
  let acc = 0
  const pasos: Keyframe[] = []
  for (let i = 0; i < n; i++) { pasos.push({ offset: acc / total, transform: `translateX(${(-100 * i) / n}%)`, easing: 'step-end' }); acc += pesos?.[i] ?? 1 }
  ritmos.set(nombre, [...pasos, { offset: 1, transform: 'translateX(0)' }])
  return nombre
}
// Vaivenes del cuerpo entero (curva ease-in-out entre cada par de keyframes, como en CSS). Las alturas van en % de la
// celda (42 px lógicos): −1 px lógico = −2,381 %.
const kf = (...pasos: [number, string][]): Keyframe[] => pasos.map(([offset, transform]) => ({ offset, transform, easing: 'ease-in-out' }))
const VAIVEN: Record<Exclude<Vaiven, ''>, [Keyframe[], number, PlaybackDirection?]> = {
  respira: [kf([0, 'none'], [0.5, 'scale(1.012, 1.025)'], [1, 'none']), 3.2],
  'respira-lenta': [kf([0, 'none'], [0.5, 'scale(1.012, 1.025)'], [1, 'none']), 4.8],
  balanceo: [kf([0, 'rotate(-1.6deg)'], [1, 'rotate(1.6deg)']), 4, 'alternate'],
  alza: [kf([0, 'none'], [1, 'translateY(-2.381%)']), 1.6, 'alternate'],
  flota: [kf([0, 'none'], [0.5, 'translateY(-3.571%)'], [1, 'none']), 2.4],
  reposo: [kf([0, 'none'], [0.25, 'scale(1.01, 1.022) rotate(.3deg)'], [0.5, 'none'], [0.75, 'scale(1.01, 1.022) rotate(-.3deg)'], [1, 'none']), 6],
  suspiro: [kf([0, 'none'], [0.35, 'translateY(.8%) scale(1.006, .985)'], [0.55, 'translateY(.8%) scale(1.006, .985)'], [1, 'none']), 5],
}

// ── Colores del tema ya resueltos (light-dark(), var() anidadas…) para usarlos dentro de la imagen ──
let sonda: HTMLElement | null = null
const colores = new Map<string, string>()
export const claveTema = () => `${document.documentElement.dataset.tema ?? 'auto'}:${document.documentElement.dataset.modo ?? ''}`
export function colorDe(token: string, defecto = '#000') {
  const k = `${claveTema()}|${token}`
  let c = colores.get(k)
  if (c) return c
  sonda ??= Object.assign(document.body.appendChild(document.createElement('span')), { hidden: true })
  sonda.style.color = defecto
  sonda.style.color = `var(${token}, ${defecto})`
  c = getComputedStyle(sonda).color
  colores.set(k, c)
  return c
}

// ── Pivotes: data-pivote="x y" del kit, o la caja de la parte (hombro y cadera arriba al centro, cuerpo y cabeza abajo) ──
let medidor: SVGSVGElement | null = null
function pivote(el: SVGGraphicsElement): [number, number] {
  const propio = el.getAttribute('data-pivote')
  if (propio) { const [x, y] = propio.split(/[\s,]+/).map(Number); return [x, y] }
  const b = el.getBBox()
  const c = el.classList
  const fy = c.contains('brazo') || c.contains('pierna') ? 0 : c.contains('cuerpo') || c.contains('cabeza') ? 1 : 0.5
  return [b.x + b.width / 2, b.y + b.height * fy]
}
const num = (v: number) => +v.toFixed(3)
function transformar(orig: string, [px, py]: [number, number], m: Mov) {
  const t = [orig]
  if (m.x || m.y) t.push(`translate(${num(m.x ?? 0)} ${num(m.y ?? 0)})`)
  if (m.r || (m.sx ?? 1) !== 1 || (m.sy ?? 1) !== 1) {
    t.push(`translate(${num(px)} ${num(py)})`)
    if (m.r) t.push(`rotate(${num(m.r)})`)
    if ((m.sx ?? 1) !== 1 || (m.sy ?? 1) !== 1) t.push(`scale(${num(m.sx ?? 1)} ${num(m.sy ?? 1)})`)
    t.push(`translate(${num(-px)} ${num(-py)})`)
  }
  return t.join(' ').trim()
}

/** Hornea un rig SVG (grupo con los pies en 0,0) en una tira de `pose.cuadros` cuadros. */
export function hornearVector(rig: SVGGElement, pose: PoseDef): Tira {
  const mostrar = (sel: string[], si: boolean) => { for (const s of sel) for (const e of rig.querySelectorAll(s)) { if (si) e.removeAttribute('display'); else e.setAttribute('display', 'none') } }
  mostrar(OCULTOS, false); mostrar(pose.ver ?? [], true); mostrar(pose.ocultar ?? [], false)
  // Las cajas se miden con el rig puesto en un <svg> invisible (getBBox necesita que esté en el documento).
  if (!medidor) {
    medidor = document.body.appendChild(document.createElementNS(NS, 'svg'))
    medidor.setAttribute('style', 'position:fixed;left:-99px;top:0;width:1px;height:1px;visibility:hidden;pointer-events:none')
  }
  medidor.append(rig)
  const partes = Object.entries(pose.partes).map(([sel, f]) => ({
    f, els: [...rig.querySelectorAll<SVGGraphicsElement>(sel)].map((el) => ({ el, orig: el.getAttribute('transform') ?? '', piv: pivote(el), op: el.getAttribute('opacity') })),
  }))
  rig.remove()
  const n = Math.max(1, pose.cuadros), ser = new XMLSerializer()
  let cuerpo = ''
  for (let i = 0; i < n; i++) {
    const t = i / n
    for (const { f, els } of partes) {
      const m = f(t)
      for (const p of els) {
        const tr = transformar(p.orig, p.piv, m)
        if (tr) p.el.setAttribute('transform', tr); else p.el.removeAttribute('transform')
        if (m.o != null) p.el.setAttribute('opacity', String(num(m.o)))
        else if (p.op == null) p.el.removeAttribute('opacity')
      }
    }
    cuerpo += `<g transform="translate(${i * CELDA.w - CELDA.x} ${-CELDA.y})">${ser.serializeToString(rig)}</g>`
  }
  const svg = `<svg xmlns="${NS}" viewBox="0 0 ${CELDA.w * n} ${CELDA.h}" width="${CELDA.w * n}" height="${CELDA.h}">${cuerpo}</svg>`
  return { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, n, dur: pose.dur, anim: animacion(n, pose.pesos), vaiven: pose.vaiven ?? '' }
}

/** Hornea pixel art: `pintar(r, f)` dibuja el cuadro f con los pies en (0, 0), un rectángulo por llamada en px lógicos. */
export function hornearPixel(pintar: (r: Pintar, f: number) => void, ritmo: { cuadros: number; dur: number; pesos?: number[]; vaiven?: Vaiven }): Tira {
  const n = Math.max(1, ritmo.cuadros)
  const lienzo = document.createElement('canvas')
  lienzo.width = CELDA.w * n * PIXEL; lienzo.height = CELDA.h * PIXEL
  const ctx = lienzo.getContext('2d')!
  for (let f = 0; f < n; f++) {
    const ox = f * CELDA.w - CELDA.x, oy = -CELDA.y
    const r: Pintar = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect((ox + x) * PIXEL, (oy + y) * PIXEL, w * PIXEL, h * PIXEL) }
    r.imagen = (img, sx, sy, sw, sh, x, y, w, h) => ctx.drawImage(img, sx, sy, sw, sh, (ox + x) * PIXEL, (oy + y) * PIXEL, w * PIXEL, h * PIXEL)
    pintar(r, f)
  }
  return { src: lienzo.toDataURL('image/png'), n, dur: ritmo.dur, anim: animacion(n, ritmo.pesos), vaiven: ritmo.vaiven ?? '' }
}

// ── En pantalla: <span.figura><span.vaiven><span.cuadro><img.tira></span></span></span> ──
// .figura mide una celda (CELDA × --e) y se coloca por sus pies; quien la usa le pone transform o left/top.
// Con movimiento reducido no se anima nada: queda el cuadro 0, la postura de la pose.
const movimiento = matchMedia('(prefers-reduced-motion: reduce)')
const reanimar = new WeakMap<Element, () => void>()
movimiento.addEventListener('change', () => { for (const f of document.querySelectorAll('.figura')) reanimar.get(f)?.() })
export interface Figura { el: HTMLElement; poner(t: Tira): void }
export function figura(clase = ''): Figura {
  let img = Object.assign(document.createElement('img'), { alt: '', className: 'tira' }) // vacía hasta la primera tira
  const cuadro = document.createElement('span'); cuadro.className = 'cuadro'; cuadro.append(img)
  const vaiven = document.createElement('span'); vaiven.className = 'vaiven'; vaiven.append(cuadro)
  const el = document.createElement('span'); el.className = `figura ${clase}`.trim(); el.append(vaiven)
  const desfase = Math.random() // cada quien en su propio momento del ciclo
  let pedida = '', actual: Tira | null = null, paso: Animation | undefined, mueve: Animation | undefined, tipoVaiven = ''
  function animar(todo: boolean) {
    const t = actual!, quieto = movimiento.matches
    paso?.cancel()
    const k = ritmos.get(t.anim)
    paso = k && !quieto ? img.animate(k, { duration: t.dur * 1000, iterations: Infinity, delay: -desfase * t.dur * 1000 }) : undefined
    if (!todo && tipoVaiven === t.vaiven) return // el vaivén sigue sin saltos si no cambió
    tipoVaiven = t.vaiven
    mueve?.cancel()
    const v = t.vaiven ? VAIVEN[t.vaiven] : null
    mueve = v && !quieto ? vaiven.animate(v[0], { duration: v[1] * 1000, iterations: Infinity, direction: v[2], delay: -desfase * 4000 }) : undefined
  }
  reanimar.set(el, () => { if (actual) animar(true) })
  return {
    el,
    poner(t) {
      if (t.src === pedida) return
      pedida = t.src
      // La imagen nueva se decodifica aparte y entra ya lista: la figura nunca se queda vacía entre una tira y otra.
      const nueva = Object.assign(document.createElement('img'), { alt: '', draggable: false, className: 'tira', src: t.src })
      nueva.style.width = `${t.n * 100}%`
      const listo = () => {
        if (pedida !== t.src) return // ya pidieron otra
        img.replaceWith(nueva); img = nueva; actual = t
        animar(false)
      }
      nueva.decode().then(listo, listo)
    },
  }
}
