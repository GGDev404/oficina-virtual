// Escena: un <svg> estático de 480×272 px lógicos (pisos, muros y muebles), encima la capa HTML .figuras con todo lo
// que se mueve (personajes, robots, pantallas, lámpara, mensajero, sobres) y encima la capa .capa con los botones de los
// agentes, letreros e insignias. Cada figura es una tira de sprites horneada (hornear.ts) que la GPU recorre con
// transform: en reposo el hilo principal no trabaja por cuadro; el bucle solo mueve a quien camina.
// Es dibujo imperativo: React solo monta el contenedor (Escena.tsx) y le pasa los datos con actualizar().
import { ESTADOS, MAX_ACTIVOS, base, esperaProcesos, nivelContexto, nombreSesion, pendientesParaMi, procesosDe, resumenPizarra, tareaPorId, textoSobre, veredicto } from '@/lib/oficina'
import type { Datos, EntreSesiones, RolId, Sesion } from '@/lib/tipos'
import { temaActual } from '@/lib/tema'
import { pulso, type PoseDef } from './animacion'
import { ESCRITORIOS, MESA_YO, SALAS, W, escenario, mesaYo, type Sala } from './escenarios'
import { CELDA, claveTema, colorDe, enCache, figura, hornearVector, type Figura } from './hornear'
import { actorDe, tiraPersonaje } from './personajes'
import { color as colorValido, nodo } from './rig'
import { aspecto, YO_FABRICA, type Aspecto, type Pose } from './sprites'

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

type Burbuja = [string | { icono: string; texto?: string }, string]
const ROL: Record<string, { sala: Sala; pose: Pose; burbuja?: Burbuja; prio?: number }> = {
  trabajando: { sala: 'taller', pose: 'teclea' },
  necesita_permiso: { sala: 'puerta', pose: 'mano', burbuja: ['!', 'rojo'], prio: 0 },
  duda: { sala: 'puerta', pose: 'mano', burbuja: ['?', 'naranja'], prio: 1 },
  te_espera: { sala: 'puerta', pose: 'parado', burbuja: ['•••', 'naranja'], prio: 2 },
  bloqueado: { sala: 'bloqueados', pose: 'triste', burbuja: [{ icono: 'alto' }, 'rojo'] },
  listo_para_revisar: { sala: 'descanso', pose: 'entrega', burbuja: [{ icono: 'listo' }, 'amarillo'] },
  sin_señal: { sala: 'descanso', pose: 'duerme', burbuja: ['zZ', 'gris'] },
}
interface Punto { x: number; y: number }
interface Lugar extends Punto { escritorio?: number; pose?: Pose }
function lugar(sala: Sala, i: number): Lugar {
  if (sala === 'taller') {
    if (i < ESCRITORIOS.length) { const e = ESCRITORIOS[i]; return { x: e.dx + 15, y: e.dy + 24, escritorio: i } }
    return { x: 14 + ((i - ESCRITORIOS.length) % 10) * 22, y: 122, pose: 'parado' }
  }
  // Entre filas cabe la burbuja de la de adelante sin tapar la etiqueta de la de atrás (personajes de ~26 px de alto).
  if (sala === 'puerta') { // fila frente a tu puerta: el más urgente queda junto a ella
    if (i % 11 >= 8) return { x: [392, 348, 436][i % 11 - 8], y: 86 } // del noveno en adelante: entre columnas, a media altura
    return { x: [370, 414, 326, 458][i % 4], y: [116, 56][Math.floor(i / 4) % 2] }
  }
  const s = SALAS[sala]
  const paso = sala === 'descanso' ? 36 : 32 // más aire entre sillones: caben nombres más largos
  const cols = Math.floor((s.w - 16) / paso)
  const fila = Math.floor(i / cols) % 2 // la segunda fila, adelante y corrida media celda: su burbuja cae entre dos etiquetas
  return { x: s.x + 22 + (i % cols) * paso + (fila * paso) / 2, y: s.y + (fila ? 94 : 54) }
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
  fig: Figura // en .figuras: su transform lo mueve; dentro, su tira y los robots
  camina?: boolean; pantalla?: number | null; claveRobots?: string; margen?: string
}
interface Entrega extends Punto { sid: string; id: number; fase: 'espera' | 'va' | 'entrega' | 'regresa'; ruta: Punto[]; regreso?: Punto[]; llego?: number; resultado?: string }

