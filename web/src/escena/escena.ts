// Escena pixel art: un <canvas> de 480×272 px lógicos que el CSS escala con image-rendering: pixelated, y encima una
// capa HTML con los personajes (botones), letreros e insignias. Es dibujo imperativo con su propio bucle de animación:
// React solo monta el contenedor (Escena.tsx) y le pasa los datos con actualizar().
import { ESTADOS, MAX_ACTIVOS, base, esperaProcesos, nivelContexto, nombreSesion, pendientesParaMi, procesosDe, resumenPizarra, tareaPorId, textoSobre, veredicto } from '@/lib/oficina'
import type { Datos, EntreSesiones, RolId, Sesion } from '@/lib/tipos'
import { aspecto, personaje as dibujarPersona, YO_FABRICA, type Aspecto, type Pose } from './sprites'

const W = 480, H = 272

// Íconos de trazo (formas de Lucide, ISC) que usa la capa: insignias y burbujas.
const TRAZOS: Record<string, string[]> = {
  alto: ['M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z', 'm15 9-6 6', 'm9 9 6 6'],
  listo: ['M20 6 9 17l-5-5'],
  reloj: ['M5 22h14', 'M5 2h14', 'M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22', 'M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2'],
  puerta: ['M13 4h3a2 2 0 0 1 2 2v14', 'M2 20h3', 'M13 20h9', 'M10 12v.01', 'M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z'],
  correo: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'],
  calendario: ['M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  pizarra: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8 7v7', 'M12 7v4', 'M16 7v9'],
}
function icono(nombre: string) {
  const ns = 'http://www.w3.org/2000/svg'
  const s = document.createElementNS(ns, 'svg')
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'icono' })) s.setAttribute(k, v)
  for (const d of TRAZOS[nombre]) { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); s.append(p) }
  return s
}
// Nodos de la capa: siempre texto, nunca HTML.
function el(tag: string, attrs: Record<string, string | (() => void)> = {}, ...hijos: (Node | string)[]) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') n.addEventListener(k.slice(2), v)
    else if (k === 'class') n.className = v
    else n.setAttribute(k, v)
  }
  n.append(...hijos)
  return n
}

// Paleta del lienzo: sale de los tokens --esc-* (oficina.css) y se vuelve a leer al cambiar de tema.
const PAL = {
  pasillo: ['#bdb7a8', '#b2ac9c'], linea: '#cfc9b9', muro: '#47415f', muroAlto: '#2c2940', zocalo: '#24212f', borde: '#1c1a26',
  marco: '#6b5236', oscuro: '#1e1b26', monitor: '#0f2740', codigo: ['#7dffa8', '#5fd3ff'], resalte: '#ffd84a',
}
type Sala = 'taller' | 'puerta' | 'bloqueados' | 'descanso' | 'oficina'
// Cada cuarto tiene una sola puerta hacia el pasillo horizontal (y 128–160): por ahí caminan los agentes.
const SALAS: Record<Sala, { titulo: string; x: number; y: number; w: number; h: number; piso: string[]; puerta: number; abajo: boolean }> = {
  taller: { titulo: 'Taller', x: 0, y: 0, w: 272, h: 128, piso: ['#a8754a', '#9d6c44'], puerta: 248, abajo: true },
  puerta: { titulo: 'Tu puerta', x: 304, y: 0, w: 176, h: 128, piso: ['#6e4f80', '#674a78'], puerta: 392, abajo: true },
  bloqueados: { titulo: 'Bloqueados', x: 0, y: 160, w: 112, h: 112, piso: ['#71757f', '#696d77'], puerta: 82, abajo: false },
  descanso: { titulo: 'Descanso', x: 112, y: 160, w: 160, h: 112, piso: ['#d2ab72', '#c8a16a'], puerta: 196, abajo: false },
  oficina: { titulo: 'Tu oficina', x: 304, y: 160, w: 176, h: 112, piso: ['#4f7d5c', '#4a7657'], puerta: 392, abajo: false },
}
function leerPaleta() {
  const st = getComputedStyle(document.documentElement)
  const v = (n: string, d: string) => st.getPropertyValue(`--esc-${n}`).trim() || d
  PAL.pasillo = [v('pasillo', PAL.pasillo[0]), v('pasillo-2', PAL.pasillo[1])]
  for (const k of ['linea', 'muro', 'zocalo', 'borde', 'marco', 'monitor', 'resalte'] as const) PAL[k] = v(k, PAL[k])
  PAL.muroAlto = v('muro-alto', PAL.muroAlto)
  PAL.codigo = [v('codigo', PAL.codigo[0]), v('codigo-2', PAL.codigo[1])]
  for (const [k, s] of Object.entries(SALAS)) s.piso = [v(k, s.piso[0]), v(`${k}-2`, s.piso[1])]
}
const ESCRITORIOS = [26, 72].flatMap((dy) => [14, 72, 130, 188].map((dx) => ({ dx, dy })))
const MESA_YO = { dx: SALAS.oficina.x + 104, dy: SALAS.oficina.y + 50 }
type Burbuja = [string | { icono: string; texto?: string }, string]
const ROL: Record<string, { sala: Sala; pose: Pose; burbuja?: Burbuja; prio?: number }> = {
  trabajando: { sala: 'taller', pose: 'teclea' },
  necesita_permiso: { sala: 'puerta', pose: 'mano', burbuja: ['!', 'rojo'], prio: 0 },
  duda: { sala: 'puerta', pose: 'mano', burbuja: ['?', 'naranja'], prio: 1 },
  te_espera: { sala: 'puerta', pose: 'parado', burbuja: ['•••', 'naranja'], prio: 2 },
  bloqueado: { sala: 'bloqueados', pose: 'triste', burbuja: [{ icono: 'alto' }, 'rojo'] },
  listo_para_revisar: { sala: 'descanso', pose: 'cafe', burbuja: [{ icono: 'listo' }, 'amarillo'] },
  sin_señal: { sala: 'descanso', pose: 'duerme', burbuja: ['zZ', 'gris'] },
}
interface Punto { x: number; y: number }
interface Lugar extends Punto { escritorio?: number; pose?: Pose }
function lugar(sala: Sala, i: number): Lugar {
  if (sala === 'taller') {
    if (i < ESCRITORIOS.length) { const e = ESCRITORIOS[i]; return { x: e.dx + 15, y: e.dy + 24, escritorio: i } }
    return { x: 14 + ((i - ESCRITORIOS.length) % 10) * 22, y: 122, pose: 'parado' }
  }
  if (sala === 'puerta') { // fila frente a tu puerta: el más urgente queda junto a ella
    const xs = [370, 414, 326, 458]
    return { x: xs[i % 4], y: [112, 74, 38][Math.floor(i / 4) % 3] }
  }
  const s = SALAS[sala]
  const paso = sala === 'descanso' ? 36 : 32 // más aire entre sillones: caben nombres más largos
  const cols = Math.floor((s.w - 16) / paso)
  return { x: s.x + 22 + (i % cols) * paso, y: s.y + 58 + (Math.floor(i / cols) % 2) * 36 }
}
const entrada = (sala: Sala) => { const s = SALAS[sala]; return { x: s.puerta, y: s.abajo ? s.y + s.h - 6 : s.y + 26 } }
const enPasillo = (sala: Sala) => ({ x: SALAS[sala].puerta, y: 146 })
const SALIDA = { x: -8, y: 146 } // orilla izquierda del pasillo: por ahí entran y salen las sesiones
// Cuarto donde está parado (null en el pasillo): las rutas salen de ahí aunque vaya a medio camino.
const salaEn = (p: Punto) => (Object.keys(SALAS) as Sala[]).find((k) => {
  const s = SALAS[k]
  return p.x >= s.x && p.x < s.x + s.w && p.y >= s.y && p.y < s.y + s.h && (p.y < 128 || p.y >= 160)
}) ?? null
const rutaA = (desde: Punto, sala: Sala | null, fin: Punto[]) => {
  const ahi = salaEn(desde)
  if (ahi && ahi === sala) return fin
  return [...(ahi ? [entrada(ahi), enPasillo(ahi)] : [{ x: desde.x, y: 146 }]), ...(sala ? [enPasillo(sala), entrada(sala)] : []), ...fin]
}

