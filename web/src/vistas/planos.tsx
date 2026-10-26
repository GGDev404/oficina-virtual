// Planos (ventana propia): tablero de los 7 módulos y detalle por módulo, desde la bóveda de Obsidian (GET /api/planos).
// El texto de la bóveda siempre entra como texto de React, nunca como HTML.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Tabs } from 'radix-ui'
import { BotonAccion, Chip } from '@/components/comunes'
import { useOficina } from '@/components/contexto'
import { Icono, type NombreIcono } from '@/components/icono'
import { Cerrar, Descripcion, Titulo, Ventana } from '@/components/ventana'
import { leer } from '@/lib/api'

interface Cierre { semana: string; sprint: string }
interface Conteos { construido: number; parcial: number; noConstruido: number }
interface Resumen {
  id: string; nombre: string; aviso?: string; nota: { ruta: string; titulo: string; fecha: string } | null; pct: number | null
  conteos?: Conteos
  brechas: number; sinTarea: number; bloquean: number; dudas?: number; sinSubir: number; alertas?: number; cierre?: Cierre | null; prioridad?: string | null
}
interface Tablero { corte: string | null; entrega: string | null; diasParaEntrega: number | null; modulos: Resumen[]; sinLigar: { ruta: string; rama: string; sin_commit: number; sin_subir: number }[] }
interface Duda { id: string; estado: string; para: string; bloquea: string; tarea: string; pregunta: string }
interface Detalle extends Omit<Resumen, 'brechas' | 'dudas' | 'alertas'> {
  basePct?: string
  fichas: { ficha: string; estado: string; nota: string }[]
  falta: { n: string; brecha: string; fuente: string; tareas: string[]; sinTarea: boolean; tamano: string | null }[]
  dudas?: { abiertas: Duda[]; bloquean: Duda[] }
  necesita?: { decisiones: { n: string; decision: string; aQuien: string; afecta: string }[]; insumos: string[]; dependencias: { origen: string; evento: string; destino: string; resultado: string }[] }
  calendario?: { corte: string | null; entrega: string | null; diasParaEntrega: number | null; cierre: Cierre | null }
  auditoria?: {
    sinSubir: { ruta: string; rama: string; repo: string; sin_commit: number; sin_subir: number; expediente: string }[]
    hechoPorAgentes: { id: string; tarea: string; estado: string; rama: string; pr: string; ultimo: { fecha: string; agente: string; cambio: string } | null }[]
    alertas: string[]
  }
  paraSaberMas?: { ruta: string; titulo: string }[]
}

// ---- Semáforo ----
type Tono = 'rojo' | 'naranja' | 'verde' | 'gris'
const TONO: Record<Tono, { icono: NombreIcono; texto: string }> = {
  rojo: { icono: 'alto', texto: 'Rojo' }, naranja: { icono: 'decidir', texto: 'Naranja' },
  verde: { icono: 'terminada', texto: 'Verde' }, gris: { icono: 'nueva', texto: 'Sin datos' },
}
// Regla del semáforo (se evalúa en este orden y gana la primera que se cumple):
//   gris:    el módulo trae `aviso` (la nota no tiene el formato esperado; no hay cifras confiables);
//   rojo:    hay preguntas que bloquean, o alertas de auditoría, o trabajo sin subir (sinSubir > 0);
//   naranja: el % de cumplimiento es menor que 60;
//   verde:   todo lo demás.
export function semaforo(m: Pick<Resumen, 'aviso' | 'bloquean' | 'sinSubir' | 'pct'> & { alertas?: number }): Tono {
  if (m.aviso) return 'gris'
  if (m.bloquean > 0 || (m.alertas ?? 0) > 0 || m.sinSubir > 0) return 'rojo'
  if ((m.pct ?? 0) < 60) return 'naranja'
  return 'verde'
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const corta = (iso: string | null | undefined) => { const m = iso?.match(/^\d{4}-(\d\d)-(\d\d)/); return m ? `${Number(m[2])}-${MESES[Number(m[1]) - 1]}` : '—' }
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`
const faltan = (n: number | null) => n == null ? '' : n < 0 ? `pasó hace ${dias(-n)}` : n === 0 ? 'es hoy' : `faltan ${dias(n)}`
const obsidian = (ruta: string) => `obsidian://open?vault=Millet-ERP&file=${encodeURIComponent(ruta)}`
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function useCarga<T>(url: string) {
  const [d, setD] = useState<{ datos?: T; error?: string }>({})
  const vigente = useRef(url) // una respuesta tardía de otro módulo no pisa la actual
  const cargar = useCallback(async () => {
    vigente.current = url
    setD({})
    try {
      const r = await leer<T & { error?: string }>(url)
      if (vigente.current === url) setD(r?.error ? { error: r.error } : { datos: r })
    } catch { if (vigente.current === url) setD({ error: 'No se pudo leer la bóveda.' }) }
  }, [url])
  useEffect(() => { cargar() }, [cargar])
  return { ...d, cargar }
}

// ---- Calendario ----
// Último día de la semana de cierre («10–14 nov», «8 dic»), en ms UTC.
const finDeCierre = (semana: string | undefined, anio: number) => {
  const m = semana?.match(/(\d+)\s*[–-]\s*(\d+)\s+([a-z]{3})/i) ?? semana?.match(/()(\d+)\s+([a-z]{3})/i)
  const mes = m ? MESES.indexOf(m[3].toLowerCase()) : -1
  return mes < 0 ? null : Date.UTC(anio, mes, Number(m![2]))
}
const hoyUTC = () => { const h = new Date(); return Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()) }
const diasHasta = (ms: number | null) => ms == null ? null : Math.round((ms - hoyUTC()) / 86400_000)
const anioDe = (iso: string | null | undefined) => Number(iso?.slice(0, 4)) || new Date().getFullYear()