// Sobre que viaja entre dos sesiones (mensaje, encargo o entrega) y destello al llegar (o en su lugar con movimiento reducido).
interface Sobre extends Punto { ruta: Punto[]; tipo: EntreSesiones['tipo']; el: HTMLElement }
interface Destello extends Punto { t0: number; tipo: EntreSesiones['tipo']; el: HTMLElement }
const COLOR_SOBRE = { mensaje: '#fffdf5', encargo: '#ffb347', entrega: '#6fe39a', duda: '#ff6b6b', respuesta: '#fffdf5' }
const ROL_CORTO: Record<RolId, string> = { 'analisis-plan': 'PLAN', implementacion: 'IMPL', 'revision-qa': 'QA', 'docs-entrega': 'DOCS', diseno: 'DISEÑO', integracion: 'INTEG' }

// ── Decorado que se mueve, horneado como los personajes (pies en 0,0) ──
const QUIETA: PoseDef = { dur: 1, cuadros: 1, partes: {} }
const rects = (g: Element, lista: [number, number, number, number, string, string?][]) => {
  for (const [x, y, width, height, fill, clase] of lista) nodo('rect', { x, y, width, height, fill }, g, clase)
}
// Subagente: robot de 8×10 px que flota; LED que parpadea y ojos que se apagan un instante.
function robotRig() {
  const g = nodo('g', { transform: 'translate(-4 -10)' }, undefined, 'pj')
  rects(g, [[1, 9, 6, 1, 'rgba(0,0,0,.25)']])
  const flota = nodo('g', {}, g, 'flota')
  rects(flota, [[4, 0, 1, 1, '#7dffa8'], [4, 0, 1, 1, '#ff6b57', 'led'], [4, 1, 1, 1, '#9aa3ad'], [1, 2, 7, 4, '#c3ccd6'], [1, 5, 7, 1, '#9aa3ad']])
  rects(nodo('g', {}, flota, 'ojos'), [[2, 3, 1, 1, '#3ee0ff'], [6, 3, 1, 1, '#3ee0ff']])
  rects(flota, [[2, 6, 5, 3, '#7d8794'], [3, 7, 3, 1, '#ffd84a'], [2, 9, 1, 1, '#4a4f58'], [6, 9, 1, 1, '#4a4f58']])
  return g
}
const ROBOT: PoseDef = { dur: 3, cuadros: 12, partes: { // flota cada 0,25 s, LED cada 0,5 s, parpadeo cada 1,5 s
  '.flota': (t) => ({ y: Math.round(t * 12) % 2 ? -1 : 0 }), '.led': (t) => ({ o: Math.floor(t * 6) % 2 }),
  '.ojos': (t) => ({ o: Math.round(t * 12) % 6 === 5 ? 0 : 1 }) } }
// Pantalla de un escritorio (pies = centro del borde de abajo del monitor): código que corre o barra de progreso.
function pantallaRig() {
  const g = nodo('g', {}, undefined, 'pj')
  rects(g, [[-7, -8, 14, 8, colorDe('--esc-monitor', '#11131a')]])
  for (let k = 0; k < 4; k++) {
    const x = -6 + (k % 2) * 2, y = -7 + k * 2
    nodo('rect', { x, y, width: 11, height: 1, fill: colorDe(k % 2 ? '--esc-codigo-2' : '--esc-codigo', '#7dffa8'), 'data-pivote': `${x} ${y + 0.5}` }, g, `linea l${k}`)
  }
  rects(g, [[-5, -5, 10, 2, '#1d3a5c', 'fondo-barra']])
  nodo('rect', { x: -5, y: -5, width: 10, height: 2, fill: colorDe('--esc-resalte', '#5fd4f4'), 'data-pivote': '-5 -4' }, g, 'barra')
  return g
}
const TECLEA_PANTALLA: PoseDef = { dur: 2.8, cuadros: 14, ocultar: ['.barra', '.fondo-barra'], partes: Object.fromEntries([2, 1, 3, 1].map((k, i) =>
  [`.l${i}`, (t: number) => ({ sx: 1 - 0.73 * pulso(t, k, i * 0.2) })])) }
