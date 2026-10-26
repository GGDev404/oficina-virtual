// Planos (ventana propia): tablero de los 7 módulos y detalle por módulo, desde la bóveda de Obsidian (GET /api/planos).
// El texto de la bóveda siempre entra como texto de React, nunca como HTML.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { BotonAccion, Chip } from '@/components/comunes'
import { useOficina } from '@/components/contexto'
import { Icono, type NombreIcono } from '@/components/icono'
import { Cerrar, Descripcion, Titulo, Ventana } from '@/components/ventana'
import { leer } from '@/lib/api'

interface Cierre { semana: string; sprint: string }
interface Resumen {
  id: string; nombre: string; aviso?: string; nota: { ruta: string; titulo: string; fecha: string } | null; pct: number | null
  conteos?: { construido: number; parcial: number; noConstruido: number }
  brechas: number; sinTarea: number; bloquean: number; dudas?: number; sinSubir: number; alertas?: number; cierre?: Cierre | null
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
const faltan = (n: number | null) => n == null ? '' : n < 0 ? `pasó hace ${-n} días` : n === 0 ? 'es hoy' : `faltan ${n} ${n === 1 ? 'día' : 'días'}`
const obsidian = (ruta: string) => `obsidian://open?vault=Millet-ERP&file=${encodeURIComponent(ruta)}`

function useCarga<T>(url: string) {
  const [d, setD] = useState<{ datos?: T; error?: string }>({})
  const cargar = useCallback(async () => {
    setD({})
    try {
      const r = await leer<T & { error?: string }>(url)
      setD(r?.error ? { error: r.error } : { datos: r })
    } catch { setD({ error: 'No se pudo leer la bóveda.' }) }
  }, [url])
  useEffect(() => { cargar() }, [cargar])
  return { ...d, cargar }
}

function Semaforo({ tono, aviso }: { tono: Tono; aviso?: string }) {
  const t = TONO[tono]
  return <span className={`pl-semaforo ${tono}`}><Icono n={t.icono} />{t.texto}{aviso ? ` · ${aviso}` : ''}</span>
}

// Una celda por ficha: construida (verde), parcial (azul) o por hacer; el % pesa la parcial a la mitad.
function Barra({ c, pct }: { c?: Resumen['conteos']; pct: number | null }) {
  if (!c) return null
  const celdas = [...Array(c.construido).fill('hecho'), ...Array(c.parcial).fill('progreso'), ...Array(c.noConstruido).fill('')]
  return <div className="pz-linea" role="img" aria-label={`${pct ?? 0} %: ${c.construido} construidas, ${c.parcial} parciales y ${c.noConstruido} sin construir`}>
    {celdas.map((k, i) => <i key={i} className={k} />)}</div>
}

export function PlanosVentana() {
  const { cerrarVentana } = useOficina()
  const [id, setId] = useState<string | null>(null)
  const t = useCarga<Tablero>('/api/planos')
  const entrega = t.datos && `entrega ${corta(t.datos.entrega)} · ${faltan(t.datos.diasParaEntrega)}`
  return (
    <Ventana alCerrar={cerrarVentana} id="v-planos">
      <header className="vo-cabeza"><Titulo>Planos</Titulo>
        <Descripcion oculta>Avance de tus siete módulos según las notas de la bóveda de Obsidian: qué está hecho, qué falta, qué necesita y qué dudas bloquean.</Descripcion>
        {entrega && <Chip color="azul-suave">{entrega}</Chip>}
        <Cerrar /></header>
      <div className="cuerpo pila-grande">
        {id ? <DetalleModulo id={id} volver={() => setId(null)} />
          : t.error ? <p className="pl-error" role="alert">{t.error} <BotonAccion accion={t.cargar}>Reintentar</BotonAccion></p>
          : !t.datos ? <p className="vacio" role="status">Leyendo la bóveda…</p>
          : <>
            <ul className="pl-rejilla">{t.datos.modulos.map((m) => <li key={m.id}><Tarjeta m={m} abrir={() => setId(m.id)} /></li>)}</ul>
            {t.datos.sinLigar.length > 0 && <p className="pl-alerta"><Icono n="alto" />
              {t.datos.sinLigar.length} worktrees con cambios sin subir no se ligan a ningún módulo: {t.datos.sinLigar.map((w) => w.rama).join(', ')}</p>}
          </>}
      </div>
    </Ventana>
  )
}

function Tarjeta({ m, abrir }: { m: Resumen; abrir: () => void }) {
  const tono = semaforo(m)
  const cierre = m.cierre && `Cierre ${m.cierre.semana} · ${m.cierre.sprint}`
  return (
    <button type="button" className="pl-tarjeta" data-tono={tono} onClick={abrir} aria-label={`${m.nombre}, ${m.pct ?? 'sin'} %, semáforo ${TONO[tono].texto}. Abrir detalle`}>
      <b className="pl-nombre">{m.nombre}</b>
      <span className="pl-pct">{m.pct == null ? '—' : `${m.pct}%`}</span>
      <Barra c={m.conteos} pct={m.pct} />
      <Semaforo tono={tono} aviso={m.aviso} />
      <span className="pl-datos">
        <span><b>{m.brechas}</b> brechas</span>
        <span className={m.sinTarea ? 'pl-fuerte' : ''}><b>{m.sinTarea}</b> sin tarea</span>
        <span className={m.bloquean ? 'pl-rojo' : ''}><b>{m.bloquean}</b> dudas que bloquean</span>
        <span className={m.sinSubir > 0 ? 'pl-rojo' : ''}><b>{m.sinSubir}</b> sin subir</span>
      </span>
      <span className="meta">{cierre ?? 'Sin semana de cierre'}</span>
    </button>
  )
}

// Del hoy a la entrega: marca la semana de cierre del módulo (su último día) y el corte. Posiciones en % del rango.
const finDeCierre = (semana: string | undefined, anio: number) => {
  const m = semana?.match(/(\d+)\s*[–-]\s*(\d+)\s+([a-z]{3})/i) ?? semana?.match(/()(\d+)\s+([a-z]{3})/i)
  const mes = m ? MESES.indexOf(m[3].toLowerCase()) : -1
  return mes < 0 ? null : Date.UTC(anio, mes, Number(m![2]))
}
function Tiempo({ c }: { c: NonNullable<Detalle['calendario']> }) {
  if (!c.entrega) return null
  const hoy = new Date(), ini = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()), fin = Date.parse(c.entrega)
  const pos = (ms: number | null) => ms == null ? null : Math.min(100, Math.max(0, ((ms - ini) / (fin - ini)) * 100))
  const marcas = [
    { k: 'hoy', t: `hoy ${corta(hoy.toLocaleDateString('sv'))}`, p: 0 },
    { k: 'cierre', t: c.cierre ? `cierre ${c.cierre.semana}` : '', p: pos(finDeCierre(c.cierre?.semana, new Date(fin).getUTCFullYear())) },
    { k: 'corte', t: c.corte ? `corte ${corta(c.corte)}` : '', p: pos(c.corte ? Date.parse(c.corte) : null) },
    { k: 'entrega', t: `entrega ${corta(c.entrega)}`, p: 100 },
  ].filter((x) => x.t && x.p != null)
  return <section aria-label="Línea de tiempo hasta la entrega" className="pl-tiempo">
    <div className="pl-pista" aria-hidden="true">{marcas.map((x) => <i key={x.k} className={x.k} style={{ left: `${x.p}%` }} />)}</div>
    <ul className="pl-marcas">{marcas.map((x) => <li key={x.k} className={x.k}>{x.t}</li>)}</ul>
  </section>
}

