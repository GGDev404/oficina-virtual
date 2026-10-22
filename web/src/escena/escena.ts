// Escena en SVG: un <svg> de 480×272 px lógicos (#fondo, #actores, #efectos) y encima una capa HTML con los botones de
// los agentes, letreros e insignias. Cada personaje es un grupo con el rig de personajes.ts: el bucle solo mueve su
// transform mientras camina y las poses son una clase CSS. Es dibujo imperativo: React solo monta el contenedor
// (Escena.tsx) y le pasa los datos con actualizar().
import { ESTADOS, MAX_ACTIVOS, base, esperaProcesos, nivelContexto, nombreSesion, pendientesParaMi, procesosDe, resumenPizarra, tareaPorId, textoSobre, veredicto } from '@/lib/oficina'
import type { Datos, EntreSesiones, RolId, Sesion } from '@/lib/tipos'
import { temaActual } from '@/lib/tema'
import { ESCRITORIOS, MESA_YO, SALAS, W, escenario, mesaYo, type Sala } from './escenarios'
import { actorDe, clasePose, construirPersonaje, nodo, type Vista } from './personajes'
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
  g: SVGGElement // raíz en #actores: su transform lo mueve; dentro, el rig (siempre el primero) y los robots
  camina?: boolean; claveRig?: string; pose?: Pose; pantalla?: Element | null; claveRobots?: string; margen?: string
}
interface Entrega extends Punto { sid: string; id: number; fase: 'espera' | 'va' | 'entrega' | 'regresa'; ruta: Punto[]; regreso?: Punto[]; llego?: number; resultado?: string }

// Sobre que viaja entre dos sesiones (mensaje, encargo o entrega) y destello al llegar (o en su lugar con movimiento reducido).
interface Sobre extends Punto { ruta: Punto[]; tipo: EntreSesiones['tipo']; g: SVGGElement }
interface Destello extends Punto { t0: number; tipo: EntreSesiones['tipo']; g: SVGGElement }
const COLOR_SOBRE = { mensaje: '#fffdf5', encargo: '#ffb347', entrega: '#6fe39a', duda: '#ff6b6b', respuesta: '#fffdf5' }
const ROL_CORTO: Record<RolId, string> = { 'analisis-plan': 'PLAN', implementacion: 'IMPL', 'revision-qa': 'QA', 'docs-entrega': 'DOCS', diseno: 'DISEÑO', integracion: 'INTEG' }

export interface Acciones { abrirAgente: (id: string) => void; abrirOficina: (seccion?: string) => void; abrirPizarra: () => void }