// ---- Piezas comunes ----
function Semaforo({ tono, aviso }: { tono: Tono; aviso?: string }) {
  const t = TONO[tono]
  return <span className={`pl-semaforo ${tono}`}><Icono n={t.icono} />{t.texto}{aviso ? ` · ${aviso}` : ''}</span>
}

// Mapa de fichas: una celda por ficha. Construida = llena, parcial = rayada, por hacer = vacía (no depende del color).
// Decorativo: la leyenda de al lado dice los mismos números con texto.
function Mapa({ c }: { c?: Conteos }) {
  if (!c) return null
  const celdas = [...Array(c.construido).fill('hecha'), ...Array(c.parcial).fill('parcial'), ...Array(c.noConstruido).fill('falta')]
  return <div className="pl-mapa" aria-hidden="true">{celdas.map((k, i) => <i key={i} className={k} />)}</div>
}
const Leyenda = ({ c }: { c?: Conteos }) => c ? <span className="pl-leyenda"><b>{c.construido}</b> {c.construido === 1 ? 'hecha' : 'hechas'} · <b>{c.parcial}</b> {c.parcial === 1 ? 'parcial' : 'parciales'} · <b>{c.noConstruido}</b> por hacer</span> : null

function Pildora({ tono, icono, children }: { tono: Tono; icono?: NombreIcono; children: ReactNode }) {
  return <span className={`pl-pildora ${tono}`}>{icono && <Icono n={icono} />}{children}</span>
}

// Texto largo con tope de 2 líneas; «Ver más» solo si de verdad se recorta (se mide, cambia con el ancho de la ventana).
function Largo({ children }: { children: string }) {
  const [abierto, setAbierto] = useState(false)
  const [recorta, setRecorta] = useState(false)
  const el = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const n = el.current
    if (!n) return
    const medir = () => { if (!abierto) setRecorta(n.scrollHeight > n.clientHeight + 1) }
    medir()
    const o = new ResizeObserver(medir)
    o.observe(n)
    return () => o.disconnect()
  }, [abierto, children])
  return <>
    <span ref={el} className={`pl-texto ${abierto ? '' : 'corto'}`}>{children}</span>
    {(recorta || abierto) && <button type="button" className="enlace pl-mas" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>{abierto ? 'Ver menos' : 'Ver más'}</button>}
  </>
}
const Nada = ({ children }: { children: ReactNode }) => <p className="pl-nada">{children}</p>

// ---- Ventana ----
type Orden = 'cierre' | 'bloqueo' | 'avance'
const ORDENES: { id: Orden; texto: string }[] = [{ id: 'cierre', texto: 'Por cierre' }, { id: 'bloqueo', texto: 'Más bloqueado' }, { id: 'avance', texto: 'Menor avance' }]

function ordenar(mods: Resumen[], orden: Orden, anio: number) {
  const cierre = (m: Resumen) => finDeCierre(m.cierre?.semana, anio) ?? Infinity
  const por: Record<Orden, (a: Resumen, b: Resumen) => number> = {
    // la prioridad de la nota (Maestros) va primero; después, el que cierra antes y, a igual cierre, el más bloqueado
    cierre: (a, b) => Number(!!b.prioridad) - Number(!!a.prioridad) || (cierre(a) === cierre(b) ? 0 : cierre(a) < cierre(b) ? -1 : 1) || b.bloquean - a.bloquean,
    bloqueo: (a, b) => b.bloquean - a.bloquean || b.sinTarea - a.sinTarea || (a.pct ?? 0) - (b.pct ?? 0),
    avance: (a, b) => (a.pct ?? 101) - (b.pct ?? 101),
  }
  return [...mods].sort(por[orden])
}

