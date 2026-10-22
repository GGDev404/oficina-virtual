// Ficha del agente. Completa (≥ 900 px de ventana): conversación + panel con pestañas. Reducida: el panel se vuelve
// chips con menús desplegables bajo la cabecera y el redactor queda en una sola línea (container query en oficina.css).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Tabs } from 'radix-ui'
import { ResumenTarea } from '@/components/comunes'
import { useOficina } from '@/components/contexto'
import { Icono } from '@/components/icono'
import { Retrato } from '@/components/retrato'
import { aspecto, type Pose } from '@/escena/sprites'
import { Cerrar, Descripcion, Titulo, Ventana } from '@/components/ventana'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { leer, post, postSeguro, rutaSesion } from '@/lib/api'
import { alEscribirConversacion } from '@/lib/estado'
import { Markdown } from '@/lib/markdown'
import {
  ESTADOS, carpeta, diaLargo, duracion, encargosDe, esperaProcesos, hace, horaDe, infoProceso, inicioDia, miles, nivelContexto, nombreModelo,
  nombreSesion, permisoPendiente, preguntaPendiente, procesosDe, tituloRol, type Proceso,
} from '@/lib/oficina'
import type { Datos, Intercambio, Sesion, Subagente, Tarea, Viva } from '@/lib/tipos'
import { PanelEncargos } from './encargos'
import { DecisionPermiso, FormularioPregunta, PantallaTmux } from './permisos'
import { SelectorTarea } from './selector-tarea'

// Pose del retrato según el estado (las mismas que en la escena).
const POSE: Record<string, Pose> = { trabajando: 'teclea', necesita_permiso: 'mano', duda: 'mano', te_espera: 'parado', bloqueado: 'triste', listo_para_revisar: 'cafe', 'sin_señal': 'duerme' }

const PEDIR_TRASPASO = 'Tu ventana de contexto está casi llena. Escribe un resumen de traspaso para seguir en una sesión nueva: objetivo, '
  + 'estado actual, archivos tocados, decisiones tomadas, qué falta y el siguiente paso concreto. Termina con la rama y la carpeta.'
// Imágenes para el agente: se pegan, se arrastran o se eligen; el servidor las guarda y le manda sus rutas.
const MAX_IMAGENES = 4, MAX_BYTES_JUNTAS = 5.5 * 1024 * 1024 // el cuerpo del POST admite hasta 8 MB en base64
// Menús de la ficha reducida: el Popover de shadcn con el aspecto de la oficina.
const MENU = 'va-pop w-[min(440px,92vw)] max-h-[60svh] overflow-auto gap-2 rounded-[12px] p-2 ring-0 border border-border shadow-(--sombra)'
interface Adjunto { archivo: File; url: string }
// Borrador por sesión: al salir del chat (cerrar la ficha o abrir otra) se guardan el texto y las imágenes, y vuelven al
// regresar. El texto también queda en el navegador (sobrevive a recargar); las imágenes, mientras no recargues.
const borradores = new Map<string, { texto: string; adjuntos: Adjunto[] }>()
const claveBorrador = (sid: string) => `ov-borrador-${sid}`
// Mensajes que la oficina rechazó: se ven en rojo hasta recargar.
const fallidos = new Map<string, { ts: number; texto: string; motivo: string }[]>()
const guardado = (clave: string, defecto: string) => { try { return localStorage.getItem(clave) ?? defecto } catch { return defecto } }
const guardar = (clave: string, valor: string) => { try { localStorage.setItem(clave, valor) } catch { /* sin almacenamiento */ } }
const base64De = (f: File) => new Promise<string>((ok, falla) => {
  const lector = new FileReader()
  lector.onload = () => ok(String(lector.result).split(',')[1])
  lector.onerror = () => falla(new Error('no se pudo leer la imagen'))
  lector.readAsDataURL(f)
})