const ESPERA_PANTALLA: PoseDef = { dur: 1.25, cuadros: 10, ocultar: ['.linea'], partes: { '.barra': (t) => ({ sx: 0.1 + 0.9 * ((t + 0.45) % 1) }) } }
// Lámpara roja de Bloqueados: encendida en el cuadro 0 (así queda con movimiento reducido), una vez por segundo.
function lamparaRig() {
  const g = nodo('g', {}, undefined, 'pj')
  rects(g, [[-5, -8, 10, 6, '#ff4d3d'], [-5, -8, 10, 6, '#7a1e18', 'apagada'], [-3, -2, 6, 2, '#2b2b33']])
  return g
}
const LAMPARA: PoseDef = { dur: 1, cuadros: 2, partes: { '.apagada': (t) => ({ o: t >= 0.5 ? 1 : 0 }) } }
const COLOR_SOBRE_OSCURO = '#1a1922'
function sobreRig(tipo: EntreSesiones['tipo']) { // sobre de 10×7 px centrado en (0, -1)
  const g = nodo('g', {}, undefined, 'pj'), sombra = 'rgba(0,0,0,.25)'
  rects(g, [[-6, -5, 12, 9, COLOR_SOBRE_OSCURO], [-5, -4, 10, 7, COLOR_SOBRE[tipo]], [-5, -4, 10, 1, sombra], [-4, -3, 2, 1, sombra], [2, -3, 2, 1, sombra], [-2, -2, 4, 1, sombra]])
  if (tipo === 'encargo') rects(g, [[-1, -1, 2, 3, COLOR_SOBRE_OSCURO]]) // rayita de "pendiente"
  else if (tipo === 'entrega') rects(g, [[-2, 0, 1, 1, COLOR_SOBRE_OSCURO], [-1, 1, 1, 1, COLOR_SOBRE_OSCURO], [0, 0, 1, 1, COLOR_SOBRE_OSCURO], [1, -1, 1, 1, COLOR_SOBRE_OSCURO]]) // palomita
  return g
}
// Globo del mensajero al entregar: el sobre, o una X roja si no se pudo.
function globoRig(error: boolean) {
  const g = nodo('g', { transform: 'translate(-7 -28)' }, undefined, 'pj') // la figura va 12 px más arriba: el globo cabe en su celda
  rects(g, [[0, 0, 14, 10, '#1a1922'], [6, 10, 2, 2, '#1a1922'], [1, 1, 12, 8, error ? '#ff6b57' : '#fffdf5']])
  if (error) for (let k = 0; k < 4; k++) rects(g, [[5 + k, 3 + k, 1, 1, '#fff'], [8 - k, 3 + k, 1, 1, '#fff']])
  else for (const [x, y, w, h] of [[3, 3, 8, 5], [3, 3, 8, 1], [4, 4, 2, 1], [8, 4, 2, 1], [6, 5, 2, 1]]) rects(g, [[x, y, w, h, y === 3 && h === 5 ? '#f4f1ea' : '#c9c6bd']])
  return g
}
const decorado = (clave: string, rig: () => SVGGElement, pose = QUIETA) => enCache(`deco|${clave}|${claveTema()}`, () => hornearVector(rig(), pose))
/** Coloca una figura por sus pies en px lógicos (CSS con --e: sigue sola al cambiar de tamaño). */
function fijar(f: Figura, x: number, y: number) { f.el.style.left = `calc(var(--e) * ${x}px)`; f.el.style.top = `calc(var(--e) * ${y}px)`; return f }
/** Coloca una figura dentro de otra, por sus pies relativos a los pies de la de afuera (su caja empieza en CELDA.x, CELDA.y). */
const colgar = (f: Figura, x: number, y: number) => fijar(f, x - CELDA.x, y - CELDA.y)

export interface Acciones { abrirAgente: (id: string) => void; abrirOficina: (seccion?: string) => void; abrirPizarra: () => void }