export function PlanosVentana() {
  const { cerrarVentana } = useOficina()
  const [id, setId] = useState<string | null>(null)
  const [orden, setOrden] = useState<Orden>('cierre')
  const t = useCarga<Tablero>('/api/planos')
  const entrega = t.datos && `entrega ${corta(t.datos.entrega)} · ${faltan(t.datos.diasParaEntrega)}`
  const mods = useMemo(() => t.datos ? ordenar(t.datos.modulos, orden, anioDe(t.datos.entrega)) : [], [t.datos, orden])
  return (
    <Ventana alCerrar={cerrarVentana} id="v-planos">
      <header className="vo-cabeza"><Titulo>Planos</Titulo>
        <Descripcion oculta>Avance de tus siete módulos según las notas de la bóveda de Obsidian: qué está hecho, qué falta, qué necesita y qué dudas bloquean.</Descripcion>
        {entrega && <Chip color="azul-suave">{entrega}</Chip>}
        <Cerrar /></header>
      {t.error ? <div className="cuerpo"><p className="pl-error" role="alert">{t.error} <BotonAccion accion={t.cargar}>Reintentar</BotonAccion></p></div>
        : !t.datos ? <div className="cuerpo"><p className="vacio" role="status">Leyendo la bóveda…</p></div>
        : id ? <div className="pl-doble">
          <Riel mods={mods} actual={id} ir={setId} volver={() => { setId(null); t.cargar() }} />
          <div className="pl-principal"><DetalleModulo key={id} id={id} /></div></div>
        : <div className="cuerpo"><TableroVista t={t.datos} mods={mods} orden={orden} setOrden={setOrden} abrir={setId} /></div>}
    </Ventana>
  )
}

// ---- Tablero ----
function Dato({ etiqueta, valor, sub, tono }: { etiqueta: string; valor: ReactNode; sub: ReactNode; tono?: Tono }) {
  return <div className="pl-dato" data-tono={tono}><span className="pl-dato-t">{etiqueta}</span><b>{valor}</b><span className="pl-dato-s">{sub}</span></div>
}

function TableroVista({ t, mods, orden, setOrden, abrir }: { t: Tablero; mods: Resumen[]; orden: Orden; setOrden: (o: Orden) => void; abrir: (id: string) => void }) {
  const anio = anioDe(t.entrega)
  const bloq = t.modulos.reduce((s, m) => s + m.bloquean, 0), enMods = t.modulos.filter((m) => m.bloquean > 0).length
  const sinSubir = t.modulos.reduce((s, m) => s + m.sinSubir, 0) + t.sinLigar.length
  const fichas = t.modulos.reduce((s, m) => s + (m.conteos ? m.conteos.construido + m.conteos.parcial + m.conteos.noConstruido : 0), 0)
  const hechas = t.modulos.reduce((s, m) => s + (m.conteos?.construido ?? 0), 0)
  const conPct = t.modulos.filter((m) => m.pct != null)
  const prom = conPct.length ? Math.round(conPct.reduce((s, m) => s + (m.pct ?? 0), 0) / conPct.length) : null
  // Lo que sigue: el cierre más cercano que aún no pasa (puede ser de más de un módulo).
  const prox = t.modulos.map((m) => ({ m, ms: finDeCierre(m.cierre?.semana, anio) })).filter((x): x is { m: Resumen; ms: number } => x.ms != null && x.ms >= hoyUTC())
  const siguiente = prox.length ? Math.min(...prox.map((x) => x.ms)) : null
  const siguientes = prox.filter((x) => x.ms === siguiente).map((x) => x.m)
  return <div className="pila-grande">
    <section className="pl-resumen" aria-label="Resumen de los siete módulos">
      <Dato etiqueta="Entrega" valor={t.diasParaEntrega == null ? '—' : dias(t.diasParaEntrega)} sub={`${corta(t.entrega)} · corte ${corta(t.corte)}`} />
      <Dato etiqueta="Avance promedio" valor={prom == null ? '—' : `${prom}%`} sub={`${hechas} de ${fichas} fichas construidas`} />
      <Dato etiqueta="Dudas que bloquean" valor={bloq} tono={bloq ? 'rojo' : 'verde'}
        sub={bloq ? <><Icono n="alto" />en {plural(enMods, 'módulo', 'módulos')}</> : <><Icono n="terminada" />Nada te bloquea</>} />
      <Dato etiqueta="Sin subir" valor={sinSubir} tono={sinSubir ? 'rojo' : 'verde'}
        sub={sinSubir ? <><Icono n="alto" />con cambios sin subir</> : <><Icono n="terminada" />Todo el trabajo está subido</>} />
    </section>
    {siguientes.length > 0 && siguiente != null && <p className="pl-sigue"><Icono n="calendario" /><span><b>Sigue:</b> {siguientes.map((m) => m.nombre).join(' y ')} cierra{siguientes.length > 1 ? 'n' : ''} {siguientes[0].cierre?.semana} · {faltan(diasHasta(siguiente))}</span></p>}
    {t.sinLigar.length > 0 && <p className="pl-alerta" role="alert"><Icono n="alto" />
      <span>{plural(t.sinLigar.length, 'worktree con cambios sin subir no se liga', 'worktrees con cambios sin subir no se ligan')} a ningún módulo: {t.sinLigar.map((w) => w.rama).join(', ')}</span></p>}
    <div className="pl-orden"><span id="pl-orden-t">Ordenar por</span>
      <div role="group" aria-labelledby="pl-orden-t">
        {ORDENES.map((o) => <button key={o.id} type="button" className="boton-chico" aria-pressed={orden === o.id} onClick={() => setOrden(o.id)}>{o.texto}</button>)}</div></div>
    <ol className="pl-filas" aria-label="Módulos">{mods.map((m, i) => <li key={m.id}><Fila m={m} lugar={i + 1} anio={anio} abrir={() => abrir(m.id)} /></li>)}</ol>
  </div>
}