export function Ficha({ id, escribir }: { id: string; escribir: boolean }) {
  const { datos: d, tareas, yo, abrirNueva, cerrarVentana } = useOficina()
  const s = d.sesiones.find((x) => x.id === id)
  // La sesión ya no está en el estado: la ficha se cierra sola.
  useEffect(() => { if (!s) cerrarVentana() }, [s, cerrarVentana])
  const caja = useRef<HTMLTextAreaElement>(null)
  if (!s) return null
  return (
    <Ventana alCerrar={cerrarVentana} id="v-agente" enfocar={() => (escribir && caja.current && !caja.current.disabled ? caja.current : null)}>
      <Contenido key={s.id} s={s} d={d} tareas={tareas} iniciales={(yo.nombre ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || 'TÚ'}
        caja={caja} abrirNueva={abrirNueva} />
    </Ventana>
  )
}

function Contenido({ s, d, tareas, iniciales, caja, abrirNueva }: {
  s: Sesion; d: Datos; tareas: Record<string, Tarea>; iniciales: string; caja: React.RefObject<HTMLTextAreaElement | null>
  abrirNueva: ReturnType<typeof useOficina>['abrirNueva']
}) {
  const { abrirArmeria } = useOficina()
  const t = s.tarea_id ? tareas[s.tarea_id] : undefined
  const viva = d.vivas?.[s.id]
  const procesos = procesosDe(s)
  const espera = esperaProcesos(s, d)
  const ctx = d.contexto?.[s.id]
  const nivel = nivelContexto(ctx)
  const gasto = d.gastos?.[s.id]
  const [textoEstado, colorEstado] = espera ? [`Esperando ${procesos.length} proceso${procesos.length > 1 ? 's' : ''}`, 'naranja'] : (ESTADOS[s.estado] ?? [s.estado, ''])
  const [estado, setEstado] = useState('') // línea de estado del redactor
  const [confirmandoCierre, setConfirmandoCierre] = useState(false)
  const [asignando, setAsignando] = useState(false)
  const [pestana, setPestana] = useState(() => guardado('ov-pestana', 'procesos'))
  const [sinLado, setSinLado] = useState(() => guardado('ov-sin-lado', '0') === '1')
  const [menu, setMenu] = useState<string | null>(null) // chip abierto en la ficha reducida
  const lado = useRef<HTMLElement>(null)

  // ── Conversación: se lee del transcript al abrir, con cada evento nuevo de la sesión y con cada escritura avisada ──
  const [conversacion, setConversacion] = useState<Intercambio[] | null>(null)
  const pedido = useRef(0) // si llegan dos lecturas seguidas, solo cuenta la más nueva
  const cargar = useCallback(async () => {
    const n = ++pedido.current
    let nueva: Intercambio[]
    try { const r = await fetch(rutaSesion(s.id, 'conversacion')); nueva = r.ok ? await r.json() : [] } catch { nueva = [] }
    if (n === pedido.current) setConversacion(nueva)
  }, [s.id])
  useEffect(() => { cargar() }, [cargar, s.ultimo_evento_ts])
  useEffect(() => alEscribirConversacion((sid) => { if (sid === s.id) cargar() }), [cargar, s.id])

  // ── Redactor con borrador ──
  const [texto, setTexto] = useState(() => borradores.get(s.id)?.texto ?? guardado(claveBorrador(s.id), ''))
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>(() => borradores.get(s.id)?.adjuntos ?? [])
  const [soltando, setSoltando] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)
  const borrador = useRef({ texto, adjuntos })
  borrador.current = { texto, adjuntos }
  useEffect(() => () => { // al salir del chat
    const b = borrador.current
    if (b.texto.trim() || b.adjuntos.length) borradores.set(s.id, b); else borradores.delete(s.id)
    try { if (b.texto.trim()) localStorage.setItem(claveBorrador(s.id), b.texto); else localStorage.removeItem(claveBorrador(s.id)) } catch { /* sin almacenamiento */ }
  }, [s.id])
  const agregarImagenes = (archivos: FileList | File[]) => {
    const lista = [...adjuntos]
    for (const f of archivos) {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) { setEstado('Solo imágenes PNG, JPG, GIF o WebP.'); continue }
      if (lista.length >= MAX_IMAGENES) { setEstado(`Máximo ${MAX_IMAGENES} imágenes por mensaje.`); break }
      if (lista.reduce((n, a) => n + a.archivo.size, f.size) > MAX_BYTES_JUNTAS) { setEstado('Las imágenes juntas no deben pasar de 5 MB.'); break }
      lista.push({ archivo: f, url: URL.createObjectURL(f) })
    }
    setAdjuntos(lista)
  }
  const quitarAdjunto = (i: number) => { URL.revokeObjectURL(adjuntos[i].url); setAdjuntos(adjuntos.filter((_, k) => k !== i)) }
  // En tmux se teclea en su terminal; si no, va por el mensajero a su bandeja.
  const puede = s.tmux ? !!viva : !!(viva?.bandeja && viva?.nombre)
  const [, setFallidos] = useState(0)
  const enviar = async (ev?: React.FormEvent) => {
    ev?.preventDefault()
    const limpio = texto.trim()
    if (!limpio && !adjuntos.length) return
    try {
      const imagenes = adjuntos.length ? await Promise.all(adjuntos.map((a) => base64De(a.archivo))) : undefined
      await post(rutaSesion(s.id, 'mensaje'), { texto: limpio, imagenes })
      setTexto('')
      for (const a of adjuntos) URL.revokeObjectURL(a.url)
      setAdjuntos([])
      borradores.delete(s.id)
      try { localStorage.removeItem(claveBorrador(s.id)) } catch { /* sin almacenamiento */ }
      setEstado(s.tmux ? 'Escrito en su terminal, como si lo teclearas tú.' : 'Voy en camino; tarda unos segundos.')
    } catch (err) {
      // Que no pase desapercibido: queda en la conversación, en rojo, con el motivo. Tu texto sigue en la caja.
      setEstado('')
      fallidos.set(s.id, [...(fallidos.get(s.id) ?? []), { ts: Date.now(), texto: limpio, motivo: (err as Error).message }].slice(-5))
      setFallidos((n) => n + 1)
    }
  }

  // ── Línea de tiempo: tus mensajes y las respuestas, por hora, como un chat ──
  const lista = useRef<HTMLDivElement>(null)
  const pegado = useRef(true) // pegado al fondo: los mensajes nuevos se ven sin desplazar
  const recibidos = (conversacion ?? []).filter((m) => m.rol === 'mensaje' || m.rol === 'tu').map((m) => m.texto)
  // Un mensaje tuyo enviado deja de mostrarse aparte en cuanto aparece en el transcript (si está ocupado, lo lee entre pasos).
  const mensajes = (d.mensajes?.[s.id] ?? []).filter((m) => m.estado !== 'enviado'
    || (Date.now() - m.ts < 600_000 && !recibidos.some((x) => x.includes(m.texto.trim()))))
  const yoDice = (clave: string, quien: string, ts: number | null, cuerpo: string, clase = '') => (
    <div className={`msg msg-yo ${clase}`} key={clave}>
      <div className="alinea-fin"><div className="quien">{quien}{ts ? ` · ${horaDe(ts)}` : ''}</div>
        <div className="globo-yo">{cuerpo}</div></div>
      <span className="avatar" aria-hidden="true">{iniciales}</span>
    </div>
  )
  const items: { ts: number; nodo: ReactNode }[] = [
    ...(conversacion ?? []).map((m, i) => ({ ts: m.ts ?? 0, nodo: m.rol === 'sistema' ? <div className="msg-sistema" key={`c${i}`}>{m.texto}</div>
      : m.rol === 'agente' ? <div className="msg" key={`c${i}`}><span className="avatar" aria-hidden="true">AG</span>
        <div className="min-0"><div className="quien"><b>Agente</b>{m.ts ? ` · ${horaDe(m.ts)}` : ''}</div><Markdown texto={m.texto} /></div></div>
        : yoDice(`c${i}`, m.rol === 'mensaje' ? 'Tú · desde la oficina' : 'Tú', m.ts, m.texto) })),
    ...mensajes.map((m) => ({ ts: m.ts, nodo: yoDice(`m${m.id}`, m.estado === 'enviando' ? 'Enviando…' : m.estado === 'error' ? `No se envió: ${m.detalle}` : 'Entregado · lo lee entre pasos',
      m.ts, m.texto, m.estado === 'error' ? 'error' : 'pendiente') })),
    ...(fallidos.get(s.id) ?? []).map((m) => ({ ts: m.ts, nodo: yoDice(`f${m.ts}`, `No se envió: ${m.motivo}`, m.ts, m.texto, 'error') })),
  ].sort((x, y) => x.ts - y.ts)
  const nodos: ReactNode[] = []
  let diaPrevio: number | null = null
  for (const it of items) { // separador al empezar y en cada cambio de día
    const dia: number | null = it.ts ? inicioDia(it.ts) : diaPrevio
    if (it.ts && dia !== diaPrevio) nodos.push(<div className="dia-sep" key={`d${it.ts}`}>{dia === inicioDia(Date.now()) ? 'Hoy' : diaLargo(it.ts)} · {horaDe(it.ts)}</div>)
    diaPrevio = dia
    nodos.push(it.nodo)
  }
  if (viva?.ocupada || espera) nodos.push(<div className="actividad" role="status" key="actividad"><span className="punto azul" />
    {espera ? `Esperando ${procesos.length} proceso${procesos.length > 1 ? 's' : ''} en segundo plano…` : 'Trabajando…'}</div>)
  useLayoutEffect(() => { if (pegado.current && lista.current) lista.current.scrollTop = lista.current.scrollHeight })

  // ── Acciones ──
  const terminal = viva?.tipo === 'background' || s.tmux ? () => postSeguro(rutaSesion(s.id, 'terminal')) : null
  const continuar = () => {
    const nombre = nombreSesion(s, tareas)
    const resumen = s.ultimo_mensaje ? `\n\nSu último mensaje (resumen de traspaso si se lo pediste):\n\n${s.ultimo_mensaje}` : ''
    abrirNueva({ tareaId: s.tarea_id, cwd: s.cwd, nombre: `${nombre} · continuación`.slice(0, 80), modelo: ctx?.modelo ?? '',
      prompt: `Retoma el trabajo de la sesión «${nombre}» (id ${s.id}), que se cerró o se quedó sin contexto.${resumen}`, cerrar: s.id })
  }
  const cerrarSesion = async () => {
    setConfirmandoCierre(false)
    setEstado('Cerrando…')
    try { await post(rutaSesion(s.id, 'cerrar')); setEstado('Sesión cerrada.') } catch (err) { setEstado((err as Error).message) }
  }
  const pedirTraspaso = async () => {
    try { await post(rutaSesion(s.id, 'mensaje'), { texto: PEDIR_TRASPASO }); setEstado('Le pedí el resumen de traspaso.') } catch (err) { setEstado((err as Error).message) }
  }
  // Asignar tarea. Completa: en la pestaña Tarea del panel. Reducida (panel oculto): dentro del menú de la tarea.
  const asignar = () => {
    setAsignando(true)
    if (lado.current?.offsetParent !== null) cambiarPestana('tarea'); else setMenu('tarea')
  }
  const cambiarPestana = (p: string) => { setPestana(p); guardar('ov-pestana', p) }
  const plegar = () => { setSinLado(!sinLado); guardar('ov-sin-lado', sinLado ? '0' : '1') }

  const encargos = encargosDe(d, s.id)
  const subs = d.subagentes.filter((a) => a.sesion_id === s.id)
  const vivos = subs.filter((a) => a.estado === 'trabajando')
  const listaSubs = [...vivos, ...subs.filter((a) => a.estado !== 'trabajando').reverse().slice(0, 6)]
  const bloqueTarea = <BloqueTarea s={s} d={d} t={t} asignando={asignando} asignar={asignar} terminar={() => setAsignando(false)} />
  const procs = procesos.length ? <>{espera && <div className="aviso-caja sin-margen">Espera a que terminen sus procesos; después sigue solo.</div>}
    {procesos.map((p, i) => <TarjetaProceso key={i} sid={s.id} p={p} i={i} />)}</> : <p className="vacio">Nada corre en segundo plano.</p>
  const panelEncargos = <PanelEncargos s={s} />
  const agentes = listaSubs.length ? listaSubs.map((a) => <FilaSubagente key={a.id} a={a} />) : <p className="vacio">No ha usado subagentes.</p>
  const chip = (clave: string, partes: ReactNode, contenido: ReactNode, titulo?: string) => (
    <Popover open={menu === clave} onOpenChange={(o) => { setMenu(o ? clave : null); if (!o && clave === 'tarea') setAsignando(false) }}>
      <PopoverTrigger asChild><button type="button" className="va-chip" title={titulo}>{partes}<Icono n="abajo" /></button></PopoverTrigger>
      <PopoverContent align="start" className={MENU}>{contenido}</PopoverContent>
    </Popover>
  )

  return <>
    <header className="va-cabeza">
      <div className="va-titulo">
        {/* Retrato estilo barra de DOOM: la pose sigue al estado y se ve más golpeado con el contexto casi lleno. */}
        <Retrato tam={36} pose={nivel?.clase === 'lleno' ? 'triste' : POSE[s.estado] ?? 'parado'}
          aspecto={aspecto(s.id, d.aspectos?.[`sesion:${s.id}`], s.rol ? d.aspectos?.[`rol:${s.rol}`] : null)} />
        <Titulo>{nombreSesion(s, tareas)}</Titulo>
      </div>
      <Descripcion oculta>Conversación con el agente, cuadro para escribirle y su contexto: procesos, subagentes y tarea.</Descripcion>
      <div className="va-botones"><div className="acciones">
        <button type="button" className="icono-boton" aria-label="Equipar en la Armería" title="Equipar en la Armería" onClick={() => abrirArmeria(`sesion:${s.id}`)}><Icono n="escudo" /></button>
        {terminal && <button type="button" className="icono-boton" aria-label="Abrir en terminal" title="Abrir en terminal" onClick={terminal}><Icono n="terminal" /></button>}
        <button type="button" className="icono-boton solo-ancho" aria-label="Continuar en sesión nueva" title="Continuar en sesión nueva" onClick={continuar}><Icono n="recargar" /></button>
        {viva && <button type="button" className="contorno-rojo solo-ancho" onClick={() => setConfirmandoCierre(true)}>Cerrar sesión</button>}
        <Popover open={menu === 'mas'} onOpenChange={(o) => setMenu(o ? 'mas' : null)}>
          <PopoverTrigger asChild><button type="button" className="icono-boton solo-angosto" aria-label="Más acciones" title="Más acciones"><Icono n="mas" /></button></PopoverTrigger>
          <PopoverContent align="end" className={`${MENU} w-60`}>
            <button type="button" className="opcion" onClick={() => { setMenu(null); continuar() }}>Continuar en sesión nueva</button>
            {viva && <button type="button" className="opcion peligro-texto" onClick={() => { setMenu(null); setConfirmandoCierre(true) }}>Cerrar sesión</button>}
          </PopoverContent>
        </Popover>
        <span className="va-sep solo-ancho" />
      </div><Cerrar etiqueta="Cerrar ventana" /></div>
      <div className="va-sub">
        <span className={`chip ${colorEstado}`}>{viva ? `${textoEstado} · ${duracion(s.estado_desde_ts)}` : 'Sesión cerrada'}</span>
        {s.rol && <span className="chip amarillo" title="Sesión fija de este rol">Rol: {tituloRol(d, s.rol)}</span>}
        {ctx?.modelo && <span className="dato"><Icono n="chip" />{nombreModelo(ctx.modelo)}</span>}
        {s.rama_git && <span className="dato"><Icono n="rama" /><span className="mono" title={s.rama_git}>{s.rama_git}</span></span>}
        {s.cwd && <span className="dato carpeta-dato"><Icono n="carpeta" /><span className="mono" title={s.cwd}>…/{carpeta(s.cwd)}</span>
          <button type="button" className="icono-boton chico" aria-label="Copiar ruta" title="Copiar ruta"
            onClick={(ev) => { const b = ev.currentTarget; navigator.clipboard?.writeText(s.cwd!).then(() => { b.title = 'Copiada' }) }}><Icono n="copiar" /></button></span>}
      </div>
      <div className="va-ctx">{nivel && ctx && <>
        <span className="texto-ctx">Contexto {miles(ctx.tokens)} / {miles(ctx.limite)}</span>
        <span className="medidor nivel" role="meter" aria-label="Contexto usado" aria-valuenow={Math.round(nivel.pct * 100)} aria-valuemin={0} aria-valuemax={100}>
          <i className={nivel.clase} style={{ width: `${Math.min(100, Math.round(nivel.pct * 100))}%` }} /></span>
        <b>{Math.round(nivel.pct * 100)} %</b></>}
        {gasto && <span className="va-gasto" title={`Entrada ${miles(gasto.entrada)} · caché leída ${miles(gasto.cache_leida)} · caché creada ${miles(gasto.cache_creada)} · salida ${miles(gasto.salida)} · ${gasto.respuestas} respuestas`}>
          Gasto <b>{miles(gasto.entrada + gasto.cache_leida + gasto.cache_creada + gasto.salida)}</b>
          {gasto.cache_pct != null && <> · caché <b className={gasto.cache_pct < 60 ? 'bajo' : ''}>{gasto.cache_pct} %</b></>}</span>}</div>
    </header>
    <div className="va-chips">
      {chip('proc', <><span className={`punto ${espera ? 'naranja' : procesos.length ? 'verde' : ''}`} />{procesos.length} proceso{procesos.length === 1 ? '' : 's'}</>, procs)}
      {chip('sub', <><span className={`punto ${vivos.length ? 'azul' : ''}`} />{vivos.length ? `${vivos.length} subagente${vivos.length > 1 ? 's' : ''} trabajando` : `${subs.length} subagente${subs.length === 1 ? '' : 's'}`}</>, agentes)}
      {chip('enc', <span className="txt">{encargos.length} encargo{encargos.length === 1 ? '' : 's'}</span>, panelEncargos)}
      {chip('tarea', <span className="txt">{t ? `${t.nombre}${t.lista ? ` · ${t.lista}` : ''}` : 'Sin tarea'}</span>, bloqueTarea, t?.nombre)}
    </div>
    <div className={`va-cuerpo ${sinLado ? 'sin-lado' : ''}`}>
      <section className="va-chat" aria-label="Conversación">
        <Avisos s={s} viva={viva} nombre={nombreSesion(s, tareas)} espera={espera} nivel={nivel?.clase ?? ''} confirmandoCierre={confirmandoCierre}
          cancelarCierre={() => setConfirmandoCierre(false)} cerrarSesion={cerrarSesion} pedirTraspaso={pedirTraspaso} d={d} />
        <div className="conversacion" ref={lista} onScroll={(ev) => { const l = ev.currentTarget; pegado.current = l.scrollHeight - l.scrollTop - l.clientHeight < 60 }}>
          {conversacion == null ? <p className="vacio">Cargando…</p> : items.length ? nodos : <p className="vacio">Todavía no hay conversación que mostrar.</p>}
        </div>
        <form className="redactar" onSubmit={enviar}>
          <div className="adjuntos">{adjuntos.map((a, i) => <div className="adjunto" key={a.url}>
            <img src={a.url} alt={a.archivo.name || 'imagen pegada'} />
            <button type="button" aria-label={`Quitar ${a.archivo.name || 'imagen'}`} onClick={() => quitarAdjunto(i)}><Icono n="cerrar" /></button></div>)}</div>
          <label className="oculto" htmlFor="va-texto">Escríbele o pregúntale algo</label>
          <textarea id="va-texto" ref={caja} rows={2} maxLength={4000} placeholder="Escríbele o pregúntale algo. Pega o arrastra imágenes aquí."
            className={soltando ? 'soltando' : ''} disabled={!puede} value={texto} onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); enviar() } }}
            onPaste={(ev) => { const imgs = [...ev.clipboardData.files].filter((f) => f.type.startsWith('image/')); if (imgs.length) { ev.preventDefault(); agregarImagenes(imgs) } }}
            onDragOver={(ev) => { if (puede && ev.dataTransfer.types.includes('Files')) { ev.preventDefault(); setSoltando(true) } }}
            onDragLeave={() => setSoltando(false)}
            onDrop={(ev) => { setSoltando(false); if (!ev.dataTransfer.files.length || !puede) return; ev.preventDefault(); agregarImagenes(ev.dataTransfer.files) }} />
          <div className="va-pie">
            <button className="icono-boton" type="button" id="va-adjuntar" aria-label="Adjuntar imagen" title="Adjuntar imagen" disabled={!puede} onClick={() => archivo.current?.click()}><Icono n="imagen" /></button>
            <input type="file" ref={archivo} accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(ev) => { if (ev.target.files) agregarImagenes(ev.target.files); ev.target.value = '' }} />
            <span className="meta va-pista">{s.tmux ? 'Se teclea en su terminal · Ctrl+Enter envía' : viva?.ocupada ? 'Lo lee entre pasos · Ctrl+Enter envía' : 'Ctrl+Enter envía'}</span>
            <span className="meta" id="va-estado" role="status">{!puede ? (!viva ? 'La sesión está cerrada.' : 'Esta sesión no tiene bandeja de mensajes; ábrela de nuevo para activarla.') : estado}</span>
            <button className="primario" type="submit" id="va-enviar" aria-label="Enviar" disabled={!puede}><Icono n="enviar" /><span className="solo-ancho">Enviar</span></button>
          </div>
        </form>
      </section>
      {/* Panel (completa) con pestañas; plegado deja solo el botón para mostrarlo. */}
      <aside className="va-lado" ref={lado} aria-label="Contexto">
        <Tabs.Root value={pestana} onValueChange={cambiarPestana} className="flex min-h-0 flex-1 flex-col">
          <div className="va-tabs">
            <Tabs.List aria-label="Panel" className="contents">
              <Tabs.Trigger value="procesos">Procesos<span className={`cuenta ${espera ? 'aviso' : ''}`}>{procesos.length}</span></Tabs.Trigger>
              <Tabs.Trigger value="subagentes">Subagentes<span className="cuenta">{vivos.length || subs.length}</span></Tabs.Trigger>
              <Tabs.Trigger value="encargos">Encargos<span className={`cuenta ${encargos.some((e) => e.estado === 'error') ? 'aviso' : ''}`}>{encargos.length}</span></Tabs.Trigger>
              <Tabs.Trigger value="tarea">Tarea<span className="cuenta">{s.tarea_id ? 1 : 0}</span></Tabs.Trigger>
            </Tabs.List>
            <button type="button" className="icono-boton chico plegar" aria-label={sinLado ? 'Mostrar panel' : 'Ocultar panel'} title={sinLado ? 'Mostrar panel' : 'Ocultar panel'}
              onClick={plegar}><Icono n={sinLado ? 'izquierda' : 'flecha'} /></button>
          </div>
          <Tabs.Content value="procesos" className="va-panel">{procs}</Tabs.Content>
          <Tabs.Content value="subagentes" className="va-panel">{agentes}</Tabs.Content>
          <Tabs.Content value="encargos" className="va-panel">{panelEncargos}</Tabs.Content>
          <Tabs.Content value="tarea" className="va-panel"><div className="proc relleno">{bloqueTarea}</div></Tabs.Content>
        </Tabs.Root>
      </aside>
    </div>
  </>
}