export function montarEscena(svg: SVGSVGElement, escena: HTMLElement, capa: HTMLElement, acciones: Acciones) {
  const movimiento = matchMedia('(prefers-reduced-motion: reduce)')
  let reducido = movimiento.matches
  const alCambiarMovimiento = () => { reducido = movimiento.matches }
  movimiento.addEventListener('change', alCambiarMovimiento)
  // Otro tema puede repartir otros personajes: las claves de rig llevan el tema y sincronizar() los rehace.
  const alCambiarTema = () => { sucio = true; arrancar() }
  addEventListener('oficina-tema', alCambiarTema)
  let datos: Datos | null = null
  const capaFondo = svg.querySelector('#fondo')!
  const figuras = el('div', { class: 'figuras' })
  capa.before(figuras)
  const px = (o: Punto) => `translate(${o.x * e}px, ${o.y * e}px)` // figura y botón con el mismo valor: la etiqueta no se despega

  // Fondo (pisos, muros, puertas y muebles): se construye una vez; los tokens --esc-* lo recolorean al cambiar de tema.
  // Fondo del tema (estático) y su decorado animado en .figuras; se rehace solo si cambia el tema o su modo.
  const decorados: Figura[] = []
  let temaFondo = ''
  let hojasMesa = -1, hacerMesa: () => SVGGElement = mesaYo // tu escritorio: el del tema, o el de madera (pintarMesa, más abajo)
  function ponerFondo() {
    if (temaFondo === claveTema()) return
    temaFondo = claveTema()
    const esc = escenario(temaActual())
    capaFondo.replaceChildren(esc.g)
    hacerMesa = esc.mesa ?? mesaYo; hojasMesa = -1
    for (const f of decorados.splice(0)) f.el.remove()
    for (const a of esc.animados) {
      const f = fijar(figura('decorado'), a.x, a.y)
      f.el.style.zIndex = String(a.z ?? 0)
      f.poner(decorado(`esc-${a.clave}`, a.rig, a.pose))
      figuras.append(f.el); decorados.push(f)
    }
  }
  ponerFondo()
  // Pantallas de los escritorios (encendidas mientras alguien teclea o espera ahí) y la lámpara de Bloqueados.
  const pantallas = ESCRITORIOS.map((d) => { const f = fijar(figura('pantalla'), d.dx + 15, d.dy); f.el.hidden = true; f.el.style.zIndex = String(d.dy); figuras.append(f.el); return f })
  const lampara = fijar(figura('decorado'), SALAS.bloqueados.x + 103, SALAS.bloqueados.y + 11)
  lampara.el.hidden = true
  figuras.append(lampara.el)
  let sucio = true // hay que sincronizar aunque nada se mueva (datos o tamaño nuevos)
  let yo: Aspecto = aspecto('yo', YO_FABRICA)

  // ── Actores: un personaje por sesión viva ──
  const actores = new Map<string, Actor>()
  let primeraCarga = true // al abrir la página cada quien aparece en su lugar; después caminan al cambiar de estado
  let e = 1 // escala: px de pantalla por px lógico
  function crearBoton(id: string, look: Aspecto) {
    // Cada agente lleva su etiqueta del color de su camisa, para reconocerlo de un vistazo.
    const etiqueta = el('span', { class: 'etiqueta' }, el('span', { class: 'txt' }), el('span', { class: 'ctx' }), el('span', { class: 'rol' }))
    etiqueta.style.background = colorValido(look.camisa, '#336fc6')
    etiqueta.style.color = textoSobre(colorValido(look.camisa, '#336fc6'))
    const b = el('button', { class: 'agente', type: 'button', 'aria-haspopup': 'dialog', onclick: () => acciones.abrirAgente(id) },
      el('span', { class: 'burbuja' }), el('span', { class: 'caja' }), etiqueta) as HTMLButtonElement
    // El nombre se despliega completo al señalarlo o enfocarlo: se vuelve a medir para que no se salga de la escena.
    for (const ev of ['mouseenter', 'mouseleave', 'focus', 'blur']) b.addEventListener(ev, () => { const a = actores.get(id); if (a?.s) { a.anchoEtiqueta = null; posicionar(a) } })
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

  function quitar(id: string, a: Actor) {
    a.boton.remove(); a.fig.el.remove(); actores.delete(id)
    if (a.pantalla != null) pantallas[a.pantalla].el.hidden = true
  }

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
          a = { x: SALIDA.x, y: SALIDA.y, ruta: [], sala: null, aspecto: look, boton: crearBoton(s.id, look), fig: figura() }
          figuras.append(a.fig.el)
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
          et.style.background = colorValido(look.camisa, '#336fc6'); et.style.color = textoSobre(colorValido(look.camisa, '#336fc6'))
        }
        a.espera = esperaProcesos(s, d)
        const n = procesosDe(s).length
        const [contenido, color]: Burbuja = a.espera ? [{ icono: 'reloj', texto: String(n) }, 'azul'] : ROL[s.estado].burbuja ?? ['', '']
        const burbuja = a.boton.querySelector<HTMLElement>('.burbuja')!
        const clave = `${typeof contenido === 'string' ? contenido : `${contenido.icono}${contenido.texto ?? ''}`}|${color}`
        if (burbuja.dataset.clave !== clave) { // una burbuja nueva brota sola con el estado nuevo (sin forzar layout)
          const nueva = el('span', { class: `burbuja ${color}` }, ...(typeof contenido === 'string' ? [contenido] : [icono(contenido.icono), contenido.texto ?? '']))
          nueva.dataset.clave = clave
          burbuja.replaceWith(nueva)
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
      if (reducido || !a.sala) { quitar(id, a); continue }
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
    e = svg.clientWidth / W
    sucio = true
    escena.style.setProperty('--e', String(e))
    for (const f of Object.values(fijos)) f.el.style.transform = `translate(${f.x * e}px, ${f.y * e}px)${f.centro}`
    avatarMesa.el.style.transform = px(EN_MESA); avatarMesa.el.style.zIndex = String(EN_MESA.y)
    claveMensajero = '' // el mensajero se recoloca con la escala nueva
    arrancar()
  }
  const observador = new ResizeObserver(escalar)
  observador.observe(svg)

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
  // Tu escritorio va en .figuras, ordenado por su borde de abajo: tapa las piernas de tu avatar y del mensajero que sale.
  const mesa = el('img', { class: 'mueble', alt: '', draggable: 'false' }) as HTMLImageElement
  Object.assign(mesa.style, { left: `calc(var(--e) * ${MESA_YO.dx - 1}px)`, top: `calc(var(--e) * ${MESA_YO.dy - 10}px)`,
    width: 'calc(var(--e) * 42px)', height: 'calc(var(--e) * 27px)', zIndex: String(MESA_YO.dy + 16) })
  figuras.append(mesa)
  function pintarMesa(hojas: number) { // la pila de la bandeja: una hoja por pendiente para ti, hasta 6
    if (hojas === hojasMesa) return
    hojasMesa = hojas
    const g = hacerMesa()
    ;[...g.querySelector('.pila')!.children].forEach((h, k) => { if (k >= hojas) h.remove() })
    mesa.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MESA_YO.dx - 1} ${MESA_YO.dy - 10} 42 27">${new XMLSerializer().serializeToString(g)}</svg>`)}`
  }
  pintarMesa(0)
  // Tu avatar de pie tras el escritorio y el mensajero (con el sobre en la mano o el globo de la entrega).
  const avatarMesa = figura(), mensajero = figura()
  const sobreMano = colgar(figura(), 6.5, -7), globo = colgar(figura(), 0, -12)
  mensajero.el.append(sobreMano.el, globo.el)
  figuras.append(avatarMesa.el, mensajero.el)
  let claveMensajero = ''
  function construirYo() { // con tu equipo de la Armería y el tema en uso (la tira sale de la caché si no cambió nada)
    avatarMesa.poner(tiraPersonaje(yo, temaActual(), 'yo', 'parado'))
    sobreMano.poner(decorado('sobre-mano', () => { const g = sobreRig('mensaje'); g.setAttribute('transform', 'scale(.5)'); return g }))
    claveMensajero = ''
  }
  function sincronizarMensajero() { // solo cambia el DOM cuando cambia algo; el loop únicamente mueve su transform
    const o = entregas[0], visible = !!o && o.fase !== 'espera'
    const clave = `${entregas.length > 0}|${visible ? `${o.fase}|${o.ruta.length > 0}|${o.resultado}` : ''}`
    const cambio = clave !== claveMensajero
    if (cambio) {
      claveMensajero = clave
      avatarMesa.el.hidden = entregas.length > 0 // si va a entregar, su lugar queda vacío
      mensajero.el.hidden = !visible
      if (visible) {
        mensajero.poner(tiraPersonaje(yo, temaActual(), 'yo', o.ruta.length ? 'camina' : 'parado'))
        sobreMano.el.hidden = o.fase !== 'va'
        globo.el.hidden = o.fase !== 'entrega'
        const error = o.resultado === 'error'
        globo.poner(decorado(error ? 'globo-error' : 'globo', () => globoRig(error)))
      }
    }
    if (visible && (cambio || o.ruta.length)) { mensajero.el.style.transform = px(o); mensajero.el.style.zIndex = String(Math.round(o.y)) }
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
      if (reducido) { destellos.push({ ...fin, t0: reloj, tipo: f.tipo, el: nuevoDestello(fin, f.tipo) }); continue }
      const ori = f.de_sesion ? actores.get(f.de_sesion) : undefined
      const desde = ori && !ori.saliendo ? { x: ori.x + 12, y: ori.y - 6 } : { ...SALIDA }
      sobres.push({ ...desde, tipo: f.tipo, ruta: rutaA(desde, dest.sala, [fin]), el: nuevoSobre(desde, f.tipo) })
    }
    filasIniciadas = true
  }
  function moverSobres(dt: number) {
    for (const o of sobres) { avanzar(o, dt * 1.8); o.el.style.transform = px(o) }
    for (let i = sobres.length - 1; i >= 0; i--) {
      const o = sobres[i]
      if (o.ruta.length) continue
      o.el.remove(); sobres.splice(i, 1)
      destellos.push({ x: o.x, y: o.y, t0: reloj, tipo: o.tipo, el: nuevoDestello(o, o.tipo) })
    }
    for (let i = destellos.length - 1; i >= 0; i--) if (reloj - destellos[i].t0 > 0.9) { destellos[i].el.remove(); destellos.splice(i, 1) }
  }
  function nuevoSobre(p: Punto, tipo: EntreSesiones['tipo']) { // sobre de 10×7 px centrado en su punto, por encima de todos
    const f = figura('vuela')
    f.poner(decorado(`sobre-${tipo}`, () => sobreRig(tipo)))
    f.el.style.transform = px(p)
    figuras.append(f.el)
    return f.el
  }
  function nuevoDestello(p: Punto, tipo: EntreSesiones['tipo']) { // aro que crece y se desvanece (CSS); con movimiento reducido queda quieto 0,9 s
    const d = el('span', { class: 'destello' }, el('i'))
    d.style.transform = px(p)
    d.style.setProperty('--c', COLOR_SOBRE[tipo])
    figuras.append(d)
    return d
  }

  // ── Bucle de animación ──
  let reloj = 0, previo = performance.now(), cuadroId = 0
  // Fija lo que hace el actor: sentado en su escritorio (de espaldas, con pantalla), caminando o en la pose de su estado.
  // La tira sale de la caché (tema, equipo y pose): cambiar de pose es cambiar la imagen, sin rehacer nada.
  function aplicar(a: Actor) {
    const s = a.s!
    a.camina = a.ruta.length > 0
    const sentado = !a.camina && a.lugar?.escritorio != null && s.estado === 'trabajando'
    const pose: Pose = sentado ? (a.espera ? 'espera' : 'teclea') : a.camina ? 'camina' : a.lugar?.pose ?? ROL[s.estado]?.pose ?? 'parado'
    a.fig.poner(tiraPersonaje(a.aspecto, temaActual(), actorDe(s.id, s.rol), pose))
    // Pantalla del escritorio: código que corre si teclea, barra de progreso si espera un proceso.
    const p = sentado ? a.lugar!.escritorio! : null
    if (a.pantalla != null && a.pantalla !== p) pantallas[a.pantalla].el.hidden = true
    a.pantalla = p
    if (p != null) {
      pantallas[p].el.hidden = false
      pantallas[p].poner(a.espera ? decorado('pantalla-espera', pantallaRig, ESPERA_PANTALLA) : decorado('pantalla-teclea', pantallaRig, TECLEA_PANTALLA))
    }
    // Subagentes trabajando: hasta 3 robots que flotan a un lado.
    const subs = (datos?.subagentes ?? []).filter((x) => x.sesion_id === s.id && x.estado === 'trabajando').slice(0, 3).length
    const claveRobots = `${subs}|${sentado}|${claveTema()}`
    if (a.claveRobots !== claveRobots) {
      a.claveRobots = claveRobots
      for (const r of a.fig.el.querySelectorAll(':scope > .robot')) r.remove()
      for (let k = 0; k < subs; k++) {
        const bot = colgar(figura('robot'), (sentado ? 23 : 13) + k * 10, -(sentado ? 6 : 0) - (k % 2) * 3)
        bot.poner(decorado('robot', robotRig, ROBOT))
        a.fig.el.append(bot.el)
      }
    }
  }
  // Mueve al actor y su botón con el mismo valor (sin redondear: camina suave); al frente, el que está más abajo.
  function posicionar(a: Actor) {
    const t = px(a)
    a.fig.el.style.transform = t
    a.boton.style.transform = t
    const z = String(Math.round(a.y) + 10)
    if (a.boton.style.zIndex !== z) { a.boton.style.zIndex = z; a.fig.el.style.zIndex = z }
    const x = a.x * e
    const etiqueta = a.boton.lastElementChild as HTMLElement // se recorre para no salirse por los bordes de la escena
    a.anchoEtiqueta ??= etiqueta.offsetWidth
    const mitad = a.anchoEtiqueta / 2 + 2
    const margen = `${Math.round(Math.min(Math.max(x, mitad), W * e - mitad) - x)}px`
    if (a.margen !== margen) { a.margen = margen; etiqueta.style.marginLeft = margen }
  }
  // La lámpara roja de Bloqueados parpadea mientras haya alguien quieto ahí.
  function lamparaSegun() {
    lampara.el.hidden = ![...actores.values()].some((a) => a.s?.estado === 'bloqueado' && !a.ruta.length)
    if (!lampara.el.hidden) lampara.poner(decorado('lampara', lamparaRig, LAMPARA))
  }
  function sincronizar() { // tras datos nuevos, un cambio de tamaño o de tema
    ponerFondo()
    construirYo()
    const vivos = [...actores.values()].filter((a) => a.s)
    for (const a of vivos) aplicar(a)
    for (const a of vivos) a.anchoEtiqueta ??= (a.boton.lastElementChild as HTMLElement).offsetWidth // un solo layout para todas
    for (const a of vivos) posicionar(a)
    lamparaSegun()
    pintarMesa(Math.min(datos ? pendientesParaMi(datos).length : 0, 6))
  }
  function cuadro(ahora: number) {
    const dt = Math.min(0.1, (ahora - previo) / 1000)
    previo = ahora; reloj += dt
    let cambio = false
    for (const [id, a] of actores) {
      if (a.saliendo && !a.ruta.length) { quitar(id, a); cambio = true; continue }
      if (!a.ruta.length && !a.camina) continue
      avanzar(a, dt)
      if ((a.ruta.length > 0) !== a.camina) aplicar(a) // empezó o dejó de caminar: otra pose, otra vista, otra pantalla
      posicionar(a)
      cambio = true
    }
    moverMensajeros(dt)
    moverSobres(dt)
    sincronizarMensajero()
    if (sucio) { sucio = false; sincronizar() } else if (cambio) lamparaSegun()
    // En reposo el bucle se duerme: un cuadro del hilo principal haría que Chrome recalculara el estilo de cada figura
    // animada. Lo despiertan datos nuevos, un cambio de tamaño o de tema (arrancar).
    cuadroId = cambio || entregas.length || sobres.length || destellos.length ? requestAnimationFrame(cuadro) : 0
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
      arrancar()
    },
    destruir() {
      cancelAnimationFrame(cuadroId); cuadroId = 0
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      movimiento.removeEventListener('change', alCambiarMovimiento)
      removeEventListener('oficina-tema', alCambiarTema)
      observador.disconnect(); capa.replaceChildren(); capaFondo.replaceChildren(); figuras.remove()
    },
  }
}