function Fila({ m, lugar, anio, abrir }: { m: Resumen; lugar: number; anio: number; abrir: () => void }) {
  const tono = semaforo(m)
  const d = diasHasta(finDeCierre(m.cierre?.semana, anio))
  const pct = m.pct == null ? 'sin porcentaje' : `${m.pct} %`
  return (
    <button type="button" className="pl-fila" data-tono={tono} onClick={abrir}
      aria-label={`${lugar}. ${m.nombre}, ${pct}, semáforo ${TONO[tono].texto}, ${plural(m.bloquean, 'duda bloquea', 'dudas bloquean')}, ${m.sinTarea} sin tarea, ${m.sinSubir} sin subir. Abrir detalle`}>
      <span className="pl-lugar" aria-hidden="true">{lugar}</span>
      <span className="pl-quien">
        <b className="pl-nombre">{m.nombre}</b>
        <span className="meta">{m.cierre ? `Cierra ${m.cierre.semana} · ${m.cierre.sprint}${d != null ? ` · ${faltan(d)}` : ''}` : 'Sin semana de cierre'}</span>
        {m.prioridad && <span className="pl-prioridad corto">Prioridad: {m.prioridad}</span>}
      </span>
      <span className="pl-avance"><Mapa c={m.conteos} /><Leyenda c={m.conteos} /></span>
      <span className="pl-pct">{m.pct == null ? '—' : `${m.pct}%`}</span>
      <span className="pl-pildoras">
        <Semaforo tono={tono} aviso={m.aviso} />
        {m.bloquean > 0 ? <Pildora tono="rojo" icono="alto">{plural(m.bloquean, 'duda bloquea', 'dudas bloquean')}</Pildora> : <Pildora tono="verde" icono="terminada">Sin bloqueos</Pildora>}
        {m.sinSubir > 0 && <Pildora tono="rojo" icono="alto">{m.sinSubir} sin subir</Pildora>}
        {m.sinTarea > 0 && <Pildora tono="naranja">{m.sinTarea} sin tarea</Pildora>}
      </span>
    </button>
  )
}

// ---- Riel de módulos (detalle) ----
function Riel({ mods, actual, ir, volver }: { mods: Resumen[]; actual: string; ir: (id: string) => void; volver: () => void }) {
  // Al abrir o cambiar de módulo: el foco y el scroll (riel horizontal en angosto) van al módulo actual
  const rail = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = rail.current?.querySelector<HTMLElement>('[aria-current="page"]')
    el?.focus({ preventScroll: true }); el?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [actual])
  return <nav ref={rail} className="pl-riel" aria-label="Módulos de Planos">
    <button type="button" className="pl-riel-item pl-riel-volver" onClick={volver}><Icono n="izquierda" />Tablero</button>
    {mods.map((m) => <button key={m.id} type="button" className="pl-riel-item" data-tono={semaforo(m)} aria-current={m.id === actual ? 'page' : undefined} onClick={() => ir(m.id)}
      aria-label={`${m.nombre}, ${m.pct ?? 'sin'} %${m.bloquean ? `, ${plural(m.bloquean, 'duda bloquea', 'dudas bloquean')}` : ''}`}>
      <span className="pl-riel-nombre">{m.nombre}</span>
      <span className="pl-riel-datos"><b>{m.pct == null ? '—' : `${m.pct}%`}</b>{m.bloquean > 0 && <span className="pl-riel-bloq"><Icono n="alto" />{m.bloquean}</span>}</span>
    </button>)}
  </nav>
}