function Recorte<T>({ items, max = 6, pintar }: { items: T[]; max?: number; pintar: (x: T, i: number) => ReactNode }) {
  const lista = (l: T[], d = 0) => <ul className="pl-lista">{l.map((x, i) => <li key={i + d}>{pintar(x, i + d)}</li>)}</ul>
  return <>{lista(items.slice(0, max))}
    {items.length > max && <details><summary>y {items.length - max} más</summary>{lista(items.slice(max), max)}</details>}</>
}

function Columna({ titulo, cuenta, children }: { titulo: string; cuenta?: number; children: ReactNode }) {
  return <section className="pl-col" aria-label={titulo}><h4>{titulo}{cuenta != null && <span className="cuenta"> ({cuenta})</span>}</h4>{children}</section>
}
const Nada = ({ children }: { children: ReactNode }) => <p className="meta sin-margen">{children}</p>

function DetalleModulo({ id, volver }: { id: string; volver: () => void }) {
  const { datos: m, error, cargar } = useCarga<Detalle>(`/api/planos/${encodeURIComponent(id)}`)
  if (error) return <><button type="button" className="boton-chico" onClick={volver}><Icono n="izquierda" />Tablero</button>
    <p className="pl-error" role="alert">{error} <BotonAccion accion={cargar}>Reintentar</BotonAccion></p></>
  if (!m) return <p className="vacio" role="status">Leyendo el módulo…</p>
  const tono = semaforo({ ...m, alertas: m.auditoria?.alertas.length })
  const hechas = m.fichas.filter((f) => f.estado === 'construido'), parciales = m.fichas.filter((f) => f.estado === 'parcial')
  const bloqueos = m.dudas?.bloquean ?? [], sinTarea = m.falta.filter((f) => f.sinTarea)
  const nec = m.necesita, aud = m.auditoria
  return <>
    <div className="pl-cabeza" data-tono={tono}>
      <button type="button" className="boton-chico" onClick={volver}><Icono n="izquierda" />Tablero</button>
      <h3>{m.nombre}</h3>
      <span className="pl-pct">{m.pct == null ? '—' : `${m.pct}%`}</span>
      <Semaforo tono={tono} aviso={m.aviso} />
      {m.nota && <span className="meta">nota del {corta(m.nota.fecha)}</span>}
      {m.nota && <a className="pl-obsidian" href={obsidian(m.nota.ruta)}><Icono n="externo" />Abrir en Obsidian</a>}
    </div>
    <p className="meta sin-margen" title={m.basePct}>
      Criterio del %: {m.basePct ?? 'sin dato'}.{m.conteos && ` Fichas: ${m.conteos.construido} construidas, ${m.conteos.parcial} parciales, ${m.conteos.noConstruido} sin construir.`}</p>
    {m.calendario && <Tiempo c={m.calendario} />}

    {(bloqueos.length > 0 || sinTarea.length > 0) && <section className="pl-bloqueos" aria-label="Bloqueos"><h4><Icono n="alto" />Bloqueos</h4>
      <Recorte max={5} items={[...bloqueos.map((d) => ({ d, f: null })), ...sinTarea.map((f) => ({ f, d: null }))]} pintar={(x) => x.d
        ? <><b>{x.d.id}</b>{x.d.para && <span className="meta"> · {x.d.para}</span>}<span className="pl-linea">{x.d.pregunta}</span></>
        : <><b>#{x.f.n}</b> <Chip color="rojo">SIN TAREA</Chip><span className="pl-linea">{x.f.brecha}</span></>} /></section>}

    <div className="pl-cols">
      <Columna titulo="Hecho" cuenta={hechas.length}>
        {hechas.length ? <Recorte items={hechas} pintar={(f) => <><span className="pl-marca verde" aria-label="Construido">✓</span> {f.ficha}</>} /> : <Nada>Ninguna ficha construida.</Nada>}
        {parciales.length > 0 && <><h5>Parcial ({parciales.length})</h5>
          <Recorte items={parciales} max={4} pintar={(f) => <><span className="pl-marca azul" aria-label="Parcial">◐</span> {f.ficha}</>} /></>}
      </Columna>
      <Columna titulo="Falta" cuenta={m.falta.length}>
        {m.falta.length ? <Recorte items={m.falta} max={8} pintar={(f) => <>
          <span className="pl-marca naranja" aria-hidden="true">!</span> {f.brecha}{' '}
          {f.sinTarea && <Chip color="rojo">SIN TAREA</Chip>}{f.tamano && <Chip><span className="oculto">Tamaño </span>{f.tamano}</Chip>}</>} />
          : <Nada>Nada pendiente en la nota.</Nada>}
      </Columna>
      <Columna titulo="Necesita">
        <h5>Decisiones</h5>
        {nec?.decisiones.length ? <Recorte items={nec.decisiones} max={4} pintar={(x) => <>{x.decision}{x.aQuien && <span className="meta"> · pedir a {x.aQuien}</span>}</>} /> : <Nada>Ninguna.</Nada>}
        <h5>Insumos <span className="meta">(ligados por palabra clave)</span></h5>
        {nec?.insumos.length ? <Recorte items={nec.insumos} max={4} pintar={(x) => x} /> : <Nada>Ninguno.</Nada>}
        <h5>Dependencias</h5>
        {nec?.dependencias.length ? <Recorte items={nec.dependencias} max={4} pintar={(x) => <>{x.origen} → {x.destino}: {x.evento}{x.resultado && <span className="meta"> · {x.resultado}</span>}</>} /> : <Nada>Ninguna.</Nada>}
      </Columna>
      <Columna titulo="Dudas" cuenta={m.dudas?.abiertas.length ?? 0}>
        {m.dudas?.abiertas.length ? <Recorte items={m.dudas.abiertas} max={6} pintar={(d) => <>
          <b>{d.id}</b> <Chip color={d.bloquea === 'sí' ? 'rojo' : ''}>{d.bloquea === 'sí' ? 'bloquea' : d.estado}</Chip>
          <span className="corto3 pl-linea">{d.pregunta}</span>{d.para && <span className="meta pl-linea">Para {d.para}</span>}</>} /> : <Nada>Sin dudas abiertas.</Nada>}
      </Columna>
    </div>

    <section aria-label="Sin subir" className="pl-aud"><h4>Sin subir</h4>
      {aud?.alertas.map((a) => <p key={a} className="pl-alerta" role="alert"><Icono n="alto" />{a}</p>)}
      {aud?.sinSubir.length ? <Recorte items={aud.sinSubir} max={5} pintar={(w) => <>
        <b>{w.rama || 'sin rama'}</b> <span className="meta pl-linea">{w.repo} · {w.ruta}</span>
        <Chip color={w.sin_commit ? 'rojo' : ''}>{w.sin_commit} sin commit</Chip> <Chip color={w.sin_subir ? 'rojo' : ''}>{w.sin_subir} sin subir</Chip></>} />
        : <Nada>Nada sin subir: ninguna rama de este módulo tiene cambios sin commit ni sin push.</Nada>}
    </section>
    <section aria-label="Hecho por agentes" className="pl-aud"><h4>Hecho por agentes</h4>
      {aud?.hechoPorAgentes.length ? <Recorte items={aud.hechoPorAgentes} max={5} pintar={(e) => <>
        <b>{e.id}</b> <Chip color={/^(terminada|complete)/i.test(e.estado) ? 'verde' : 'azul-suave'}>{e.estado || 'sin estado'}</Chip>
        <span className="corto pl-linea">{e.tarea}</span>
        <span className="meta una-linea pl-linea">{e.rama || 'sin rama'}{' · '}{/^https:\/\//.test(e.pr) ? <a href={e.pr} target="_blank" rel="noopener noreferrer">PR</a> : e.pr || 'sin PR'}</span>
        {e.ultimo && <span className="meta corto pl-linea">{e.ultimo.fecha} · {e.ultimo.agente}: {e.ultimo.cambio}</span>}</>} />
        : <Nada>Ningún expediente de agentes ligado a este módulo.</Nada>}
    </section>

    <section aria-label="Para saber más" className="pl-aud"><h4>Para saber más</h4>
      {m.paraSaberMas?.length ? <Recorte items={m.paraSaberMas} max={6} pintar={(n) =>
        <a className="pl-obsidian" href={obsidian(n.ruta)} aria-label={`Abrir ${n.titulo} en Obsidian`}><Icono n="externo" />{n.titulo}</a>} />
        : <Nada>Sin notas ligadas.</Nada>}
    </section>
  </>
}