// Avisos que se apilan arriba de la conversación: confirmar cierre, permiso, pregunta, bloqueado, procesos y contexto.
function Avisos({ s, d, viva, nombre, espera, nivel, confirmandoCierre, cancelarCierre, cerrarSesion, pedirTraspaso }: {
  s: Sesion; d: Datos; viva: Viva | undefined; nombre: string; espera: boolean; nivel: string; confirmandoCierre: boolean
  cancelarCierre: () => void; cerrarSesion: () => void; pedirTraspaso: () => void
}) {
  const pendiente = permisoPendiente(d, s.id)
  const pregunta = preguntaPendiente(d, s.id)
  let permiso: { herramienta?: string; detalle?: string } | null = null
  try { permiso = JSON.parse(s.permiso_json ?? 'null') } catch { /* sin detalle */ }
  return <>
    {confirmandoCierre && viva && <div className="aviso-caja rojo" role="alertdialog" aria-label="Confirmar cierre">
      <p className="abajo-s2"><b>¿Cerrar «{nombre}»? </b>{viva.ocupada ? 'Está trabajando ahora: se corta lo que esté haciendo. ' : ''}
        La conversación queda guardada; la retomas con claude --resume {s.id.slice(0, 8)}… o con «Retomar» en Pendientes.</p>
      <div className="acciones">
        <button type="button" className="peligro-solido" onClick={cerrarSesion}>Sí, cerrar</button>
        <button type="button" onClick={cancelarCierre}>Cancelar</button>
      </div>
    </div>}
    {s.estado === 'necesita_permiso' && (pendiente
      ? <div className="aviso-caja rojo"><DecisionPermiso key={pendiente.id} p={pendiente} /></div>
      : <div className="aviso-caja rojo">
        <p className="abajo-s2"><b>Pide permiso</b>{permiso ? ` para ${permiso.herramienta}:` : '.'}</p>
        {permiso?.detalle && <pre className="pre-ajustado abajo-s2">{permiso.detalle}</pre>}
        {s.tmux ? <PantallaTmux key={s.permiso_json} s={s} /> : <p className="abajo-s2">{viva?.tipo === 'background'
          ? 'Apruébalo en su terminal: ábrela y elige «Yes». Escribirle un mensaje no lo aprueba; queda en cola hasta después.'
          : `Apruébalo en su terminal o en la app (${carpeta(s.cwd)}). Escribirle un mensaje no lo aprueba; queda en cola hasta después.`}</p>}
        {(viva?.tipo === 'background' || s.tmux) && <button type="button" className="boton-chico" onClick={() => postSeguro(rutaSesion(s.id, 'terminal'))}><Icono n="terminal" />Abrir su terminal</button>}
      </div>)}
    {pregunta && <FormularioPregunta key={pregunta.id} p={pregunta} />}
    {s.estado === 'bloqueado' && <p className="aviso-caja rojo"><b>Está bloqueado. </b>Su último mensaje dice qué le falta.</p>}
    {espera && <p className="aviso-caja"><b>Espera sus procesos. </b>Cuando terminen, sigue solo; si le escribes ahora, lee tu mensaje y responde.</p>}
    {nivel && viva && <div className={`aviso-caja ${nivel === 'lleno' ? 'rojo' : ''}`}>
      <p className="abajo-s2"><b>{nivel === 'lleno' ? 'Contexto casi lleno. ' : 'Contexto alto. '}</b>
        {nivel === 'lleno' ? 'Pídele un resumen de traspaso y abre una sesión nueva con él, o escribe /compact en su terminal.'
          : 'Conviene compactar pronto: escribe /compact en su terminal (un mensaje desde aquí no ejecuta comandos).'}</p>
      <button type="button" className="boton-chico" onClick={pedirTraspaso}>Pedir resumen de traspaso</button>
    </div>}
  </>
}