// Equipo de cada sesión: el suyo de la Armería, si no el de su rol (sprites.ts completa lo que falte).
const guardadoDe = (d: Datos, s: Sesion) => d.aspectos?.[`sesion:${s.id}`] ?? null
const baseDe = (d: Datos, s: Sesion) => (s.rol ? d.aspectos?.[`rol:${s.rol}`] : undefined) ?? null
const VELOCIDAD = 55 // px lógicos por segundo
const EN_MESA = { x: MESA_YO.dx + 14, y: MESA_YO.dy + 6 }
const RODEO = [{ x: MESA_YO.dx - 6, y: MESA_YO.dy + 6 }, { x: MESA_YO.dx - 6, y: MESA_YO.dy + 24 }] // por un lado del escritorio

interface Actor extends Punto {
  ruta: Punto[]; sala: Sala | null; lugar?: Lugar; aspecto: Aspecto; boton: HTMLButtonElement; s?: Sesion
  saliendo?: boolean; destinoClave?: string | null; espera?: boolean; anchoEtiqueta?: number | null; maximo?: number
}
interface Entrega extends Punto { sid: string; id: number; fase: 'espera' | 'va' | 'entrega' | 'regresa'; ruta: Punto[]; regreso?: Punto[]; llego?: number; resultado?: string }

// Sobre que viaja entre dos sesiones (mensaje, encargo o entrega) y destello al llegar (o en su lugar con movimiento reducido).
interface Sobre extends Punto { ruta: Punto[]; tipo: EntreSesiones['tipo'] }
interface Destello extends Punto { t0: number; tipo: EntreSesiones['tipo'] }
const COLOR_SOBRE = { mensaje: '#fffdf5', encargo: '#ffb347', entrega: '#6fe39a', duda: '#ff6b6b', respuesta: '#fffdf5' }
const ROL_CORTO: Record<RolId, string> = { 'analisis-plan': 'PLAN', implementacion: 'IMPL', 'revision-qa': 'QA', 'docs-entrega': 'DOCS', diseno: 'DISEÑO', integracion: 'INTEG' }

export interface Acciones { abrirAgente: (id: string) => void; abrirOficina: (seccion?: string) => void; abrirPizarra: () => void }