// ---- Detalle ----
function Tiempo({ c }: { c: NonNullable<Detalle['calendario']> }) {
  if (!c.entrega) return null
  const ini = hoyUTC(), fin = Date.parse(c.entrega)
  const pos = (ms: number | null) => ms == null ? null : Math.min(100, Math.max(0, ((ms - ini) / (fin - ini)) * 100))
  const marcas = [
    { k: 'hoy', t: `hoy ${corta(new Date().toLocaleDateString('sv'))}`, p: 0 },
    { k: 'cierre', t: c.cierre ? `cierre ${c.cierre.semana}` : '', p: pos(finDeCierre(c.cierre?.semana, new Date(fin).getUTCFullYear())) },
    { k: 'corte', t: c.corte ? `corte ${corta(c.corte)}` : '', p: pos(c.corte ? Date.parse(c.corte) : null) },
    { k: 'entrega', t: `entrega ${corta(c.entrega)}`, p: 100 },
  ].filter((x) => x.t && x.p != null)
  return <section aria-label="Línea de tiempo hasta la entrega" className="pl-tiempo">
    <div className="pl-pista" aria-hidden="true">{marcas.map((x) => <i key={x.k} className={x.k} style={{ left: `${x.p}%` }} />)}</div>
    <ul className="pl-marcas">{marcas.map((x) => <li key={x.k} className={x.k}>{x.t}</li>)}</ul>
  </section>
}

const personas = (s: string) => (s || 'Sin asignar').split(/\s*[/,]\s*|\s+y\s+/).map((x) => x.trim()).filter(Boolean)
const cuentaPersonas = (ds: { para: string }[]) => {
  const c = new Map<string, number>()
  for (const d of ds) for (const p of personas(d.para)) c.set(p, (c.get(p) ?? 0) + 1)
  return [...c.entries()].sort((a, b) => b[1] - a[1])
}
const codigoDe = (f: string) => { const [c, ...r] = f.split(/\s+·\s+/); return r.length ? { c, t: r.join(' · ') } : { c: '', t: c } }

type Pestana = 'hecho' | 'falta' | 'dudas' | 'necesita' | 'subir'

function Ficha({ tab, valor, etiqueta, sub, tono }: { tab: Pestana; valor: number; etiqueta: string; sub: ReactNode; tono?: Tono }) {
  return <Tabs.Trigger value={tab} className="pl-ficha" data-tono={tono}>
    <span className="pl-dato-t">{etiqueta}</span><b>{valor}</b><span className="pl-dato-s">{sub}</span></Tabs.Trigger>
}