function BloqueTarea({ s, d, t, asignando, asignar, terminar }: { s: Sesion; d: Datos; t: Tarea | undefined; asignando: boolean; asignar: () => void; terminar: () => void }) {
  if (asignando) return (
    <section className="bloque">
      <div className="fila"><h4 className="empuja">Elige su tarea</h4><button className="boton-chico" type="button" onClick={terminar}>Cancelar</button></div>
      <SelectorTarea datos={d} seleccionada={s.tarea_id} autoFocus alElegir={async (x) => { terminar(); await postSeguro(rutaSesion(s.id, 'tarea'), { tarea_id: x.id }) }} />
    </section>
  )
  return (
    <div className="pila">
      {s.tarea_id ? <>
        {t ? <ResumenTarea t={t} /> : <div>{s.tarea_id}</div>}
        <div className="fila"><span className="meta">ligada por {s.tarea_origen}</span>
          <button className="boton-chico" type="button" onClick={asignar}>Cambiar</button>
          <button className="boton-chico" type="button" onClick={() => postSeguro(rutaSesion(s.id, 'tarea'), { tarea_id: null })}>Desligar</button></div>
      </> : <>
        <p className="meta sin-margen">Sin tarea ligada.</p>
        <button className="primario" type="button" onClick={asignar}>Asignar tarea</button>
      </>}
      <p className="meta sin-margen">Última actividad {hace(s.ultimo_evento_ts)} · sesión {s.id.slice(0, 8)}</p>
    </div>
  )
}