export function montarEscena(lienzo: HTMLCanvasElement, escena: HTMLElement, capa: HTMLElement, acciones: Acciones) {
  const movimiento = matchMedia('(prefers-reduced-motion: reduce)')
  let reducido = movimiento.matches
  const alCambiarMovimiento = () => { reducido = movimiento.matches }
  movimiento.addEventListener('change', alCambiarMovimiento)
  let ctx = lienzo.getContext('2d')! // contexto donde pintan r() y los sprites
  const r = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h) }
  const en = (c: CanvasRenderingContext2D, fn: () => void) => { const previo = ctx; ctx = c; fn(); ctx = previo }
  let datos: Datos | null = null

  const personaje = (x: number, y: number, a: Aspecto, pose: Pose, f: number, vista = 'frente') => dibujarPersona(r, x, y, a, pose, f, { vista, reducido })

  // Subagente: robot de 8×10 px que flota a un lado de su agente.
  function robot(x: number, y: number, f: number, k: number) {
    const ox = Math.round(x) - 4, oy = Math.round(y) - 10 - (reducido ? 0 : (f + k) % 2)
    const p = (cx: number, cy: number, w: number, h: number, c: string) => r(ox + cx, oy + cy, w, h, c)
    r(ox + 1, Math.round(y) - 1, 6, 1, 'rgba(0,0,0,.25)')
    p(4, 0, 1, 1, (f + k) % 4 < 2 ? '#7dffa8' : '#ff6b57'); p(4, 1, 1, 1, '#9aa3ad')
    p(1, 2, 7, 4, '#c3ccd6'); p(1, 5, 7, 1, '#9aa3ad')
    const ojo = (f + k * 3) % 12 === 0 ? '#9aa3ad' : '#3ee0ff'
    p(2, 3, 1, 1, ojo); p(6, 3, 1, 1, ojo)
    p(2, 6, 5, 3, '#7d8794'); p(3, 7, 3, 1, '#ffd84a')
    p(2, 9, 1, 1, '#4a4f58'); p(6, 9, 1, 1, '#4a4f58')
  }

  // Muebles
  function escritorio(dx: number, dy: number) {
    r(dx, dy + 2, 30, 9, '#c88d55'); r(dx, dy + 2, 30, 1, '#dba06a'); r(dx, dy + 11, 30, 3, '#8a5a33')
    r(dx + 1, dy + 14, 2, 2, '#6e4626'); r(dx + 27, dy + 14, 2, 2, '#6e4626')
    r(dx + 7, dy - 9, 16, 11, '#2b2b33'); r(dx + 14, dy + 2, 2, 2, '#2b2b33')
    r(dx + 8, dy - 8, 14, 8, '#11131a')
    r(dx + 9, dy + 6, 12, 3, '#d9d6cf'); r(dx + 9, dy + 8, 12, 1, '#b7b3aa')
    r(dx + 24, dy + 4, 3, 3, '#f4f1ea'); r(dx + 24, dy + 4, 3, 1, '#6b3e1f')
  }
  // Pantalla: código que corre si teclea; barra de progreso si espera un proceso.
  function pantalla(dx: number, dy: number, t: number, espera: boolean) {
    r(dx + 8, dy - 8, 14, 8, PAL.monitor)
    if (espera) {
      r(dx + 10, dy - 5, 10, 2, '#1d3a5c')
      r(dx + 10, dy - 5, 1 + ((reducido ? 5 : t) % 10), 2, PAL.resalte)
      return
    }
    for (let k = 0; k < 4; k++) {
      const w = 3 + ((k * 7 + (reducido ? 0 : t)) % 9)
      r(dx + 9 + (k % 2) * 2, dy - 7 + k * 2, Math.min(w, 11), 1, PAL.codigo[k % 2 ? 1 : 0])
    }
  }
  function planta(x: number, y: number) {
    r(x + 2, y + 8, 8, 6, '#a0522d'); r(x + 2, y + 8, 8, 1, '#c0703f')
    r(x + 3, y + 1, 6, 7, '#3f9b4f'); r(x + 1, y + 3, 3, 4, '#2f7a3c'); r(x + 8, y + 3, 3, 4, '#2f7a3c'); r(x + 5, y, 2, 2, '#58b866')
  }

  // Fondo estático (pisos, muros, puertas y muebles): se pinta una vez en otro lienzo.
  const fondo = document.createElement('canvas')
  fondo.width = W; fondo.height = H
  const pintarFondo = () => en(fondo.getContext('2d')!, () => {
    for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) r(x, y, 16, 16, PAL.pasillo[((x + y) / 16) % 2])
    r(0, 145, W, 2, PAL.linea); r(287, 0, 2, H, PAL.linea)
    for (const s of Object.values(SALAS)) {
      for (let y = s.y + 14; y < s.y + s.h; y += 8) for (let x = s.x; x < s.x + s.w; x += 8) {
        r(x, y, 8, 8, s.piso[((x - s.x) / 8 + (y - s.y - 14) / 8) % 2])
      }
      r(s.x, s.y, s.w, 2, PAL.muroAlto); r(s.x, s.y + 2, s.w, 10, PAL.muro); r(s.x, s.y + 12, s.w, 2, PAL.zocalo)
      r(s.x, s.y, 2, s.h, PAL.borde); r(s.x + s.w - 2, s.y, 2, s.h, PAL.borde); r(s.x, s.y + s.h - 2, s.w, 2, PAL.borde)
      const px = s.puerta - 12
      if (s.abajo) { r(px, s.y + s.h - 2, 24, 2, s.piso[0]); r(px - 2, s.y + s.h - 5, 2, 5, PAL.marco); r(px + 24, s.y + s.h - 5, 2, 5, PAL.marco) }
      else { r(px, s.y, 24, 14, PAL.pasillo[0]); r(px - 2, s.y, 2, 14, PAL.marco); r(px + 24, s.y, 2, 14, PAL.marco) }
    }
    r(150, 3, 52, 9, '#f2f2ee'); r(150, 3, 52, 1, '#9a9a96'); r(153, 5, 18, 1, '#3a7bd5'); r(153, 7, 26, 1, '#d5573a'); r(153, 9, 14, 1, '#3aa66b')
    r(208, 4, 9, 7, '#e9d9a6'); r(220, 5, 9, 6, '#a6d9e9'); r(232, 4, 9, 7, '#f0b7ca')
    for (const e of ESCRITORIOS) escritorio(e.dx, e.dy)
    planta(4, 104); planta(224, 18)
    const p = SALAS.puerta
    r(p.x + 12, p.y + 16, 50, 6, '#8a5a33'); r(p.x + 12, p.y + 22, 50, 2, '#6e4626')
    r(p.puerta - 16, p.y + p.h - 18, 32, 12, '#a8323f'); r(p.puerta - 14, p.y + p.h - 16, 28, 8, '#c64656')
    planta(p.x + p.w - 18, p.y + 16)
    const b = SALAS.bloqueados
    r(b.x + 84, b.y + 86, 16, 14, '#8a6a42'); r(b.x + 84, b.y + 86, 16, 2, '#a9845a'); r(b.x + 6, b.y + 90, 12, 10, '#8a6a42'); r(b.x + 6, b.y + 90, 12, 2, '#a9845a')
    const d = SALAS.descanso
    r(d.x + 8, d.y + 16, 56, 14, '#b5523b'); r(d.x + 8, d.y + 16, 56, 4, '#cf6a50'); r(d.x + 6, d.y + 18, 4, 12, '#8f3f2d'); r(d.x + 62, d.y + 18, 4, 12, '#8f3f2d')
    r(d.x + 128, d.y + 15, 16, 20, '#4a4a52'); r(d.x + 131, d.y + 18, 10, 6, '#22222a'); r(d.x + 133, d.y + 27, 6, 5, '#f4f1ea')
    r(d.x + 104, d.y + 18, 14, 10, '#8a5a33'); r(d.x + 107, d.y + 16, 4, 3, '#f4f1ea')
    planta(d.x + d.w - 18, d.y + d.h - 22)
    const o = SALAS.oficina
    r(o.x + 106, o.y + 2, 30, 12, '#6e4626');
    ['#d5573a', '#3a7bd5', '#e0a526', '#3aa66b', '#9b59b6', '#f4f1ea'].forEach((c, k) => r(o.x + 108 + k * 4, o.y + 4, 3, 8, c))
    r(o.x + 140, o.y + 2, 18, 11, '#f4f1ea'); r(o.x + 140, o.y + 2, 18, 3, '#d5573a')
    for (let k = 0; k < 8; k++) r(o.x + 142 + (k % 4) * 4, o.y + 6 + Math.floor(k / 4) * 3, 2, 2, '#9a9a96')
    r(MESA_YO.dx - 10, MESA_YO.dy - 18, 60, 44, '#3e6b4b'); r(MESA_YO.dx - 8, MESA_YO.dy - 16, 56, 40, '#457656')
    planta(o.x + 6, o.y + o.h - 22)
  })
  leerPaleta(); pintarFondo()
  let sucio = true // hay que volver a pintar aunque nada se mueva (datos, tamaño o tema nuevos)
  const alCambiarTema = () => { leerPaleta(); pintarFondo(); sucio = true }
  addEventListener('oficina-tema', alCambiarTema)
  let yo: Aspecto = aspecto('yo', YO_FABRICA)

  // ── Actores: un personaje por sesión viva ──
  const actores = new Map<string, Actor>()
  let primeraCarga = true // al abrir la página cada quien aparece en su lugar; después caminan al cambiar de estado
  let e = 1 // escala: px de pantalla por px lógico
  function crearBoton(id: string, look: Aspecto) {
    // Cada agente lleva su etiqueta del color de su camisa, para reconocerlo de un vistazo.
    const etiqueta = el('span', { class: 'etiqueta' }, el('span', { class: 'txt' }), el('span', { class: 'ctx' }), el('span', { class: 'rol' }))
    etiqueta.style.background = look.camisa
    etiqueta.style.color = textoSobre(look.camisa)
    const b = el('button', { class: 'agente', type: 'button', 'aria-haspopup': 'dialog', onclick: () => acciones.abrirAgente(id) },
      el('span', { class: 'burbuja' }), el('span', { class: 'caja' }), etiqueta) as HTMLButtonElement
    // El nombre se despliega completo al señalarlo o enfocarlo: se vuelve a medir para que no se salga de la escena.
    for (const ev of ['mouseenter', 'mouseleave', 'focus', 'blur']) b.addEventListener(ev, () => { const a = actores.get(id); if (a) a.anchoEtiqueta = null })
    capa.append(b)
    return b
  }

  // Elementos HTML fijos sobre la escena (letreros de cuartos, tu escritorio, bandeja, calendario, pizarra).
  const fijos: Record<string, { el: HTMLElement; x: number; y: number; centro: string }> = {}
  const fijo = (clave: string, x: number, y: number, nodo: HTMLElement, centro = '') => { nodo.classList.add('fijo'); capa.append(nodo); fijos[clave] = { el: nodo, x, y, centro } }
  for (const [k, s] of Object.entries(SALAS)) fijo(`sala-${k}`, s.x, s.y, el('span', { class: 'cuarto' }, s.titulo))
  fijo('yo', MESA_YO.dx + 14, MESA_YO.dy + 21, el('button', { class: 'objeto', type: 'button', 'aria-haspopup': 'dialog', onclick: () => acciones.abrirOficina() },
    el('span', { class: 'insignia entrar' }, icono('puerta'), 'Tu oficina')), ' translate(-50%, -50%)')
  fijo('bandeja', MESA_YO.dx + 6, MESA_YO.dy - 4, el('button', { class: 'objeto', type: 'button', 'aria-haspopup': 'dialog', onclick: () => acciones.abrirOficina('parati') },
    el('span', { class: 'insignia' }, icono('correo'), el('span'))), ' translate(-50%, -50%)')
  fijo('calendario', SALAS.oficina.x + 149, SALAS.oficina.y + 24, el('button', { class: 'objeto', type: 'button', 'aria-haspopup': 'dialog', onclick: () => acciones.abrirOficina('agenda') },
    el('span', { class: 'insignia' }, icono('calendario'), el('span'))), ' translate(-50%, -50%)')
  fijo('pizarra', SALAS.oficina.x + 44, SALAS.oficina.y + 24, el('button', { class: 'objeto', type: 'button', 'aria-haspopup': 'dialog', onclick: () => acciones.abrirPizarra() },
    el('span', { class: 'insignia neutra' }, icono('pizarra'), el('span'))), ' translate(-50%, -50%)')
  fijo('vacio', 136, 64, el('span', { class: 'aviso-vacio' }, 'Sin agentes de Claude Code activos'), ' translate(-50%, -50%)')

  function actualizarActores(d: Datos) {
    const tareas = tareaPorId(d)
    const vivas = d.sesiones.filter((s) => ROL[s.estado])
    const porSala: Partial<Record<Sala, Sesion[]>> = {}
    for (const s of vivas) (porSala[ROL[s.estado].sala] ??= []).push(s)
    for (const [sala, lista] of Object.entries(porSala) as [Sala, Sesion[]][]) {
      lista.sort((a, b) => (ROL[a.estado].prio ?? 0) - (ROL[b.estado].prio ?? 0) || a.iniciada_ts - b.iniciada_ts || (a.id < b.id ? -1 : 1))
      lista.forEach((s, i) => {
        let a = actores.get(s.id)
        if (a?.saliendo) { a.saliendo = false; a.destinoClave = null; a.boton.disabled = false; a.boton.classList.remove('saliendo') } // volvió
        const guardado = guardadoDe(d, s)
        if (!a) {
          const look = aspecto(s.id, guardado, baseDe(d, s), s.rol)
          a = { x: SALIDA.x, y: SALIDA.y, ruta: [], sala: null, aspecto: look, boton: crearBoton(s.id, look) }
          actores.set(s.id, a)
        }
        const destino = lugar(sala, i)
        if (a.destinoClave !== `${sala}:${i}`) {
          a.destinoClave = `${sala}:${i}`
          if (reducido || primeraCarga) { a.x = destino.x; a.y = destino.y; a.ruta = [] }
          else a.ruta = rutaA(a, sala, [destino])
          a.sala = sala
        }
        a.lugar = destino
        a.s = s
        const look = aspecto(s.id, guardado, baseDe(d, s), s.rol)
        if (JSON.stringify(look) !== JSON.stringify(a.aspecto)) { // cambió su equipo en la Armería
          a.aspecto = look
          const et = a.boton.querySelector<HTMLElement>('.etiqueta')!
          et.style.background = look.camisa; et.style.color = textoSobre(look.camisa)
        }
        a.espera = esperaProcesos(s, d)
        const n = procesosDe(s).length
        const [contenido, color]: Burbuja = a.espera ? [{ icono: 'reloj', texto: String(n) }, 'azul'] : ROL[s.estado].burbuja ?? ['', '']
        const burbuja = a.boton.querySelector<HTMLElement>('.burbuja')!
        const clave = `${typeof contenido === 'string' ? contenido : `${contenido.icono}${contenido.texto ?? ''}`}|${color}`
        if (burbuja.dataset.clave !== clave) {
          burbuja.dataset.clave = clave
          burbuja.replaceChildren(...(typeof contenido === 'string' ? [contenido] : [icono(contenido.icono), contenido.texto ?? '']))
          burbuja.className = `burbuja ${color}`
          burbuja.style.animation = 'none'; void burbuja.offsetWidth; burbuja.style.animation = '' // brota de nuevo con el estado nuevo
        }
        const nombre = guardado?.apodo ?? baseDe(d, s)?.apodo ?? s.nombre ?? s.tarea_id ?? base(s.cwd)
        const etiqueta = a.boton.querySelector<HTMLElement>('.etiqueta')!
        const [txt, barra] = etiqueta.children as unknown as [HTMLElement, HTMLElement]
        if (txt.textContent !== nombre) { txt.textContent = nombre; a.anchoEtiqueta = null }
        const ctxNivel = nivelContexto(d.contexto?.[s.id])
        const claveCtx = ctxNivel ? `${Math.round(ctxNivel.pct * 100)}${ctxNivel.clase}` : ''
        if (barra.dataset.clave !== claveCtx) { // la misma barra cambia de ancho (con transición), no se rehace
          barra.dataset.clave = claveCtx
          if (!ctxNivel) barra.replaceChildren()
          else {
            const i = (barra.firstElementChild as HTMLElement | null) ?? barra.appendChild(el('i'))
            i.className = ctxNivel.clase
            i.style.width = `${Math.min(100, Math.round(ctxNivel.pct * 100))}%`
          }
        }
        const rol = etiqueta.querySelector<HTMLElement>('.rol')!
        const corto = s.rol ? ROL_CORTO[s.rol] ?? s.rol : ''
        if (rol.textContent !== corto) { rol.textContent = corto; a.anchoEtiqueta = null }
        // Ancho máximo según el espacio entre lugares del cuarto; el nombre completo va en el título y en la ficha.
        const maximo = ({ taller: 56, puerta: 42, descanso: 34 } as Record<string, number>)[sala] ?? 30
        if (a.maximo !== maximo) { a.maximo = maximo; etiqueta.style.maxWidth = `calc(var(--e) * ${maximo}px)`; a.anchoEtiqueta = null }
        const tituloRol = s.rol ? d.roles?.find((x) => x.id === s.rol)?.titulo ?? s.rol : ''
        const estadoTexto = a.espera ? `esperando ${n} proceso${n > 1 ? 's' : ''}` : ESTADOS[s.estado]?.[0] ?? s.estado
        const conCtx = ctxNivel ? ` · contexto ${Math.round(ctxNivel.pct * 100)} %` : ''
        const conRol = tituloRol ? ` (rol ${tituloRol})` : ''
        a.boton.setAttribute('aria-label', `${nombreSesion(s, tareas)}${conRol}: ${estadoTexto}${conCtx}`)
        // Escáner (al señalar): modelo y tokens gastados, además de lo que dice el lector de pantalla.
        const g = d.gastos?.[s.id], modelo = d.contexto?.[s.id]?.modelo
        const escaner = `${modelo ? ` · ${modelo.replace(/^claude-/, '')}` : ''}${g ? ` · ${Math.round((g.entrada + g.cache_leida + g.cache_creada + g.salida) / 1000)}k tokens, caché ${g.cache_pct ?? '—'} %` : ''}`
        a.boton.title = `${nombreSesion(s, tareas)}${conRol} · ${estadoTexto}${conCtx}${escaner}`
      })
    }
    // La sesión que se cierra sale caminando por el pasillo y desaparece al llegar a la orilla.
    for (const [id, a] of actores) {
      if (a.saliendo || vivas.some((s) => s.id === id)) continue
      if (reducido || !a.sala) { a.boton.remove(); actores.delete(id); continue }
      a.saliendo = true
      a.boton.disabled = true
      a.boton.classList.add('saliendo')
      a.ruta = rutaA(a, null, [SALIDA])
    }
    primeraCarga = false
    const activos = (porSala.taller ?? []).length + (porSala.puerta ?? []).length + (porSala.bloqueados ?? []).length
    for (const s of Object.keys(SALAS) as Sala[]) {
      const n = (porSala[s] ?? []).length
      fijos[`sala-${s}`].el.textContent = s === 'oficina' ? SALAS[s].titulo
        : s === 'taller' ? `Taller · activos ${activos}/${MAX_ACTIVOS}` : `${SALAS[s].titulo} · ${n}`
    }
    fijos['sala-taller'].el.classList.toggle('lleno', activos > MAX_ACTIVOS)
    fijos.vacio.el.hidden = vivas.length > 0
    // Bandeja y calendario de tu escritorio.
    const paraMi = pendientesParaMi(d).length
    const v = veredicto(d)
    const insignia = (clave: string, texto: string, bien: boolean, etiqueta: string) => {
      const b = fijos[clave].el
      b.querySelector('.insignia span')!.textContent = texto
      b.firstElementChild!.classList.toggle('bien', bien)
      b.setAttribute('aria-label', etiqueta)
    }
    insignia('bandeja', String(paraMi), paraMi === 0, `Bandeja: ${paraMi} comentarios para ti`)
    insignia('calendario', v.vencidas.length ? `${v.vencidas.length} vencidas` : v.hoy.length ? `${v.hoy.length} hoy` : 'al día',
      !v.vencidas.length && !v.hoy.length, `Calendario: ${v.texto}`)
    const pz = resumenPizarra(d)
    insignia('pizarra', [pz.enCurso && `${pz.enCurso} en curso`, pz.revisar && `${pz.revisar} por revisar`].filter(Boolean).join(' · ') || 'pizarra', false,
      `Pizarra: en curso ${pz.enCurso}, por revisar ${pz.revisar}, te tocan ${pz.tocan}`)
  }

  function escalar() {
    e = lienzo.clientWidth / W
    sucio = true
    escena.style.setProperty('--e', String(e))
    for (const f of Object.values(fijos)) f.el.style.transform = `translate(${f.x * e}px, ${f.y * e}px)${f.centro}`
  }
  const observador = new ResizeObserver(escalar)
  observador.observe(lienzo)

  // ── Tú llevas tus mensajes: tu avatar se levanta de su escritorio, entrega en mano y regresa ──
  // Si mandas varios seguidos, los lleva uno tras otro. La entrega real no espera a la animación.
  const entregas: Entrega[] = [] // la primera es la que va en camino
  const mensajesVistos = new Set<number>()
  let mensajesIniciados = false
  function despacharMensajeros(d: Datos) {
    for (const [sid, lista] of Object.entries(d.mensajes ?? {})) {
      for (const m of lista) {
        if (mensajesVistos.has(m.id)) continue
        mensajesVistos.add(m.id)
        if (!mensajesIniciados || reducido || !actores.get(sid)) continue // los que ya existían al abrir la página no se animan
        entregas.push({ sid, id: m.id, fase: 'espera', x: EN_MESA.x, y: EN_MESA.y, ruta: [] })
      }
    }
    mensajesIniciados = true
  }
  function avanzar(o: Punto & { ruta: Punto[] }, dt: number) {
    let avance = VELOCIDAD * dt
    while (avance > 0 && o.ruta.length) {
      const [p] = o.ruta, dx = p.x - o.x, dy = p.y - o.y, dist = Math.hypot(dx, dy)
      if (dist <= avance) { o.x = p.x; o.y = p.y; o.ruta.shift(); avance -= dist }
      else { o.x += (dx / dist) * avance; o.y += (dy / dist) * avance; avance = 0 }
    }
  }
  function moverMensajeros(dt: number) {
    const o = entregas[0]
    if (!o) return
    if (o.fase === 'espera') { // sale ahora: el destino se calcula con el agente donde está en este momento
      const a = actores.get(o.sid)
      if (!a || a.saliendo || !a.sala) { entregas.shift(); return }
      Object.assign(o, { ...EN_MESA, fase: 'va', ruta: [...RODEO, entrada('oficina'), enPasillo('oficina'), enPasillo(a.sala), entrada(a.sala), { x: a.x + 12, y: a.y + 3 }],
        regreso: [entrada(a.sala), enPasillo(a.sala), enPasillo('oficina'), entrada('oficina'), ...[...RODEO].reverse(), EN_MESA] })
    }
    avanzar(o, dt * 1.6) // va con prisa
    if (o.ruta.length) return
    if (o.fase === 'va') { o.fase = 'entrega'; o.llego = performance.now() }
    else if (o.fase === 'entrega') {
      const estado = datos?.mensajes?.[o.sid]?.find((m) => m.id === o.id)?.estado ?? 'enviado'
      o.resultado = estado
      // Espera a que la entrega se confirme (o falle), al menos un momento para que se vea.
      if (estado !== 'enviando' && performance.now() - o.llego! > 900) { o.fase = 'regresa'; o.ruta = o.regreso! }
    } else entregas.shift()
  }
  function dibujarMensajero(o: Entrega, f: number, fCamina: number) {
    if (o.fase === 'espera') return
    const caminando = o.ruta.length > 0
    personaje(o.x, o.y, yo, caminando ? 'camina' : 'parado', caminando ? fCamina : f)
    const ox = Math.round(o.x) - 6, oy = Math.round(o.y) - 16
    if (o.fase === 'va') { r(ox + 9, oy + 8, 4, 3, '#fffdf5'); r(ox + 9, oy + 8, 4, 1, '#c9c6bd') } // sobre en la mano
    if (o.fase === 'entrega') { // globo con el sobre (o una X si no se pudo entregar)
      const bx = ox - 1, by = oy - 13
      r(bx, by, 14, 10, '#1a1922'); r(bx + 1, by + 1, 12, 8, o.resultado === 'error' ? '#ff6b57' : '#fffdf5'); r(bx + 6, by + 10, 2, 2, '#1a1922')
      if (o.resultado === 'error') { for (let k = 0; k < 4; k++) { r(bx + 5 + k, by + 3 + k, 1, 1, '#fff'); r(bx + 8 - k, by + 3 + k, 1, 1, '#fff') } }
      else { r(bx + 3, by + 3, 8, 5, '#f4f1ea'); r(bx + 3, by + 3, 8, 1, '#c9c6bd'); r(bx + 4, by + 4, 2, 1, '#c9c6bd'); r(bx + 8, by + 4, 2, 1, '#c9c6bd'); r(bx + 6, by + 5, 2, 1, '#c9c6bd') }
    }
  }

  // ── Sobres entre sesiones: salen del origen (o de la orilla) y llegan al destino ──
  const sobres: Sobre[] = []
  const destellos: Destello[] = []
  const filasVistas = new Set<number>()
  let filasIniciadas = false
  function despacharEntreSesiones(d: Datos) {
    for (const f of d.entre_sesiones ?? []) {
      if (filasVistas.has(f.id)) continue
      filasVistas.add(f.id)
      const dest = actores.get(f.a_sesion)
      if (!filasIniciadas || !dest || dest.saliendo || !dest.sala) continue // lo anterior a abrir la página no se anima
      const fin = { x: dest.x + 12, y: dest.y - 6 }
      if (reducido) { destellos.push({ ...fin, t0: reloj, tipo: f.tipo }); continue }
      const ori = f.de_sesion ? actores.get(f.de_sesion) : undefined
      const desde = ori && !ori.saliendo ? { x: ori.x + 12, y: ori.y - 6 } : { ...SALIDA }
      sobres.push({ ...desde, tipo: f.tipo, ruta: rutaA(desde, dest.sala, [fin]) })
    }
    filasIniciadas = true
  }
  function moverSobres(dt: number) {
    for (const o of sobres) avanzar(o, dt * 1.8)
    for (let i = sobres.length - 1; i >= 0; i--) if (!sobres[i].ruta.length) { destellos.push({ x: sobres[i].x, y: sobres[i].y, t0: reloj, tipo: sobres[i].tipo }); sobres.splice(i, 1) }
    for (let i = destellos.length - 1; i >= 0; i--) if (reloj - destellos[i].t0 > 0.9) destellos.splice(i, 1)
  }
  function dibujarSobre(x: number, y: number, tipo: EntreSesiones['tipo']) {
    const ox = Math.round(x) - 5, oy = Math.round(y) - 4
    r(ox - 1, oy - 1, 12, 9, '#1a1922'); r(ox, oy, 10, 7, COLOR_SOBRE[tipo])
    r(ox, oy, 10, 1, 'rgba(0,0,0,.25)'); r(ox + 1, oy + 1, 2, 1, 'rgba(0,0,0,.25)'); r(ox + 7, oy + 1, 2, 1, 'rgba(0,0,0,.25)'); r(ox + 3, oy + 2, 4, 1, 'rgba(0,0,0,.25)')
    if (tipo === 'encargo') { r(ox + 4, oy + 3, 2, 3, '#1a1922') } // rayita de "pendiente"
    else if (tipo === 'entrega') { r(ox + 3, oy + 4, 1, 1, '#1a1922'); r(ox + 4, oy + 5, 1, 1, '#1a1922'); r(ox + 5, oy + 4, 1, 1, '#1a1922'); r(ox + 6, oy + 3, 1, 1, '#1a1922') } // palomita
  }
  function dibujarDestello(o: Destello) {
    const k = Math.min(1, (reloj - o.t0) / 0.9), c = COLOR_SOBRE[o.tipo]
    const rad = reducido ? 7 : 3 + Math.round(k * 8)
    ctx.globalAlpha = 1 - k
    r(o.x - rad, o.y - rad, rad * 2, 2, c); r(o.x - rad, o.y + rad - 2, rad * 2, 2, c); r(o.x - rad, o.y - rad, 2, rad * 2, c); r(o.x + rad - 2, o.y - rad, 2, rad * 2, c)
    ctx.globalAlpha = 1
  }

  // ── Bucle de animación ──
  let reloj = 0, previo = performance.now(), cuadroId = 0, ultimoF = -1
  function cuadro(ahora: number) {
    const dt = Math.min(0.1, (ahora - previo) / 1000)
    previo = ahora; reloj += dt
    for (const [id, a] of actores) {
      if (a.saliendo && !a.ruta.length) { a.boton.remove(); actores.delete(id); continue }
      avanzar(a, dt)
    }
    moverMensajeros(dt)
    moverSobres(dt)
    // Quieto, se pinta solo cuando cambia el cuadro de animación (4 por segundo) y no a cada refresco de pantalla.
    const mueve = entregas.length > 0 || sobres.length > 0 || destellos.length > 0 || [...actores.values()].some((a) => a.ruta.length > 0)
    const f = Math.floor(reloj * 4)
    if (!mueve && !sucio && f === ultimoF) { cuadroId = requestAnimationFrame(cuadro); return }
    ultimoF = f; sucio = false
    dibujar(f, Math.floor(reloj * 8))
    const ancho = W * e
    for (const a of actores.values()) {
      // Mismo redondeo que el sprite: la etiqueta no se despega del personaje al caminar. Al frente, el que está más abajo.
      const x = Math.round(a.x) * e
      a.boton.style.transform = `translate(${x}px, ${Math.round(a.y) * e}px)`
      const z = String(Math.round(a.y) + 10)
      if (a.boton.style.zIndex !== z) a.boton.style.zIndex = z
      const etiqueta = a.boton.lastElementChild as HTMLElement // se recorre para no salirse por los bordes de la escena
      a.anchoEtiqueta ??= etiqueta.offsetWidth
      const mitad = a.anchoEtiqueta / 2 + 2
      etiqueta.style.marginLeft = `${Math.min(Math.max(x, mitad), ancho - mitad) - x}px`
    }
    cuadroId = requestAnimationFrame(cuadro)
  }
  function dibujar(f: number, fCamina: number) {
    ctx.drawImage(fondo, 0, 0)
    const lista = [...actores.values()].filter((a) => a.s && a.lugar).sort((a, b) => a.y - b.y)
    const sentado = (a: Actor) => !a.ruta.length && a.lugar?.escritorio != null && a.s!.estado === 'trabajando'
    for (const a of lista) if (sentado(a)) { const d = ESCRITORIOS[a.lugar!.escritorio!]; pantalla(d.dx, d.dy, f + a.lugar!.escritorio! * 3, !!a.espera) }
    if (lista.some((a) => a.s!.estado === 'bloqueado' && !a.ruta.length)) {
      const b = SALAS.bloqueados; r(b.x + 98, b.y + 3, 10, 6, reducido || f % 2 ? '#ff4d3d' : '#7a1e18'); r(b.x + 100, b.y + 9, 6, 2, '#2b2b33')
    }
    for (const a of lista) {
      if (sentado(a)) personaje(a.x, a.y, a.aspecto, a.espera ? 'espera' : 'teclea', f, 'espalda')
      else personaje(a.x, a.y, a.aspecto, a.ruta.length ? 'camina' : (a.lugar!.pose ?? ROL[a.s!.estado]?.pose ?? 'parado'), a.ruta.length ? fCamina : f)
      const subs = (datos?.subagentes ?? []).filter((x) => x.sesion_id === a.s!.id && x.estado === 'trabajando').slice(0, 3)
      subs.forEach((_, k) => robot(a.x + (sentado(a) ? 23 : 13) + k * 10, a.y - (sentado(a) ? 6 : 0) - (k % 2) * 3, f, k))
    }
    if (entregas[0]) dibujarMensajero(entregas[0], f, fCamina)
    for (const o of sobres) dibujarSobre(o.x, o.y, o.tipo)
    for (const o of destellos) dibujarDestello(o)
    const m = MESA_YO
    if (!entregas.length) personaje(EN_MESA.x, EN_MESA.y, yo, 'parado', f) // si va a entregar, su lugar queda vacío
    r(m.dx, m.dy, 40, 10, '#c88d55'); r(m.dx, m.dy, 40, 1, '#dba06a'); r(m.dx, m.dy + 10, 40, 6, '#8a5a33')
    r(m.dx + 25, m.dy - 9, 12, 10, '#2b2b33'); r(m.dx + 30, m.dy + 1, 2, 2, '#2b2b33')
    const n = datos ? pendientesParaMi(datos).length : 0
    r(m.dx + 2, m.dy + 2, 9, 6, '#6e4626')
    for (let k = 0; k < Math.min(n, 6); k++) r(m.dx + 3, m.dy + 5 - k, 7, 1, k % 2 ? '#e8e4da' : '#ffffff')
  }

  // Pestaña oculta: el bucle se detiene; al volver sigue desde donde iba, sin un salto de tiempo.
  const arrancar = () => { if (!cuadroId && !document.hidden) { previo = performance.now(); cuadroId = requestAnimationFrame(cuadro) } }
  const alCambiarVisibilidad = () => { if (document.hidden) { cancelAnimationFrame(cuadroId); cuadroId = 0 } else arrancar() }
  document.addEventListener('visibilitychange', alCambiarVisibilidad)

  escalar()
  arrancar()
  return {
    actualizar(d: Datos) {
      datos = d; sucio = true
      yo = aspecto('yo', d.aspectos?.yo, YO_FABRICA)
      actualizarActores(d); despacharMensajeros(d); despacharEntreSesiones(d)
    },
    destruir() {
      cancelAnimationFrame(cuadroId); cuadroId = 0
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      removeEventListener('oficina-tema', alCambiarTema)
      movimiento.removeEventListener('change', alCambiarMovimiento)
      observador.disconnect(); capa.replaceChildren()
    },
  }
}