function DetalleModulo({ id }: { id: string }) {
  const { datos: m, error, cargar } = useCarga<Detalle>(`/api/planos/${encodeURIComponent(id)}`)
  const [tab, setTab] = useState<Pestana | null>(null)
  const [q, setQ] = useState('')
  const [persona, setPersona] = useState<string | null>(null)
  const [soloSinTarea, setSoloSinTarea] = useState(false)
  if (error) return <div className="pl-cuerpo"><p className="pl-error" role="alert">{error} <BotonAccion accion={cargar}>Reintentar</BotonAccion></p></div>
  if (!m) return <div className="pl-cuerpo"><p className="vacio" role="status">Leyendo el módulo…</p></div>
  const aud = m.auditoria, nec = m.necesita
  const tono = semaforo({ ...m, alertas: aud?.alertas.length })
  const hechas = m.fichas.filter((f) => f.estado === 'construido'), parciales = m.fichas.filter((f) => f.estado === 'parcial'), porHacer = m.fichas.filter((f) => f.estado !== 'construido' && f.estado !== 'parcial')
  const dudas = m.dudas?.abiertas ?? [], bloqueos = dudas.filter((d) => d.bloquea === 'sí')
  const sinTarea = m.falta.filter((f) => f.sinTarea).length
  const sinSubir = aud?.sinSubir.length ?? 0, alertas = aud?.alertas.length ?? 0
  const quienBloquea = cuentaPersonas(bloqueos)
  const activa: Pestana = tab ?? (bloqueos.length ? 'dudas' : 'falta')
  const dc = diasHasta(finDeCierre(m.calendario?.cierre?.semana, anioDe(m.calendario?.entrega)))
  const hit = (...t: (string | undefined)[]) => !q.trim() || norm(t.filter(Boolean).join(' ')).includes(norm(q.trim()))
  const ponderado = m.basePct?.startsWith('ponderado')

  const dudasVis = dudas.filter((d) => (!persona || personas(d.para).includes(persona)) && hit(d.id, d.pregunta, d.para, d.tarea))
  const faltaVis = m.falta.filter((f) => (!soloSinTarea || f.sinTarea) && hit(f.brecha, f.fuente, f.n))
  const fichaVis = (l: typeof m.fichas) => l.filter((f) => hit(f.ficha, f.nota))
  const decVis = (nec?.decisiones ?? []).filter((x) => hit(x.decision, x.aQuien, x.afecta))
  const insVis = (nec?.insumos ?? []).filter((x) => hit(x))
  const depVis = (nec?.dependencias ?? []).filter((x) => hit(x.origen, x.destino, x.evento, x.resultado))
  const nNec = (nec?.decisiones.length ?? 0) + (nec?.insumos.length ?? 0) + (nec?.dependencias.length ?? 0)

  const cambiar = (v: string) => { setTab(v as Pestana); setQ('') }
  return <div className="pl-cuerpo pila-grande" data-tono={tono}>
    <header className="pl-cabeza">
      <div className="pl-titulo">
        <h3>{m.nombre}</h3>
        <span className="pl-pct">{m.pct == null ? '—' : `${m.pct}%`}</span>
        <Semaforo tono={tono} aviso={m.aviso} />
        {m.nota && <a className="pl-obsidian" href={obsidian(m.nota.ruta)}><Icono n="externo" />Abrir en Obsidian</a>}
      </div>
      <div className="pl-avance"><Mapa c={m.conteos} /><Leyenda c={m.conteos} /></div>
      <p className="meta sin-margen">
        {m.calendario?.cierre ? `Cierra ${m.calendario.cierre.semana} · ${m.calendario.cierre.sprint}${dc != null ? ` · ${faltan(dc)}` : ''}` : 'Sin semana de cierre'}
        {m.nota && ` · nota del ${corta(m.nota.fecha)}`}{m.prioridad && ` · Prioridad: ${m.prioridad}`}</p>
      <details className="pl-calculo"><summary>¿Cómo se calcula el %?</summary>
        <p>{ponderado
          ? 'Cada ficha construida vale 2 puntos y cada parcial 1. Lo que falta pesa según el tamaño de la brecha: chica 1, mediana 2, grande 3. El porcentaje es lo hecho entre lo hecho más lo pendiente.'
          : 'Cada ficha construida vale 2 puntos y cada parcial 1, sobre el total de fichas. La nota no liga las brechas con sus fichas, así que el porcentaje es aproximado.'}
          {m.conteos && ` Hoy: ${m.conteos.construido} construidas, ${m.conteos.parcial} parciales y ${m.conteos.noConstruido} por hacer.`}</p></details>
      {m.calendario && <Tiempo c={m.calendario} />}
    </header>

    {(sinSubir > 0 || alertas > 0) && <p className="pl-alerta" role="alert"><Icono n="alto" />
      <span>{alertas ? aud!.alertas.join('. ') : `${plural(sinSubir, 'rama tiene', 'ramas tienen')} trabajo sin subir`}. <button type="button" className="enlace" onClick={() => cambiar('subir')}>Ver cuáles</button></span></p>}

    <Tabs.Root value={activa} onValueChange={cambiar} className="pl-pestanas">
      <Tabs.List className="pl-fichas" aria-label="Secciones del módulo">
        <Ficha tab="hecho" etiqueta="Hecho" valor={hechas.length} sub={parciales.length ? `+ ${plural(parciales.length, 'parcial', 'parciales')}` : `de ${m.fichas.length} fichas`} />
        <Ficha tab="falta" etiqueta="Falta" valor={m.falta.length} tono={sinTarea ? 'naranja' : undefined} sub={sinTarea ? `${sinTarea} sin tarea` : 'todas con tarea'} />
        <Ficha tab="dudas" etiqueta="Dudas" valor={dudas.length} tono={bloqueos.length ? 'rojo' : undefined}
          sub={bloqueos.length ? `${bloqueos.length} bloquean: ${quienBloquea.slice(0, 3).map(([p, n]) => `${p} ${n}`).join(', ')}${quienBloquea.length > 3 ? '…' : ''}` : 'ninguna bloquea'} />
        <Ficha tab="necesita" etiqueta="Necesita" valor={nNec} sub={`${plural(nec?.decisiones.length ?? 0, 'decisión', 'decisiones')} · ${plural(nec?.insumos.length ?? 0, 'insumo', 'insumos')}`} />
        <Ficha tab="subir" etiqueta="Sin subir" valor={sinSubir} tono={sinSubir || alertas ? 'rojo' : 'verde'}
          sub={sinSubir || alertas ? 'ramas con cambios' : `al día · ${plural(aud?.hechoPorAgentes.length ?? 0, 'agente', 'agentes')}`} />
      </Tabs.List>

      {activa !== 'subir' && <div className="pl-herr">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en esta sección" aria-label="Buscar en esta sección" />
        {activa === 'dudas' && dudas.length > 0 && <PersonasFiltro dudas={dudas} actual={persona} elegir={setPersona} />}
        {activa === 'falta' && sinTarea > 0 && <div role="group" aria-label="Filtrar brechas">
          <button type="button" className="boton-chico" aria-pressed={!soloSinTarea} onClick={() => setSoloSinTarea(false)}>Todas · {m.falta.length}</button>
          <button type="button" className="boton-chico" aria-pressed={soloSinTarea} onClick={() => setSoloSinTarea(true)}>Sin tarea · {sinTarea}</button></div>}
      </div>}

      <Tabs.Content value="hecho" className="pl-panel">
        <Grupo titulo="Construidas" lista={fichaVis(hechas)} vacio="Ninguna ficha construida." pintar={(f) => <Fila2 f={f} marca="✓" tono="verde" etiqueta="Construida" />} />
        <Grupo titulo="Parciales" lista={fichaVis(parciales)} vacio="Ninguna parcial." pintar={(f) => <Fila2 f={f} marca="◐" tono="azul" etiqueta="Parcial" />} />
        <Grupo titulo="Por hacer" lista={fichaVis(porHacer)} vacio="Todas las fichas ya tienen avance." pintar={(f) => <Fila2 f={f} marca="○" tono="gris" etiqueta="Por hacer" />} />
      </Tabs.Content>

      <Tabs.Content value="falta" className="pl-panel">
        {faltaVis.length ? <ul className="pl-lista">{faltaVis.map((f) => <li key={f.n} className="pl-item">
          <span className="pl-id">#{f.n}</span>
          <span className="pl-cuerpo-item">
            <Largo>{f.brecha}</Largo>
            <span className="pl-etiquetas">
              {f.sinTarea && <Pildora tono="rojo" icono="alto">SIN TAREA</Pildora>}
              {f.tamano && <Chip><span className="oculto">Tamaño </span>{f.tamano}</Chip>}
              {f.tareas.map((t) => <span key={t} className="mono meta">{t}</span>)}
              {f.fuente && <span className="meta">{f.fuente}</span>}</span>
          </span></li>)}</ul> : <Nada>{m.falta.length ? 'Nada coincide con el filtro.' : 'Nada pendiente en la nota.'}</Nada>}
      </Tabs.Content>

      <Tabs.Content value="dudas" className="pl-panel">
        {dudasVis.length ? <>
          <Grupo titulo="Bloquean" lista={dudasVis.filter((d) => d.bloquea === 'sí')} vacio="Ninguna bloquea." pintar={(d) => <ItemDuda d={d} />} />
          <Grupo titulo="Por resolver" lista={dudasVis.filter((d) => d.bloquea !== 'sí')} vacio="Sin otras dudas." pintar={(d) => <ItemDuda d={d} />} /></>
          : <Nada>{dudas.length ? 'Nada coincide con el filtro.' : 'Sin dudas abiertas.'}</Nada>}
      </Tabs.Content>

      <Tabs.Content value="necesita" className="pl-panel">
        <Grupo titulo="Decisiones" lista={decVis} vacio="Ninguna decisión pendiente." pintar={(x) => <li className="pl-item"><span className="pl-id">{x.n}</span><span className="pl-cuerpo-item">
          <Largo>{x.decision}</Largo><span className="pl-etiquetas">{x.aQuien && personas(x.aQuien).map((p) => <Chip key={p} color="azul-suave">Pedir a {p}</Chip>)}{x.afecta && <span className="meta">Afecta: {x.afecta}</span>}</span></span></li>} />
        <Grupo titulo="Insumos" lista={insVis} vacio="Ningún insumo pendiente." pintar={(x) => <li className="pl-item"><span className="pl-cuerpo-item"><Largo>{x}</Largo></span></li>} />
        <Grupo titulo="Dependencias" lista={depVis} vacio="Ninguna dependencia." pintar={(x) => <li className="pl-item"><span className="pl-cuerpo-item">
          <span><b>{x.origen}</b> <span aria-label="hacia">→</span> <b>{x.destino}</b>: {x.evento}</span>{x.resultado && <span className="meta">{x.resultado}</span>}</span></li>} />
      </Tabs.Content>

      <Tabs.Content value="subir" className="pl-panel">
        <section className="pl-grupo" aria-label="Sin subir"><h4 className="pl-sub">Sin subir</h4>
          {aud?.sinSubir.length ? <ul className="pl-lista">{aud.sinSubir.map((w) => <li key={w.ruta} className="pl-item pl-rojo-item"><span className="pl-cuerpo-item">
            <b className="mono">{w.rama || 'sin rama'}</b><span className="meta">{w.repo} · {w.ruta}</span>
            <span className="pl-etiquetas"><Pildora tono={w.sin_commit ? 'rojo' : 'gris'}>{w.sin_commit} sin commit</Pildora><Pildora tono={w.sin_subir ? 'rojo' : 'gris'}>{w.sin_subir} sin subir</Pildora></span></span></li>)}</ul>
            : <p className="pl-ok"><Icono n="terminada" />Nada sin subir: ninguna rama de este módulo tiene cambios sin commit ni sin push.</p>}
          {aud?.alertas.map((a) => <p key={a} className="pl-alerta" role="alert"><Icono n="alto" />{a}</p>)}</section>
        <section className="pl-grupo" aria-label="Hecho por agentes"><h4 className="pl-sub">Hecho por agentes <span className="cuenta">{aud?.hechoPorAgentes.length ?? 0}</span></h4>
          {aud?.hechoPorAgentes.length ? <ul className="pl-lista">{aud.hechoPorAgentes.map((e) => <li key={e.id} className="pl-item"><span className="pl-id mono">{e.id}</span><span className="pl-cuerpo-item">
            <Largo>{e.tarea}</Largo>
            <span className="pl-etiquetas"><Chip color={/^(terminada|complete)/i.test(e.estado) ? 'verde' : 'azul-suave'}>{e.estado || 'sin estado'}</Chip>
              <span className="meta mono">{e.rama || 'sin rama'}</span>
              <span className="meta">{/^https:\/\//.test(e.pr) ? <a href={e.pr} target="_blank" rel="noopener noreferrer">Ver PR</a> : e.pr || 'sin PR'}</span></span>
            {e.ultimo && <span className="meta">{e.ultimo.fecha} · {e.ultimo.agente}: {e.ultimo.cambio}</span>}</span></li>)}</ul>
            : <Nada>Ningún expediente de agentes ligado a este módulo.</Nada>}</section>
      </Tabs.Content>
    </Tabs.Root>

    {m.paraSaberMas && m.paraSaberMas.length > 0 && <details className="pl-saber"><summary>Para saber más · {m.paraSaberMas.length}</summary>
      <ul className="pl-notas">{m.paraSaberMas.map((n) => <li key={n.ruta}><a className="pl-obsidian" href={obsidian(n.ruta)} aria-label={`Abrir ${n.titulo} en Obsidian`}><Icono n="externo" />{n.titulo}</a></li>)}</ul></details>}
  </div>
}

function Grupo<T>({ titulo, lista, vacio, pintar }: { titulo: string; lista: T[]; vacio: string; pintar: (x: T) => ReactNode }) {
  return <section aria-label={titulo} className="pl-grupo"><h4 className="pl-sub">{titulo} <span className="cuenta">{lista.length}</span></h4>
    {lista.length ? <ul className="pl-lista">{lista.map((x, i) => <Pieza key={i}>{pintar(x)}</Pieza>)}</ul> : <Nada>{vacio}</Nada>}</section>
}
const Pieza = ({ children }: { children: ReactNode }) => <>{children}</>

function Fila2({ f, marca, tono, etiqueta }: { f: { ficha: string; nota: string }; marca: string; tono: string; etiqueta: string }) {
  const { c, t } = codigoDe(f.ficha)
  return <li className="pl-item"><span className={`pl-marca ${tono}`} role="img" aria-label={etiqueta}>{marca}</span>
    <span className="pl-cuerpo-item"><span><b>{t}</b>{c && <span className="mono meta"> {c}</span>}</span>{f.nota && <span className="meta"><Largo>{f.nota}</Largo></span>}</span></li>
}

function ItemDuda({ d }: { d: Duda }) {
  const bloquea = d.bloquea === 'sí'
  return <li className={`pl-item ${bloquea ? 'pl-rojo-item' : ''}`}><span className="pl-id mono">{d.id}</span><span className="pl-cuerpo-item">
    <Largo>{d.pregunta}</Largo>
    <span className="pl-etiquetas">
      {bloquea && <Pildora tono="rojo" icono="alto">bloquea</Pildora>}
      <Chip>{d.estado}</Chip>
      {personas(d.para).map((p) => <Chip key={p} color="azul-suave">Para {p}</Chip>)}</span></span></li>
}

function PersonasFiltro({ dudas, actual, elegir }: { dudas: Duda[]; actual: string | null; elegir: (p: string | null) => void }) {
  return <div role="group" aria-label="Filtrar dudas por persona">
    <button type="button" className="boton-chico" aria-pressed={actual === null} onClick={() => elegir(null)}>Todas · {dudas.length}</button>
    {cuentaPersonas(dudas).map(([p, n]) => <button key={p} type="button" className="boton-chico" aria-pressed={actual === p} onClick={() => elegir(actual === p ? null : p)}>{p} · {n}</button>)}
  </div>
}