// Proceso en segundo plano: desplegable con su comando y, si escribe a un .log, sus últimas líneas.
function TarjetaProceso({ sid, p, i }: { sid: string; p: Proceso; i: number }) {
  const info = infoProceso(p)
  const [abierto, setAbierto] = useState(false)
  const [log, setLog] = useState<string | null>(null)
  const cargarLog = (n = 40) => leer<{ texto?: string; error?: string }>(`${rutaSesion(sid, 'log')}?i=${i}&n=${n}`)
    .then((r) => setLog(r.texto ?? r.error ?? ''), () => setLog('No pude leer el log.'))
  return (
    <details className="proc" open={abierto} onToggle={(ev) => {
      const o = ev.currentTarget.open
      setAbierto(o)
      if (o && info.log && log == null) cargarLog()
    }}>
      <summary><span className={`punto ${info.punto}`} />
        <span className="textos"><span className="nombre" title={info.nombre}>{info.nombre}</span><span className="sub" title={info.sub}>{info.sub}</span></span>
        <span className="marca">{info.marca}</span><Icono n="abajo" className="giro" /></summary>
      <div className="detalle">
        {info.comando && info.comando !== info.nombre && <pre className="consola">{info.comando}</pre>}
        {info.log && (log != null ? <pre className="consola">{log || '(log vacío)'}</pre> : <p className="meta sin-margen">Cargando su log…</p>)}
        {info.log && <div className="acciones">
          <button type="button" className="boton-chico" onClick={() => cargarLog(400)}>Ver log completo</button>
          <button type="button" className="boton-chico" onClick={() => cargarLog()}>Actualizar</button></div>}
        {!info.log && !info.comando && <p className="meta sin-margen">Sin más detalle: Claude Code no expone su salida.</p>}
      </div>
    </details>
  )
}

function FilaSubagente({ a }: { a: Subagente }) {
  return (
    <div className="proc"><div className="proc-fila"><span className={`punto ${a.estado === 'trabajando' ? 'azul' : ''}`} />
      <span className="textos"><span className="nombre">{a.descripcion || a.tipo || 'subagente'}</span>
        <span className="sub">{a.tipo ?? 'subagente'} · {a.estado === 'trabajando' ? `trabajando · ${duracion(a.inicio_ts)}` : `terminó ${hace(a.fin_ts ?? a.inicio_ts)}`}</span></span>
      <span className="marca">{a.en_fondo ? 'fondo' : 'agente'}</span><span /></div></div>
  )
}
