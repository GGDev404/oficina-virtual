// Planos (ventana propia): tablero de los 7 módulos y detalle por módulo, desde la bóveda de Obsidian (GET /api/planos).
// El texto de la bóveda siempre entra como texto de React, nunca como HTML.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Tabs } from 'radix-ui'
import { BotonAccion, Chip } from '@/components/comunes'
import { useOficina } from '@/components/contexto'
import { Icono, type NombreIcono } from '@/components/icono'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Cerrar, Descripcion, Titulo, Ventana } from '@/components/ventana'
import { leer, post } from '@/lib/api'
import { mensajeParaPersona } from './preguntas'

interface Cierre { semana: string; sprint: string }
interface Conteos { construido: number; parcial: number; noConstruido: number }
interface Resumen {
  id: string; nombre: string; aviso?: string; nota: { ruta: string; titulo: string; fecha: string } | null; pct: number | null
  conteos?: Conteos
  brechas: number; sinTarea: number; bloquean: number; dudas?: number; sinSubir: number; alertas?: number; cierre?: Cierre | null; prioridad?: string | null
}
interface Tablero { corte: string | null; entrega: string | null; diasParaEntrega: number | null; modulos: Resumen[]; sinLigar: { ruta: string; rama: string; sin_commit: number; sin_subir: number }[] }
interface Duda { id: string; estado: string; para: string; bloquea: string; tarea: string; pregunta: string; enviada?: string }
interface Brecha { n: string; brecha: string; fuente: string; tareas: string[]; sinTarea: boolean; tamano: string | null }
interface Detalle extends Omit<Resumen, 'brechas' | 'dudas' | 'alertas'> {
  basePct?: string
  fichas: { ficha: string; estado: string; nota: string }[]
  falta: Brecha[]
  dudas?: { abiertas: Duda[]; bloquean: Duda[] }
  necesita?: { decisiones: { n: string; decision: string; aQuien: string; afecta: string }[]; insumos: string[]; dependencias: { origen: string; evento: string; destino: string; resultado: string }[] }
  calendario?: { corte: string | null; entrega: string | null; diasParaEntrega: number | null; cierre: Cierre | null }
  auditoria?: {
    sinSubir: { ruta: string; rama: string; repo: string; sin_commit: number; sin_subir: number; expediente: string | null }[]
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
const corto = (m: { nombre: string }) => m.nombre.split(',')[0] // «Maestros, A+W y arranque» → «Maestros»
// La nota dice «primero, es la base de los demás módulos»: en la tabla es «prioridad 1» y en el detalle la frase completa.
const prioridadTabla = (p: string) => /^primero/i.test(p) ? 'prioridad 1' : 'prioridad'
const prioridadChip = (p: string) => { const r = p.match(/^primero,?\s*(?:es\s+)?(.*)$/i); return r ? `Prioridad 1 · ${r[1].replace(/^la\s+/i, '')}` : `Prioridad · ${p}` }

// `silencioso`: vuelve a pedir los datos sin vaciar la pantalla (tras ligar una rama o volver al tablero).
function useCarga<T>(url: string) {
  const [d, setD] = useState<{ datos?: T; error?: string }>({})
  const vigente = useRef(url) // una respuesta tardía de otro módulo no pisa la actual
  const cargar = useCallback(async (silencioso?: unknown) => {
    vigente.current = url
    if (silencioso !== true) setD({})
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
const hoyCorta = () => corta(new Date().toLocaleDateString('sv'))

// ---- Piezas comunes ----
function Semaforo({ tono, aviso }: { tono: Tono; aviso?: string }) {
  const t = TONO[tono]
  return <span className={`pl-semaforo ${tono}`}><Icono n={t.icono} />{t.texto}{aviso ? ` · ${aviso}` : ''}</span>
}

// Barra apilada de fichas: construidas (verde lleno), parciales (azul) y sin construir (rayada, vacía). Decorativa para
// quien lee con pantalla: la leyenda de al lado dice los mismos números con texto.
function Barra({ c }: { c?: Conteos }) {
  if (!c) return null
  return <div className="pl-barra" role="img" aria-label={`${c.construido} construidas, ${c.parcial} parciales, ${c.noConstruido} sin construir`}>
    <i className="hecha" style={{ flexGrow: c.construido }} /><i className="parcial" style={{ flexGrow: c.parcial }} /><i className="falta" style={{ flexGrow: c.noConstruido }} /></div>
}
// Leyenda de la barra: corta («7 constr. · 5 parc.») en la tabla; completa y con muestras de color en el detalle.
function Leyenda({ c, corta: chica }: { c?: Conteos; corta?: boolean }) {
  if (!c) return null
  if (chica) return <span className="pl-leyenda">{c.construido} constr. · {c.parcial} parc. · {c.noConstruido} sin constr.</span>
  return <span className="pl-leyenda">
    <span><i className="pl-muestra hecha" aria-hidden="true" /><b>{c.construido}</b> {c.construido === 1 ? 'construida' : 'construidas'}</span>
    <span><i className="pl-muestra parcial" aria-hidden="true" /><b>{c.parcial}</b> {c.parcial === 1 ? 'parcial' : 'parciales'}</span>
    <span><i className="pl-muestra falta" aria-hidden="true" /><b>{c.noConstruido}</b> sin construir</span></span>
}

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

// Copia un texto al portapapeles y lo dice («Copiado»). No envía nada a nadie.
function Copiar({ texto, className, alCopiar, children }: { texto: () => string; className: string; alCopiar?: () => void; children: ReactNode }) {
  const [estado, setEstado] = useState<'' | 'ok' | 'mal'>('')
  const reloj = useRef<number>(0)
  useEffect(() => () => clearTimeout(reloj.current), [])
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto()); setEstado('ok'); alCopiar?.() } catch { setEstado('mal') }
    clearTimeout(reloj.current); reloj.current = window.setTimeout(() => setEstado(''), 2500)
  }
  return <>
    <button type="button" className={className} onClick={copiar}>{estado === 'ok' ? <><Icono n="listo" />Copiado</> : estado === 'mal' ? 'No se pudo copiar' : children}</button>
    <span className="oculto" role="status">{estado === 'ok' ? 'Copiado' : estado === 'mal' ? 'No se pudo copiar' : ''}</span>
  </>
}

// ---- Ventana ----
type Orden = 'cierre' | 'avance'
const ORDENES: { id: Orden; texto: string }[] = [{ id: 'cierre', texto: 'Por cierre' }, { id: 'avance', texto: 'Por avance' }]

function ordenar(mods: Resumen[], orden: Orden, anio: number) {
  const cierre = (m: Resumen) => finDeCierre(m.cierre?.semana, anio) ?? Infinity
  const por: Record<Orden, (a: Resumen, b: Resumen) => number> = {
    // la prioridad de la nota (Maestros) va primero; después, el que cierra antes y, a igual cierre, el más bloqueado
    cierre: (a, b) => Number(!!b.prioridad) - Number(!!a.prioridad) || (cierre(a) === cierre(b) ? 0 : cierre(a) < cierre(b) ? -1 : 1) || b.bloquean - a.bloquean,
    // el de mayor avance primero (como el mockup); sin porcentaje, al final
    avance: (a, b) => (b.pct ?? -1) - (a.pct ?? -1),
  }
  return [...mods].sort(por[orden])
}

export function PlanosVentana() {
  const { cerrarVentana } = useOficina()
  const [id, setId] = useState<string | null>(null)
  const [orden, setOrden] = useState<Orden>('cierre')
  const t = useCarga<Tablero>('/api/planos')
  const entrega = t.datos && `Entrega ${corta(t.datos.entrega)} · ${faltan(t.datos.diasParaEntrega)}`
  const mods = useMemo(() => t.datos ? ordenar(t.datos.modulos, orden, anioDe(t.datos.entrega)) : [], [t.datos, orden])
  const actual = id ? mods.find((m) => m.id === id) : undefined
  return (
    <Ventana alCerrar={cerrarVentana} id="v-planos">
      <header className="vo-cabeza">
        {actual ? <>
          <div className="oculto"><Titulo>Planos · {actual.nombre}</Titulo></div>
          <nav className="pl-migas" aria-label="Ruta">
            <button type="button" className="boton-chico" onClick={() => { setId(null); t.cargar(true) }}><Icono n="izquierda" />Planos</button>
            <span aria-hidden="true">/</span>
            <select value={actual.id} onChange={(e) => setId(e.target.value)} aria-label="Cambiar de módulo">
              {mods.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>
          </nav>
          {actual.nota && <a className="pl-obsidian pl-obsidian-cab" href={obsidian(actual.nota.ruta)}><Icono n="externo" /><span className="pl-obs-texto">Abrir en Obsidian</span></a>}
        </> : <>
          <Titulo>Planos</Titulo>
          {entrega && <Chip color="verde">{entrega}</Chip>}
          {t.datos && <div className="pl-segmento" role="group" aria-label="Ordenar módulos">
            {ORDENES.map((o) => <button key={o.id} type="button" aria-pressed={orden === o.id} onClick={() => setOrden(o.id)}>{o.texto}</button>)}</div>}
        </>}
        <Descripcion oculta>Avance de tus siete módulos según las notas de la bóveda de Obsidian: qué está hecho, qué falta, qué necesita y qué dudas bloquean.</Descripcion>
        <Cerrar /></header>
      <div className="cuerpo">
        {t.error ? <p className="pl-error" role="alert">{t.error} <BotonAccion accion={t.cargar}>Reintentar</BotonAccion></p>
          : !t.datos ? <p className="vacio" role="status">Leyendo la bóveda…</p>
          : id ? <DetalleModulo key={id} id={id} />
          : <TableroVista t={t.datos} mods={mods} abrir={setId} refrescar={() => t.cargar(true)} />}
      </div>
    </Ventana>
  )
}

// ---- Tablero ----
function Dato({ valor, etiqueta, rojo }: { valor: ReactNode; etiqueta: string; rojo?: boolean }) {
  return <div className="pl-dato" data-tono={rojo ? 'rojo' : undefined}><b>{valor}</b><span>{etiqueta}</span></div>
}

function TableroVista({ t, mods, abrir, refrescar }: { t: Tablero; mods: Resumen[]; abrir: (id: string) => void; refrescar: () => void }) {
  const anio = anioDe(t.entrega)
  const suma = (f: (m: Resumen) => number) => t.modulos.reduce((s, m) => s + f(m), 0)
  const sinSubir = suma((m) => m.sinSubir) + t.sinLigar.length
  const bloq = suma((m) => m.bloquean)
  const conPct = t.modulos.filter((m) => m.pct != null)
  const prom = conPct.length ? Math.round(conPct.reduce((s, m) => s + (m.pct ?? 0), 0) / conPct.length) : null
  return <div className="pila-grande">
    <section className="pl-resumen" aria-label={`Resumen de los ${t.modulos.length} módulos`}>
      <div className="pl-dato pl-dato-pct"><b>{prom == null ? '—' : `${prom}%`}</b><span>Avance promedio de {t.modulos.length} módulos</span></div>
      <Dato valor={suma((m) => m.brechas)} etiqueta="brechas abiertas" />
      <Dato valor={suma((m) => m.sinTarea)} etiqueta="brechas sin tarea" />
      <Dato valor={bloq} etiqueta="dudas que bloquean" rojo={bloq > 0} />
      <Dato valor={sinSubir} etiqueta="ramas sin subir" rojo={sinSubir > 0} />
    </section>
    <Cierres t={t} />
    <div className="pl-caja pl-tabla-caja">
      <table className="pl-tabla" aria-label="Módulos" role="table">
        <thead><tr role="row">
          <th role="columnheader" scope="col">Módulo</th>
          <th role="columnheader" scope="col">Fichas: construidas · parciales · sin construir</th>
          <th role="columnheader" scope="col">Estado</th>
          <th role="columnheader" scope="col" className="num">Brechas</th>
          <th role="columnheader" scope="col" className="num">Sin tarea</th>
          <th role="columnheader" scope="col" className="num">Bloquean</th>
          <th role="columnheader" scope="col" className="num">Sin subir</th>
          <th role="columnheader" scope="col"><span className="oculto">Abrir detalle</span></th>
        </tr></thead>
        <tbody>{mods.map((m) => <FilaModulo key={m.id} m={m} anio={anio} corte={t.corte} abrir={() => abrir(m.id)} />)}</tbody>
      </table>
    </div>
    {t.sinLigar.length > 0 && <SinLigar sinLigar={t.sinLigar} mods={mods} hecho={refrescar} />}
  </div>
}

// Línea de «Cierres hasta la entrega»: cada semana de cierre es un punto con los módulos que cierran ahí; el módulo sin
// semana (Maestros) va al corte. Las posiciones son proporcionales a los días, pero los cierres de las orillas se acercan para que quepan.
function Cierres({ t }: { t: Tablero }) {
  const ini = hoyUTC(), fin = t.entrega ? Date.parse(t.entrega) : NaN
  if (!(fin > ini)) return null
  const anio = anioDe(t.entrega), corte = t.corte ? Date.parse(t.corte) : null
  const grupos = new Map<number, { mods: Resumen[]; etq: string }>()
  for (const m of t.modulos) {
    const ms = m.cierre ? finDeCierre(m.cierre.semana, anio) : corte
    if (ms == null) continue
    const g = grupos.get(ms) ?? { mods: [], etq: `Corte ${corta(t.corte)}` }
    if (m.cierre) g.etq = `${m.cierre.semana} · ${m.cierre.sprint}`
    g.mods.push(m); grupos.set(ms, g)
  }
  const lista = [...grupos.entries()].sort((a, b) => a[0] - b[0])
  return <section className="pl-caja pl-linea" aria-label="Cierres hasta la entrega">
    <h3 className="pl-etq">Cierres hasta la entrega</h3>
    <div className="pl-eje">
      <span className="pl-hoy">Hoy {hoyCorta()}</span>
      <ol className="pl-cierres">{lista.map(([ms, g]) => <li key={ms} style={{ '--p': `${Math.min(86, Math.max(3, ((ms - ini) / (fin - ini)) * 100))}%` } as CSSProperties}>
        <span className="pl-chips">{[...g.mods].sort((a, b) => Number(!!b.cierre) - Number(!!a.cierre)).map((m) => <span key={m.id} className={`pl-pildora ${semaforo(m)}`}>{corto(m)}</span>)}</span>
        <i className="pl-punto" aria-hidden="true" /><span className="pl-fecha">{g.etq}</span></li>)}</ol>
      <span className="pl-entrega">Entrega {corta(t.entrega)}</span>
    </div>
  </section>
}

// Toda la fila abre el detalle con el ratón; con teclado, el botón con el nombre (cada fila tiene uno).
function FilaModulo({ m, anio, corte, abrir }: { m: Resumen; anio: number; corte: string | null; abrir: () => void }) {
  const tono = semaforo(m)
  const d = diasHasta(finDeCierre(m.cierre?.semana, anio))
  const sub = m.cierre ? `Cierre ${m.cierre.semana} · ${m.cierre.sprint}` : m.prioridad ? `Corte ${corta(corte)} · ${prioridadTabla(m.prioridad)}` : 'Sin semana de cierre'
  return (
    <tr className="pl-fila" role="row" data-tono={tono} onClick={abrir}>
      <td role="cell" className="pl-c-nombre">
        <button type="button" className="pl-abrir" onClick={(e) => { e.stopPropagation(); abrir() }} title={d != null ? `Cierre: ${faltan(d)}` : undefined}>{m.nombre}</button>
        <span className="meta">{sub}</span>
      </td>
      <td role="cell" className="pl-c-av"><div className="pl-c-avance">
        <b className="pl-pct">{m.pct == null ? '—' : `${m.pct}%`}</b>
        <span className="pl-avance"><Barra c={m.conteos} /><Leyenda c={m.conteos} corta /></span>
      </div></td>
      <td role="cell" className="pl-c-estado"><Semaforo tono={tono} aviso={m.aviso} /></td>
      <td role="cell" className="num" data-label="Brechas">{m.brechas}</td>
      <td role="cell" className="num" data-label="Sin tarea">{m.sinTarea}</td>
      <td role="cell" className={`num ${m.bloquean > 0 ? 'alerta' : ''}`} data-label="Bloquean">{m.bloquean}</td>
      <td role="cell" className={`num ${m.sinSubir > 0 ? 'alerta' : ''}`} data-label="Sin subir">{m.sinSubir}</td>
      <td role="cell" className="pl-c-ir" aria-hidden="true"><Icono n="flecha" /></td>
    </tr>
  )
}

// Worktrees con cambios sin subir que ningún expediente liga a un módulo: se ligan a mano (POST /api/planos/ligar).
function SinLigar({ sinLigar, mods, hecho }: { sinLigar: Tablero['sinLigar']; mods: Resumen[]; hecho: () => void }) {
  const ramas = [...new Set(sinLigar.map((w) => w.rama || 'sin rama'))]
  return <section className="pl-alerta pl-pie" aria-label="Worktrees sin ligar">
    <Icono n="alto" />
    <div className="pl-pie-texto">
      <b>{plural(sinLigar.length, 'worktree con cambios sin subir no está ligado', 'worktrees con cambios sin subir no están ligados')} a ningún módulo</b>
      <ul className="pl-ramas" aria-label="Ramas sin ligar">{ramas.map((r) => <li key={r} className="mono">{r}</li>)}</ul>
    </div>
    <Ligar ramas={ramas.filter((r) => r !== 'sin rama')} mods={mods} hecho={hecho} />
  </section>
}

const MENU = 'va-pop w-[min(560px,94vw)] max-h-[60svh] overflow-auto gap-2 rounded-[12px] p-3 ring-0 border border-border shadow-(--sombra)'
function Ligar({ ramas, mods, hecho }: { ramas: string[]; mods: Resumen[]; hecho: () => void }) {
  const [elegido, setElegido] = useState<Record<string, string>>({})
  const [ocupada, setOcupada] = useState('')
  const [error, setError] = useState('')
  const ligar = async (rama: string) => {
    setOcupada(rama); setError('')
    try { await post('/api/planos/ligar', { rama, modulo: elegido[rama] }); hecho() } catch (e) { setError((e as Error).message) } finally { setOcupada('') }
  }
  return <Popover>
    <PopoverTrigger asChild><button type="button" className="pl-ligar-btn">Ligar a un módulo</button></PopoverTrigger>
    <PopoverContent align="end" side="top" className={MENU} aria-label="Ligar ramas a módulos">
      <p className="meta sin-margen">Elige el módulo de cada rama. Desde ahí su trabajo sin subir cuenta en ese módulo.</p>
      <ul className="pl-ligas">{ramas.map((r) => <li key={r}>
        <span className="mono pl-rama">{r}</span>
        <select value={elegido[r] ?? ''} aria-label={`Módulo de la rama ${r}`} onChange={(e) => setElegido({ ...elegido, [r]: e.target.value })}>
          <option value="">Elegir módulo</option>{mods.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>
        <button type="button" className="boton-chico primario" disabled={!elegido[r] || !!ocupada} onClick={() => ligar(r)}>Ligar</button></li>)}</ul>
      {error && <p className="pl-error" role="alert">{error}</p>}
    </PopoverContent>
  </Popover>
}

// ---- Detalle ----
function Tiempo({ c }: { c: NonNullable<Detalle['calendario']> }) {
  if (!c.entrega) return null
  const ini = hoyUTC(), fin = Date.parse(c.entrega)
  // el punto del medio: cierre del módulo o, si no tiene semana, el corte
  const marca = c.cierre ? { ms: finDeCierre(c.cierre.semana, new Date(fin).getUTCFullYear()), t: `Cierre ${c.cierre.semana}`, que: 'al cierre' }
    : c.corte ? { ms: Date.parse(c.corte), t: `Corte ${corta(c.corte)}`, que: 'al corte' } : null
  const pos = marca?.ms != null ? Math.min(100, Math.max(0, ((marca.ms - ini) / (fin - ini)) * 100)) : null
  const n = marca ? diasHasta(marca.ms) : null
  return <section className="pl-caja pl-tiempo" aria-label="Tiempo">
    <div className="pl-tiempo-cab"><h3 className="pl-etq">Tiempo</h3>
      {n != null && <span>{n < 0 ? <>{marca!.t.split(' ')[0]} {faltan(n)}</> : <><b>{n}</b> {n === 1 ? 'día' : 'días'} {marca!.que}</>}</span>}</div>
    <div className="pl-pista" aria-hidden="true"><i className="hoy" />{pos != null && <i className="marca" style={{ left: `${pos}%` }} />}<i className="entrega" /></div>
    <div className="pl-pista-etq">
      <span>Hoy {hoyCorta()}</span>
      {pos != null && <span className={pos > 60 ? 'der' : ''} style={{ left: `${pos}%` }}>{marca!.t}</span>}
    </div>
    <b className="pl-entrega-det">Entrega {corta(c.entrega)}</b>
  </section>
}

const personas = (s: string) => (s || 'Sin asignar').split(/\s*[/,]\s*|\s+y\s+/).map((x) => x.trim()).filter(Boolean)
const cuentaPersonas = (ds: { para: string }[]) => {
  const c = new Map<string, number>()
  for (const d of ds) for (const p of personas(d.para)) c.set(p, (c.get(p) ?? 0) + 1)
  return [...c.entries()].sort((a, b) => b[1] - a[1])
}
const codigoDe = (f: string) => { const [c, ...r] = f.split(/\s+·\s+/); return r.length ? { c, t: r.join(' · ') } : { c: '', t: c } }
const iniciales = (n: string) => { const w = n.split(/\s+/); return (w.length > 1 ? w[0][0] + w[1][0] : n.slice(0, 2)).toUpperCase() }

type Pestana = 'falta' | 'hecho' | 'dudas' | 'necesita' | 'agentes' | 'subir'
const TAM = ['L', 'M', 'S'] // de grande a chica; lo que no trae tamaño va al final

function DatoDet({ valor, etiqueta, rojo }: { valor: number; etiqueta: string; rojo?: boolean }) {
  return <div className="pl-dato pl-dato-det" data-tono={rojo ? 'rojo' : undefined}><b>{valor}</b><span>{etiqueta}</span></div>
}

function DetalleModulo({ id }: { id: string }) {
  const { datos: m, error, cargar } = useCarga<Detalle>(`/api/planos/${encodeURIComponent(id)}`)
  const [tab, setTab] = useState<Pestana>('falta')
  const [q, setQ] = useState('')
  const [persona, setPersona] = useState<string | null>(null)
  const [todas, setTodas] = useState(false)
  if (error) return <p className="pl-error" role="alert">{error} <BotonAccion accion={cargar}>Reintentar</BotonAccion></p>
  if (!m) return <p className="vacio" role="status">Leyendo el módulo…</p>
  const aud = m.auditoria, nec = m.necesita
  const tono = semaforo({ ...m, alertas: aud?.alertas.length })
  const hechas = m.fichas.filter((f) => f.estado === 'construido'), parciales = m.fichas.filter((f) => f.estado === 'parcial'), porHacer = m.fichas.filter((f) => f.estado !== 'construido' && f.estado !== 'parcial')
  const dudas = m.dudas?.abiertas ?? [], bloqueos = dudas.filter((d) => d.bloquea === 'sí')
  const sinTarea = m.falta.filter((f) => f.sinTarea)
  const sinSubir = aud?.sinSubir.length ?? 0, alertas = aud?.alertas.length ?? 0, agentes = aud?.hechoPorAgentes ?? []
  const hit = (...t: (string | undefined)[]) => !q.trim() || norm(t.filter(Boolean).join(' ')).includes(norm(q.trim()))
  const ponderado = m.basePct?.startsWith('ponderado')

  const dudasVis = dudas.filter((d) => (!persona || personas(d.para).includes(persona)) && hit(d.id, d.pregunta, d.para, d.tarea))
  const fichaVis = (l: typeof m.fichas) => l.filter((f) => hit(f.ficha, f.nota))
  const decVis = (nec?.decisiones ?? []).filter((x) => hit(x.decision, x.aQuien, x.afecta))
  const insVis = (nec?.insumos ?? []).filter((x) => hit(x))
  const depVis = (nec?.dependencias ?? []).filter((x) => hit(x.origen, x.destino, x.evento, x.resultado))
  const agentesVis = agentes.filter((e) => hit(e.id, e.tarea, e.rama, e.estado))
  const nNec = (nec?.decisiones.length ?? 0) + (nec?.insumos.length ?? 0) + (nec?.dependencias.length ?? 0)
  // Falta: de L a S (a igual tamaño, el orden de la nota) y los primeros 6
  const rango = (f: Brecha) => f.tamano && TAM.includes(f.tamano) ? TAM.indexOf(f.tamano) : TAM.length
  const faltaOrd = [...m.falta].sort((a, b) => rango(a) - rango(b))
  const porTam = (t: string) => m.falta.filter((f) => f.tamano === t).length
  const faltaVis = todas ? faltaOrd : faltaOrd.slice(0, 6)

  const cambiar = (v: string) => { setTab(v as Pestana); setQ('') }
  const conBusqueda = tab === 'hecho' || tab === 'dudas' || tab === 'necesita' || tab === 'agentes'
  // función y no componente: así el botón no se vuelve a montar (y pierde el foco) en cada render
  const pest = (v: Pestana, t: string, n: ReactNode, rojo?: boolean, aria?: string) =>
    <Tabs.Trigger value={v} className="pl-tab" aria-label={aria}>{t} <span className={`cuenta ${rojo ? 'rojo' : ''}`}>{n}</span></Tabs.Trigger>
  const dc = diasHasta(finDeCierre(m.calendario?.cierre?.semana, anioDe(m.calendario?.entrega)))

  return <div className="pl-detalle pila-grande" data-tono={tono}>
    <div className="pl-arriba">
      <section className="pl-caja pl-avance-caja" aria-label="Avance">
        <div className="pl-titulo">
          <span className="pl-pct">{m.pct == null ? '—' : `${m.pct}%`}</span>
          <Semaforo tono={tono} aviso={m.aviso} />
          {m.prioridad && <span className="pl-pildora naranja">{prioridadChip(m.prioridad)}</span>}
          {m.nota && <span className="meta">Nota del {corta(m.nota.fecha)}</span>}
        </div>
        <Barra c={m.conteos} />
        <Leyenda c={m.conteos} />
        <details className="pl-calculo"><summary>Cómo se calcula el %</summary>
          <p>{ponderado
            ? 'Cada ficha construida vale 2 puntos y cada parcial 1. Lo que falta pesa según el tamaño de la brecha: chica 1, mediana 2, grande 3. El porcentaje es lo hecho entre lo hecho más lo pendiente.'
            : 'Cada ficha construida vale 2 puntos y cada parcial 1, sobre el total de fichas. La nota no liga las brechas con sus fichas, así que el porcentaje es aproximado.'}
            {m.conteos && ` Hoy: ${m.conteos.construido} construidas, ${m.conteos.parcial} parciales y ${m.conteos.noConstruido} sin construir.`}
            {m.calendario?.cierre && dc != null && ` El módulo cierra ${m.calendario.cierre.semana} (${m.calendario.cierre.sprint}); ${faltan(dc)}.`}</p></details>
      </section>
      {m.calendario && <Tiempo c={m.calendario} />}
    </div>

    <section className="pl-datos" aria-label="Resumen del módulo">
      <DatoDet valor={m.falta.length} etiqueta="brechas" />
      <DatoDet valor={sinTarea.length} etiqueta="sin tarea" />
      <DatoDet valor={bloqueos.length} etiqueta="dudas que bloquean" rojo={bloqueos.length > 0} />
      <DatoDet valor={sinSubir} etiqueta="sin subir" rojo={sinSubir > 0} />
    </section>

    {alertas > 0 && <p className="pl-alerta" role="alert"><Icono n="alto" />
      <span>{aud!.alertas.join('. ')}. <button type="button" className="enlace" onClick={() => cambiar('subir')}>Ver cuáles</button></span></p>}

    <div className="pl-cols">
      <aside className="pl-lado" aria-label="Bloqueos y lecturas">
        <Bloqueos bloqueos={bloqueos} sinTarea={sinTarea} modulo={m.nombre} />
        {m.paraSaberMas && m.paraSaberMas.length > 0 && <SaberMas notas={m.paraSaberMas} />}
      </aside>

      <Tabs.Root value={tab} onValueChange={cambiar} className="pl-pestanas">
        <Tabs.List className="pl-tabs" aria-label="Secciones del módulo">
          {pest('falta', 'Falta', m.falta.length, sinTarea.length > 0)}
          {pest('hecho', 'Hecho', `${hechas.length} + ${parciales.length}`, false, `Hecho: ${hechas.length} construidas y ${parciales.length} parciales`)}
          {pest('dudas', 'Dudas', dudas.length, bloqueos.length > 0)}
          {pest('necesita', 'Necesita', nNec)}
          {pest('agentes', 'Hecho por agentes', agentes.length)}
          {pest('subir', 'Sin subir', sinSubir, sinSubir > 0 || alertas > 0)}
        </Tabs.List>

        {conBusqueda && <div className="pl-herr">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en esta sección" aria-label="Buscar en esta sección" />
          {tab === 'dudas' && dudas.length > 0 && <PersonasFiltro dudas={dudas} actual={persona} elegir={setPersona} />}
        </div>}

        <Tabs.Content value="falta" className="pl-panel">
          <div className="pl-orden-tam"><span>Ordenado por tamaño de brecha</span>
            <span className="mono" aria-label={`Tamaños: ${porTam('S')} chicas, ${porTam('M')} medianas, ${porTam('L')} grandes`}>S {porTam('S')} · M {porTam('M')} · L {porTam('L')}</span></div>
          {faltaVis.length ? <ul className="pl-lista">{faltaVis.map((f) => <li key={f.n} className="pl-item pl-brecha">
            <span className={`pl-tam ${f.tamano ?? 'sin'}`} role="img" aria-label={f.tamano ? `Tamaño ${f.tamano}` : 'Sin tamaño'}>{f.tamano ?? '–'}</span>
            <span className="pl-cuerpo-item">
              <Largo>{f.brecha}</Largo>
              <span className="pl-etiquetas">
                <span className="mono meta">#{f.n}</span>
                {f.sinTarea && <Pildora tono="rojo" icono="alto">SIN TAREA</Pildora>}
                {f.tareas.map((t) => <span key={t} className="mono meta">{t}</span>)}
                {f.fuente && <span className="meta">{f.fuente}</span>}</span>
            </span></li>)}</ul> : <Nada>Nada pendiente en la nota.</Nada>}
          {faltaOrd.length > 6 && <button type="button" className="boton-chico pl-mas-brechas" aria-expanded={todas} onClick={() => setTodas(!todas)}>{todas ? 'Ver menos' : `Ver las ${faltaOrd.length - 6} restantes`}</button>}
        </Tabs.Content>

        <Tabs.Content value="hecho" className="pl-panel">
          <Grupo titulo="Construidas" lista={fichaVis(hechas)} vacio="Ninguna ficha construida." pintar={(f) => <Fila2 f={f} marca="✓" tono="verde" etiqueta="Construida" />} />
          <Grupo titulo="Parciales" lista={fichaVis(parciales)} vacio="Ninguna parcial." pintar={(f) => <Fila2 f={f} marca="◐" tono="azul" etiqueta="Parcial" />} />
          <Grupo titulo="Sin construir" lista={fichaVis(porHacer)} vacio="Todas las fichas ya tienen avance." pintar={(f) => <Fila2 f={f} marca="○" tono="gris" etiqueta="Sin construir" />} />
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

        <Tabs.Content value="agentes" className="pl-panel">
          {agentesVis.length ? <ul className="pl-lista">{agentesVis.map((e) => <li key={e.id} className="pl-item"><span className="pl-id mono">{e.id}</span><span className="pl-cuerpo-item">
            <Largo>{e.tarea}</Largo>
            <span className="pl-etiquetas"><Chip color={/^(terminada|complete)/i.test(e.estado) ? 'verde' : 'azul-suave'}>{e.estado || 'sin estado'}</Chip>
              <span className="meta mono">{e.rama || 'sin rama'}</span>
              <span className="meta">{/^https:\/\//.test(e.pr) ? <a href={e.pr} target="_blank" rel="noopener noreferrer">Ver PR</a> : e.pr || 'sin PR'}</span></span>
            {e.ultimo && <span className="meta">{e.ultimo.fecha} · {e.ultimo.agente}: {e.ultimo.cambio}</span>}</span></li>)}</ul>
            : <Nada>{agentes.length ? 'Nada coincide con el filtro.' : 'Ningún expediente de agentes ligado a este módulo.'}</Nada>}
        </Tabs.Content>

        <Tabs.Content value="subir" className="pl-panel">
          {aud?.sinSubir.length ? <ul className="pl-lista">{aud.sinSubir.map((w) => <li key={w.ruta} className="pl-item pl-rojo-item"><span className="pl-cuerpo-item">
            <b className="mono">{w.rama || 'sin rama'}</b><span className="meta">{w.repo} · {w.ruta}</span>
            <span className="pl-etiquetas"><Pildora tono={w.sin_commit ? 'rojo' : 'gris'}>{w.sin_commit} sin commit</Pildora><Pildora tono={w.sin_subir ? 'rojo' : 'gris'}>{w.sin_subir} sin subir</Pildora></span></span></li>)}</ul>
            : <p className="pl-ok"><Icono n="terminada" />Nada sin subir: ninguna rama de este módulo tiene cambios sin commit ni sin push.</p>}
          {aud?.alertas.map((a) => <p key={a} className="pl-alerta" role="alert"><Icono n="alto" />{a}</p>)}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  </div>
}

// Columna derecha: lo que frena al módulo. Dudas que bloquean por persona (con «Recordar») y brechas que nadie tiene en una tarea.
function Bloqueos({ bloqueos, sinTarea, modulo }: { bloqueos: Duda[]; sinTarea: Brecha[]; modulo: string }) {
  const [mas, setMas] = useState(false)
  const [aviso, setAviso] = useState(false)
  useEffect(() => { if (!aviso) return; const r = setTimeout(() => setAviso(false), 6000); return () => clearTimeout(r) }, [aviso])
  const porPersona = new Map<string, Duda[]>()
  for (const d of bloqueos) for (const p of personas(d.para)) porPersona.set(p, [...(porPersona.get(p) ?? []), d])
  const total = bloqueos.length + sinTarea.length
  // Borrador, no tarea: una por brecha con título, módulo, tamaño y fuente. No se crea nada en ClickUp.
  const borrador = () => `Borrador de tareas para ClickUp · ${modulo}\n\n` + sinTarea.map((f, i) =>
    `${i + 1}. ${f.brecha}\n   Módulo: ${modulo}\n   Tamaño: ${f.tamano ?? 'sin definir'}\n   Fuente: ${f.fuente || 'sin fuente'}`).join('\n\n')
  const visibles = mas ? sinTarea : sinTarea.slice(0, 2)
  if (!total) return <section className="pl-caja pl-bloqueos" aria-label="Bloqueos"><h3 className="pl-etq">Bloqueos <span className="cuenta">0</span></h3><p className="pl-ok"><Icono n="terminada" />Nada bloquea este módulo.</p></section>
  return <section className="pl-caja pl-bloqueos" data-tono="rojo" aria-label="Bloqueos">
    <h3 className="pl-etq">Bloqueos <span className="cuenta rojo">{total}</span></h3>
    {bloqueos.length > 0 && <>
      <h4 className="pl-sub2">Esperando respuesta</h4>
      <ul className="pl-gente">{[...porPersona.entries()].map(([p, ds]) => <li key={p}>
        <span className="pl-avatar" aria-hidden="true">{iniciales(p)}</span>
        <span className="pl-quien"><b>{p}</b><span className="mono meta">{ds.map((d) => d.id).join(' · ')}</span></span>
        <Copiar className="boton-chico peligro-solido" texto={() => mensajeParaPersona(p, ds, ds.every((d) => d.enviada))}>Recordar<span className="oculto"> a {p}</span></Copiar></li>)}</ul></>}
    {sinTarea.length > 0 && <>
      <h4 className="pl-sub2">Brechas sin tarea</h4>
      <ul className="pl-tarjetas">{visibles.map((f) => <li key={f.n}><b>#{f.n}</b> {f.brecha}</li>)}</ul>
      <div className="pl-acciones">
        <Copiar className="boton-chico pl-crear" alCopiar={() => setAviso(true)} texto={borrador}>Crear tareas ({sinTarea.length})</Copiar>
        {sinTarea.length > 2 && <button type="button" className="boton-chico" aria-expanded={mas} onClick={() => setMas(!mas)}>{mas ? 'Ver menos' : `Ver ${sinTarea.length - 2} más`}</button>}
      </div>
      {aviso && <p className="meta pl-aviso" role="status">Borrador copiado; todavía no se crea en ClickUp.</p>}</>}
  </section>
}

function SaberMas({ notas }: { notas: { ruta: string; titulo: string }[] }) {
  const [todas, setTodas] = useState(false)
  const vis = todas ? notas : notas.slice(0, 3)
  return <section className="pl-caja pl-saber" aria-label="Para saber más">
    <h3 className="pl-etq">Para saber más</h3>
    <ul className="pl-notas">{vis.map((n) => <li key={n.ruta}><a href={obsidian(n.ruta)} aria-label={`Abrir ${n.titulo} en Obsidian`}>{n.titulo}</a></li>)}</ul>
    {notas.length > 3 && <button type="button" className="enlace" aria-expanded={todas} onClick={() => setTodas(!todas)}>{todas ? 'Ver menos' : `Ver ${notas.length - 3} más`}</button>}
  </section>
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