export function montarEscena(svg: SVGSVGElement, escena: HTMLElement, capa: HTMLElement, acciones: Acciones) {
  const movimiento = matchMedia('(prefers-reduced-motion: reduce)')
  let reducido = movimiento.matches
  const alCambiarMovimiento = () => { reducido = movimiento.matches }
  movimiento.addEventListener('change', alCambiarMovimiento)
  let datos: Datos | null = null
  const capaFondo = svg.querySelector('#fondo')!, capaActores = svg.querySelector('#actores')!, capaEfectos = svg.querySelector('#efectos')!
  const grupo = (padre: Element, clase: string) => nodo('g', {}, padre, clase)
  const px = (o: Punto) => `translate(${Math.round(o.x)}px, ${Math.round(o.y)}px)` // el mismo redondeo que la etiqueta: no se despega al caminar

  // Subagente: robot de 8×10 px que flota a un lado de su agente (pies en el origen). Todo su movimiento es CSS.
  function robot(k: number) {
    const g = nodo('g', { transform: 'translate(-4 -10)' }), c = (x: number, y: number, w: number, h: number, fill: string, padre: Element = g, clase = '') => nodo('rect', { x, y, width: w, height: h, fill }, padre, clase)
    const flota = nodo('g', { style: `animation-delay:${-k * 0.25}s` }, g, 'robot-flota')
    c(1, 9, 6, 1, 'rgba(0,0,0,.25)', g)
    c(4, 0, 1, 1, '#7dffa8', flota); c(4, 0, 1, 1, '#ff6b57', flota, 'robot-led').style.animationDelay = `${-k * 0.5}s`; c(4, 1, 1, 1, '#9aa3ad', flota)
    c(1, 2, 7, 4, '#c3ccd6', flota); c(1, 5, 7, 1, '#9aa3ad', flota)
    const ojos = nodo('g', { style: `animation-delay:${-k * 0.375}s` }, flota, 'robot-ojos')
    c(2, 3, 1, 1, '#3ee0ff', ojos); c(6, 3, 1, 1, '#3ee0ff', ojos)
    c(2, 6, 5, 3, '#7d8794', flota); c(3, 7, 3, 1, '#ffd84a', flota)
    c(2, 9, 1, 1, '#4a4f58', flota); c(6, 9, 1, 1, '#4a4f58', flota)
    return g
  }

  // Fondo (pisos, muros, puertas, muebles y pantallas): se construye una vez; los tokens --esc-* lo recolorean al cambiar de tema.
  const fondo = escenario()
  capaFondo.append(fondo)
  const pantallas = [...fondo.querySelectorAll('.pantalla')]
  // La lámpara roja de Bloqueados parpadea (CSS) mientras haya alguien quieto ahí.
  const lampara = nodo('g', {}, fondo, 'lampara')
  nodo('rect', { x: SALAS.bloqueados.x + 98, y: SALAS.bloqueados.y + 3, width: 10, height: 6, fill: '#ff4d3d' }, lampara)
  nodo('rect', { x: SALAS.bloqueados.x + 98, y: SALAS.bloqueados.y + 3, width: 10, height: 6, fill: '#7a1e18' }, lampara, 'apagada')
  nodo('rect', { x: SALAS.bloqueados.x + 100, y: SALAS.bloqueados.y + 9, width: 6, height: 2, fill: '#2b2b33' }, lampara)
  lampara.style.display = 'none'
  let sucio = true // hay que sincronizar aunque nada se mueva (datos o tamaño nuevos)
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

  function quitar(id: string, a: Actor) {
    a.boton.remove(); a.g.remove(); actores.delete(id)
    a.pantalla?.setAttribute('class', 'pantalla')
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
          a = { x: SALIDA.x, y: SALIDA.y, ruta: [], sala: null, aspecto: look, boton: crearBoton(s.id, look), g: nodo('g', {}, capaActores, 'actor') }
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
  // Capas de #efectos, de abajo arriba: el mensajero, los sobres, los destellos, tu avatar y tu escritorio (que tapa sus piernas).
  const rect = (g: Element, x: number, y: number, width: number, height: number, fill: string) => nodo('rect', { x, y, width, height, fill }, g)
  const mensajero = grupo(capaEfectos, 'actor') // rig, sobre en la mano y globo; solo se ve mientras entrega
  const capaSobres = grupo(capaEfectos, 'sobres'), capaDestellos = grupo(capaEfectos, 'destellos')
  const avatarMesa = grupo(capaEfectos, 'actor')
  capaEfectos.append(mesaYo())
  const pila = capaEfectos.querySelector('.pila')!
  avatarMesa.style.transform = px(EN_MESA)
  const sobreMano = grupo(mensajero, 'sobre-mano')
  rect(sobreMano, 4.5, -9, 4, 3, '#fffdf5'); rect(sobreMano, 4.5, -9, 4, 1, '#c9c6bd')
  const globo = nodo('g', { transform: 'translate(-7 -40)' }, mensajero, 'globo') // globo con el sobre (o una X si no se pudo entregar)
  rect(globo, 0, 0, 14, 10, '#1a1922'); rect(globo, 6, 10, 2, 2, '#1a1922')
  const fondoGlobo = rect(globo, 1, 1, 12, 8, '#fffdf5')
  const carta = grupo(globo, 'carta'), cruz = grupo(globo, 'cruz')
  for (const [x, y, w, h] of [[3, 3, 8, 5], [3, 3, 8, 1], [4, 4, 2, 1], [8, 4, 2, 1], [6, 5, 2, 1]]) rect(carta, x, y, w, h, y === 3 && h === 5 ? '#f4f1ea' : '#c9c6bd')
  for (let k = 0; k < 4; k++) { rect(cruz, 5 + k, 3 + k, 1, 1, '#fff'); rect(cruz, 8 - k, 3 + k, 1, 1, '#fff') }
  let claveYo = '', claveMensajero = '', rigMensajero: SVGGElement | null = null
  function construirYo() { // tu avatar de pie en el escritorio y el mismo para el mensajero, con tu equipo de la Armería
    const clave = JSON.stringify(yo)
    if (clave === claveYo) return
    claveYo = clave
    const pieza = { aspecto: yo, vista: 'frente' as Vista }
    const rigMesa = construirPersonaje(pieza, temaActual(), 'yo')
    rigMesa.setAttribute('class', clasePose('parado'))
    avatarMesa.replaceChildren(rigMesa)
    rigMensajero?.remove()
    rigMensajero = construirPersonaje(pieza, temaActual(), 'yo')
    mensajero.prepend(rigMensajero)
    claveMensajero = ''
  }
  function sincronizarMensajero() { // solo cambia el DOM cuando cambia algo; el loop únicamente mueve su transform
    const o = entregas[0], visible = !!o && o.fase !== 'espera'
    const clave = `${entregas.length > 0}|${visible ? `${o.fase}|${o.ruta.length > 0}|${o.resultado}` : ''}`
    const cambio = clave !== claveMensajero
    if (cambio) {
      claveMensajero = clave
      avatarMesa.style.display = entregas.length ? 'none' : '' // si va a entregar, su lugar queda vacío
      mensajero.style.display = visible ? '' : 'none'
      if (visible) {
        rigMensajero?.setAttribute('class', clasePose(o.ruta.length ? 'camina' : 'parado'))
        sobreMano.style.display = o.fase === 'va' ? '' : 'none'
        globo.style.display = o.fase === 'entrega' ? '' : 'none'
        const error = o.resultado === 'error'
        fondoGlobo.setAttribute('fill', error ? '#ff6b57' : '#fffdf5')
        carta.style.display = error ? 'none' : ''; cruz.style.display = error ? '' : 'none'
      }
    }
    if (visible && (cambio || o.ruta.length)) mensajero.style.transform = px(o)
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
      if (reducido) { destellos.push({ ...fin, t0: reloj, tipo: f.tipo, g: nuevoDestello(fin, f.tipo) }); continue }
      const ori = f.de_sesion ? actores.get(f.de_sesion) : undefined
      const desde = ori && !ori.saliendo ? { x: ori.x + 12, y: ori.y - 6 } : { ...SALIDA }
      sobres.push({ ...desde, tipo: f.tipo, ruta: rutaA(desde, dest.sala, [fin]), g: nuevoSobre(desde, f.tipo) })
    }
    filasIniciadas = true
  }
  function moverSobres(dt: number) {
    for (const o of sobres) { avanzar(o, dt * 1.8); o.g.style.transform = px(o) }
    for (let i = sobres.length - 1; i >= 0; i--) {
      const o = sobres[i]
      if (o.ruta.length) continue
      o.g.remove(); sobres.splice(i, 1)
      destellos.push({ x: o.x, y: o.y, t0: reloj, tipo: o.tipo, g: nuevoDestello(o, o.tipo) })
    }
    for (let i = destellos.length - 1; i >= 0; i--) if (reloj - destellos[i].t0 > 0.9) { destellos[i].g.remove(); destellos.splice(i, 1) }
  }
  function nuevoSobre(p: Punto, tipo: EntreSesiones['tipo']) { // sobre de 10×7 px centrado en su punto
    const g = grupo(capaSobres, 'sobre'), sombra = 'rgba(0,0,0,.25)'
    g.style.transform = px(p)
    rect(g, -6, -5, 12, 9, '#1a1922'); rect(g, -5, -4, 10, 7, COLOR_SOBRE[tipo])
    rect(g, -5, -4, 10, 1, sombra); rect(g, -4, -3, 2, 1, sombra); rect(g, 2, -3, 2, 1, sombra); rect(g, -2, -2, 4, 1, sombra)
    if (tipo === 'encargo') rect(g, -1, -1, 2, 3, '#1a1922') // rayita de "pendiente"
    else if (tipo === 'entrega') for (const [x, y] of [[-2, 0], [-1, 1], [0, 0], [1, -1]]) rect(g, x, y, 1, 1, '#1a1922') // palomita
    return g
  }
  function nuevoDestello(p: Punto, tipo: EntreSesiones['tipo']) { // aro que crece y se desvanece (CSS); con movimiento reducido queda quieto 0,9 s
    const g = grupo(capaDestellos, 'destello')
    g.style.transform = px(p)
    nodo('rect', { x: -6, y: -6, width: 12, height: 12, fill: 'none', stroke: COLOR_SOBRE[tipo], 'stroke-width': 2 }, g)
    return g
  }

  // ── Bucle de animación ──
  let reloj = 0, previo = performance.now(), cuadroId = 0
  // Fija lo que hace el actor: sentado en su escritorio (de espaldas, con pantalla), caminando o en la pose de su estado.
  // Cambiar de pose es cambiar una clase; el rig solo se reconstruye si cambia la vista o el equipo.
  function aplicar(a: Actor) {
    const s = a.s!
    a.camina = a.ruta.length > 0
    const sentado = !a.camina && a.lugar?.escritorio != null && s.estado === 'trabajando'
    const pose: Pose = sentado ? (a.espera ? 'espera' : 'teclea') : a.camina ? 'camina' : a.lugar?.pose ?? ROL[s.estado]?.pose ?? 'parado'
    const claveRig = `${sentado}|${JSON.stringify(a.aspecto)}`
    if (a.claveRig !== claveRig) {
      a.claveRig = claveRig; a.pose = undefined
      const rig = construirPersonaje({ aspecto: a.aspecto, vista: sentado ? 'espalda' : 'frente' }, temaActual(), actorDe(s.id, s.rol))
      if (a.g.firstElementChild) a.g.firstElementChild.replaceWith(rig); else a.g.prepend(rig)
    }
    if (a.pose !== pose) { a.pose = pose; a.g.firstElementChild!.setAttribute('class', clasePose(pose)) }
    // Pantalla del escritorio: código que corre si teclea, barra de progreso si espera un proceso.
    const pantalla = sentado ? pantallas[a.lugar!.escritorio!] : null
    if (a.pantalla && a.pantalla !== pantalla) a.pantalla.setAttribute('class', 'pantalla')
    a.pantalla = pantalla
    pantalla?.setAttribute('class', `pantalla ${a.espera ? 'espera' : 'teclea'}`)
    // Subagentes trabajando: hasta 3 robots que flotan a un lado.
    const subs = (datos?.subagentes ?? []).filter((x) => x.sesion_id === s.id && x.estado === 'trabajando').slice(0, 3).length
    const claveRobots = `${subs}|${sentado}`
    if (a.claveRobots !== claveRobots) {
      a.claveRobots = claveRobots
      a.g.querySelector('.robots')?.remove()
      if (subs) {
        const robots = grupo(a.g, 'robots')
        for (let k = 0; k < subs; k++) {
          const bot = robot(k) // el origen del robot son sus pies
          bot.setAttribute('transform', `translate(${(sentado ? 23 : 13) + k * 10 - 4} ${-(sentado ? 6 : 0) - (k % 2) * 3 - 10})`)
          robots.append(bot)
        }
      }
    }
  }
  // Mueve al actor y su botón; la etiqueta no se despega del personaje al caminar. Al frente, el que está más abajo.
  function posicionar(a: Actor) {
    a.g.style.transform = px(a)
    const x = Math.round(a.x) * e
    a.boton.style.transform = `translate(${x}px, ${Math.round(a.y) * e}px)`
    const z = String(Math.round(a.y) + 10)
    if (a.boton.style.zIndex !== z) a.boton.style.zIndex = z
    const etiqueta = a.boton.lastElementChild as HTMLElement // se recorre para no salirse por los bordes de la escena
    a.anchoEtiqueta ??= etiqueta.offsetWidth
    const mitad = a.anchoEtiqueta / 2 + 2
    const margen = `${Math.min(Math.max(x, mitad), W * e - mitad) - x}px`
    if (a.margen !== margen) { a.margen = margen; etiqueta.style.marginLeft = margen }
  }
  // El SVG se pinta en orden de documento: el actor más abajo va al frente. Solo se reordena si el orden cambió.
  function ordenar() {
    const orden = [...actores.values()].sort((p, q) => p.y - q.y)
    orden.forEach((a, i) => { if (capaActores.children[i] !== a.g) capaActores.insertBefore(a.g, capaActores.children[i] ?? null) })
    lampara.style.display = orden.some((a) => a.s?.estado === 'bloqueado' && !a.ruta.length) ? '' : 'none'
  }
  function sincronizar() { // tras datos nuevos o un cambio de tamaño
    construirYo()
    for (const a of actores.values()) if (a.s) { aplicar(a); posicionar(a) }
    ordenar()
    const n = Math.min(datos ? pendientesParaMi(datos).length : 0, 6)
    ;[...pila.children].forEach((hoja, k) => { (hoja as SVGElement).style.display = k < n ? '' : 'none' })
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
    if (sucio) { sucio = false; sincronizar() } else if (cambio) ordenar()
    cuadroId = requestAnimationFrame(cuadro)
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
      movimiento.removeEventListener('change', alCambiarMovimiento)
      observador.disconnect(); capa.replaceChildren()
    },
  }
}
