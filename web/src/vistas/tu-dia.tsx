// Tu día: pestañas Agenda, Pizarra, Pendientes, Para ti, Memoria y Roles; cada tarjeta y objeto de la escena abre la suya.
import { useEffect, useRef, useState } from 'react'
import { Tabs } from 'radix-ui'
import { BotonAccion, Chip, ChipPrioridad, Enlace, NombreTarea } from '@/components/comunes'
import { useOficina, type Seccion } from '@/components/contexto'
import { Icono } from '@/components/icono'
import { Cerrar, Descripcion, Titulo, Ventana } from '@/components/ventana'
import { leer, post, postSeguro, rutaSesion } from '@/lib/api'
import { DIA, ESTADOS, VIVOS, carpeta, esperaProcesos, fecha, gb, hace, horaDe, inicioDia, nombreSesion, pendientesParaMi, plano, proximoCorte, resumenPizarra, veredicto } from '@/lib/oficina'
import type { Datos, Tarea } from '@/lib/tipos'
import { RolesVista } from './encargos'
import { PizarraVista } from './pizarra'
import { NIVEL_MEM } from './tarjetas'

const PESTANAS: [Seccion, string][] = [['agenda', 'Agenda'], ['pizarra', 'Pizarra'], ['pendientes', 'Pendientes'], ['parati', 'Para ti'], ['memoria', 'Memoria'], ['roles', 'Roles']]

export function TuDia({ seccion: inicial }: { seccion: Seccion }) {
  const { datos: d, mem, cerrarVentana } = useOficina()
  const [seccion, setSeccion] = useState(inicial)
  const cuerpo = useRef<HTMLDivElement>(null)
  useEffect(() => { if (cuerpo.current) cuerpo.current.scrollTop = 0 }, [seccion])
  const v = veredicto(d)
  const corte = proximoCorte()
  const hoy = [...v.vencidas, ...v.hoy]
  const p = d.pendientes
  const cuentas: Record<Seccion, [number | null, string]> = {
    agenda: [hoy.length, v.vencidas.length ? 'rojo' : hoy.length ? 'aviso' : ''],
    pizarra: [resumenPizarra(d).enCurso || null, ''],
    pendientes: [p.sesiones.length + p.notas.length + p.solicitudes.length, p.solicitudes.length || p.sesiones.length ? 'aviso' : ''],
    parati: [pendientesParaMi(d).length, ''],
    memoria: [null, mem?.nivel === 'critico' ? 'rojo' : mem?.nivel === 'alto' ? 'aviso' : ''],
    roles: [d.encargos?.filter((e) => e.estado === 'arrancando' || e.estado === 'entregando').length || null, ''],
  }
  return (
    <Ventana alCerrar={cerrarVentana} id="v-oficina">
      <header className="vo-cabeza"><Titulo>Tu día</Titulo>
        <Descripcion oculta>Tu agenda, la pizarra de tus worktrees, lo pendiente, los comentarios para ti y la memoria de la computadora.</Descripcion>
        <div className="fila">
          <span className={`chip ${v.color} veredicto`}>{v.texto}</span>
          {corte && <span className="meta fila gap-s1"><Icono n="hora" />{corte.nombre} a las {corte.hora}</span>}
        </div>
        <Cerrar /></header>
      <Tabs.Root value={seccion} onValueChange={(x) => setSeccion(x as Seccion)} className="flex min-h-0 flex-1 flex-col">
        <Tabs.List className="vo-tabs" aria-label="Secciones">
          {PESTANAS.map(([id, texto]) => {
            const [n, tono] = cuentas[id]
            return <Tabs.Trigger key={id} value={id}>{texto}
              {n != null ? <span className={`cuenta ${tono}`}>{n}</span> : tono && <span className="punto naranja" />}</Tabs.Trigger>
          })}
        </Tabs.List>
        <div className="cuerpo" ref={cuerpo}>
          <Tabs.Content value="agenda"><Agenda d={d} hoy={hoy} /></Tabs.Content>
          <Tabs.Content value="pizarra"><PizarraVista /></Tabs.Content>
          <Tabs.Content value="pendientes"><Pendientes /></Tabs.Content>
          <Tabs.Content value="parati"><ParaTi /></Tabs.Content>
          <Tabs.Content value="memoria"><MemoriaVista /></Tabs.Content>
          <Tabs.Content value="roles"><RolesVista /></Tabs.Content>
        </div>
      </Tabs.Root>
    </Ventana>
  )
}

function FilaHoy({ t, d, ahora }: { t: Tarea; d: Datos; ahora: number }) {
  const { abrirAgente, abrirNueva } = useOficina()
  const ses = d.sesiones.filter((s) => s.tarea_id === t.id && VIVOS.has(s.estado))
  const nCom = d.comentarios.filter((c) => c.tarea_id === t.id && !c.es_mio && c.para_mi && !c.respondido && !c.visto_local).length
  const vencida = t.due_ts! < ahora
  return (
    <li className="vo-fila">
      <span className={`hora ${vencida ? 'vencida' : ''}`}>{vencida ? 'Vencida' : horaDe(t.due_ts!)}</span>
      <div className="vo-tarea">
        <Enlace href={t.url} className="vo-nombre"><NombreTarea t={t} /></Enlace>
        <div className="fila"><span className="chip azul-suave">{t.estado ?? '—'}</span><ChipPrioridad p={t.prioridad} />
          {vencida && <span className="meta">{fecha(t.due_ts!)}</span>}{nCom > 0 && <Chip color="naranja">{nCom} para ti</Chip>}</div>
        {t.horario && <div className="ficha-tarea"><b>Horario: </b>{t.horario}</div>}
        {t.choque && <div className="ficha-tarea"><b>Choque: </b>{t.choque}</div>}
      </div>
      <div className="vo-accion">
        {ses.length ? ses.map((s) => (
          <button key={s.id} type="button" className={`vo-agente ${ESTADOS[s.estado]?.[1] ?? ''}`} onClick={() => abrirAgente(s.id)}>
            <span className="punto" />{esperaProcesos(s, d) ? 'Agente esperando proceso' : `Agente ${ESTADOS[s.estado]?.[0].toLowerCase() ?? ''}`}</button>
        )) : <button type="button" className="primario" onClick={() => abrirNueva({ tareaId: t.id })}><span aria-hidden="true">▶</span>Empezar sesión</button>}
      </div>
    </li>
  )
}

function Agenda({ d, hoy }: { d: Datos; hoy: Tarea[] }) {
  const ahora = Date.now()
  // Próximos días: un botón por día con tareas (y «Sin fecha»); el elegido se muestra en tarjetas de dos columnas.
  const desde = inicioDia(ahora) + DIA
  const porDia = Map.groupBy(d.tareas.filter((t) => t.due_ts == null || t.due_ts >= desde).sort((a, b) => (a.due_ts ?? Infinity) - (b.due_ts ?? Infinity)),
    (t) => (t.due_ts == null ? 'sin-fecha' : String(inicioDia(t.due_ts))))
  const claves = [...porDia.keys()]
  const [elegido, setElegido] = useState<string | null>(null)
  const [completos, setCompletos] = useState(new Set<string>()) // días con «Ver N más» abierto
  const dia = elegido && porDia.has(elegido) ? elegido : claves[0] ?? null
  const etiquetaDia = (k: string) => (k === 'sin-fecha' ? 'Sin fecha' : Number(k) === desde ? 'Mañana'
    : new Date(Number(k)).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\.|,/g, '').replace(' de ', ' ').replace(/^./, (c) => c.toUpperCase()))
  const delDia = (dia && porDia.get(dia)) || []
  const MAX = 8
  const todos = dia != null && completos.has(dia)
  const visibles = todos ? delDia : delDia.slice(0, MAX)
  return <>
    <h3 className="sin-margen-arriba">Hoy</h3>
    <ul id="vo-hoy">{hoy.length ? hoy.map((t) => <FilaHoy key={t.id} t={t} d={d} ahora={ahora} />) : <li className="vacio">Nada vence hoy.</li>}</ul>
    <Tabs.Root value={dia ?? ''} onValueChange={setElegido}>
      <div className="fila vo-dias-fila"><h3 className="sin-margen">Próximos días</h3>
        <Tabs.List className="fila" aria-label="Día">
          {claves.slice(0, 8).map((k) => <Tabs.Trigger key={k} value={k} className="vo-dia">{etiquetaDia(k)}<span className="cuenta">{porDia.get(k)!.length}</span></Tabs.Trigger>)}
        </Tabs.List>
      </div>
      {dia && <Tabs.Content value={dia}>
        <div className="vo-grid">{visibles.map((t) => (
          <Enlace key={t.id} href={t.url} className="vo-tarjeta"><span className="hora">{t.due_ts ? horaDe(t.due_ts) : '—'}</span><span className="vo-nombre"><NombreTarea t={t} /></span></Enlace>
        ))}</div>
        {delDia.length > MAX && <button type="button" className="boton-chico arriba-s2" onClick={() => setCompletos((c) => {
          const n = new Set(c); if (n.has(dia)) n.delete(dia); else n.add(dia); return n
        })}>{todos ? 'Ver menos' : `Ver ${delDia.length - MAX} más de este día`}</button>}
      </Tabs.Content>}
    </Tabs.Root>
    {!delDia.length && <p className="vacio">Nada vence en los próximos días.</p>}
    <section className="bloque arriba-s5" aria-labelledby="vo-noche-t">
      <h4 id="vo-noche-t">Turno nocturno</h4>
      <Noche />
    </section>
  </>
}

function Noche() {
  const [noche, setNoche] = useState<{ fecha: string | null; texto?: string } | null>(null)
  useEffect(() => { leer<{ fecha: string | null; texto?: string }>('/api/noche').then(setNoche, () => setNoche({ fecha: null })) }, [])
  if (!noche) return <p className="vacio">Cargando…</p>
  if (!noche.fecha) return <p className="vacio">No hay resumen del turno nocturno.</p>
  const deHoy = noche.fecha === new Date().toLocaleDateString('sv')
  const texto = <div className="anoche">{(noche.texto ?? '').replace(/^#+\s*/gm, '').replace(/\*\*/g, '').replace(/`/g, '')}</div>
  return deHoy && new Date().getHours() < 12
    ? <><p className="meta abajo-s2">Resumen de anoche ({noche.fecha})</p>{texto}</>
    : <details><summary>Resumen del turno del {noche.fecha}</summary>{texto}</details>
}

// Sesiones que murieron sin cerrarse (OOM, reinicio, kill), solicitudes de sesión de los agentes y notas sueltas.
function Pendientes() {
  const { datos: d, tareas } = useOficina()
  const { sesiones, notas, solicitudes } = d.pendientes
  const [nota, setNota] = useState('')
  const accion = (texto: string, url: string, primario = false) => <BotonAccion className={`boton-chico ${primario ? 'primario' : ''}`} accion={() => postSeguro(url)}>{texto}</BotonAccion>
  const quien = (sid: string | null) => { const s = d.sesiones.find((x) => x.id === sid); return s ? nombreSesion(s, tareas) : 'Un agente' }
  const agregar = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!nota.trim()) return
    try { await post('/api/pendientes', { texto: nota }); setNota('') } catch (e) { alert((e as Error).message) }
  }
  return <>
    {sesiones.length || notas.length || solicitudes.length ? <div>
      {/* Un agente pidió abrir otra sesión: ves exactamente qué abriría y con qué permisos; nada se abre sin tu clic. */}
      {solicitudes.map((q) => <div className="comentario" key={`q${q.id}`}>
        <div className="fila"><Chip color="amarillo">Quiere abrir una sesión</Chip><b className="corto">{q.nombre || 'sin nombre'}</b><span className="meta">{hace(q.creado_ts)}</span></div>
        <div className="meta">Pide: {quien(q.de_sesion)} · carpeta {q.cwd} · permisos {q.permiso}{q.modelo ? ` · ${q.modelo}` : ''}{q.tarea_id ? ` · tarea ${q.tarea_id}` : ''}</div>
        <pre className="pre-ajustado entre-s1">{q.prompt}</pre>
        <div className="fila">{accion('Abrir', `/api/solicitudes/${q.id}/aprobar`, true)}{accion('Rechazar', `/api/solicitudes/${q.id}/rechazar`)}</div>
      </div>)}
      {sesiones.map((s) => <div className="comentario" key={`s${s.id}`}>
        <div className="fila"><Chip color="naranja">Sesión cerrada</Chip><b className="corto">{nombreSesion(s, tareas)}</b><span className="meta">{hace(s.terminada_ts)}</span></div>
        <div className="meta corto">{carpeta(s.cwd)}</div>
        {s.ultimo_mensaje && <div className="mensaje corto3">{plano(s.ultimo_mensaje)}</div>}
        <div className="fila">{accion('Retomar', rutaSesion(s.id, 'retomar'), true)}{accion('Descartar', rutaSesion(s.id, 'descartar'))}</div>
      </div>)}
      {notas.map((n) => <div className="comentario" key={`n${n.id}`}>
        <div className="mensaje">{n.texto}</div>
        <div className="fila">{accion('Hecho', `/api/pendientes/${n.id}/hecho`)}<span className="meta">{hace(n.creado_ts)}</span></div>
      </div>)}
    </div> : <p className="vacio">Nada pendiente.</p>}
    <form className="fila arriba-s2" onSubmit={agregar}>
      <input type="text" maxLength={500} placeholder="Anota algo pendiente…" aria-label="Nuevo pendiente" className="crece"
        value={nota} onChange={(e) => setNota(e.target.value)} />
      <button className="boton-chico" type="submit">Agregar</button>
    </form>
  </>
}

function ParaTi() {
  const { datos: d, tareas } = useOficina()
  const [todos, setTodos] = useState(false)
  const lista = d.comentarios.filter((c) => !c.es_mio && (todos || (c.para_mi && !c.respondido && !c.visto_local)))
  return <>
    <div className="fila fin"><label className="meta"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Todos los comentarios</label></div>
    {lista.length ? <div>{lista.map((c) => {
      const t = tareas[c.tarea_id]
      return (
        <div className={`comentario ${c.tipo === 'correccion' && !c.visto_local ? 'correccion' : ''}`} key={c.id}>
          <div className="fila"><b>{c.autor}</b>{c.tipo === 'correccion' && <Chip color="naranja">Corrección</Chip>}<span className="meta">{hace(c.ts)}</span>
            {c.respondido ? <Chip color="verde">respondido</Chip> : null}{c.visto_local ? <Chip>visto</Chip> : null}</div>
          {t && <div className="meta corto">{t.nombre}</div>}
          <div className="mensaje corto3">{c.texto}</div>
          <div className="fila">
            {!c.visto_local && <button className="boton-chico" type="button" onClick={() => postSeguro(`/api/comentarios/${encodeURIComponent(c.id)}/visto`)}>Marcar visto</button>}
            {t && <Enlace className="fila gap-s1 texto-sm" href={`${t.url}?comment=${encodeURIComponent(c.id)}`}>Abrir en ClickUp<Icono n="externo" /></Enlace>}
          </div>
        </div>
      )
    })}</div> : <p className="vacio">{todos ? 'No hay comentarios de otras personas.' : 'Nada dirigido a ti sin responder.'}</p>}
  </>
}

// Memoria: cuánta queda, cuánto usa cada agente y pausa (SIGSTOP) para que systemd-oomd no los mate.
function MemoriaVista() {
  const { datos: d, tareas, mem, cargarMemoria } = useOficina()
  if (!mem) return <p className="vacio">Cargando…</p>
  const [texto, color] = NIVEL_MEM[mem.nivel]
  const barra = (usado: number, total: number) => {
    const pct = total ? Math.round((100 * usado) / total) : 0
    return <div className="fila">
      <div className="medidor nivel crece" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <i className={pct > 85 ? 'lleno' : pct > 65 ? 'medio' : ''} style={{ width: `${pct}%` }} /></div>
      <span className="meta">{gb(usado)} de {gb(total)}</span></div>
  }
  return <>
    <div className="fila"><Chip color={color}>{texto}</Chip>
      <span className="meta">{mem.nivel === 'critico' ? 'No se abren sesiones nuevas. Pausa o cierra un agente.' : mem.nivel === 'alto' ? 'Cuidado al abrir más agentes.' : `${gb(mem.disponible)} disponibles`}</span></div>
    <div className="meta arriba-s2">RAM</div>{barra(mem.total - mem.disponible, mem.total)}
    <div className="meta arriba-s2">Swap</div>{barra(mem.swapTotal - mem.swapLibre, mem.swapTotal)}
    <div className="meta arriba-s3">Por agente (aprox., incluye sus procesos)</div>
    {mem.sesiones.length ? <ul className="lista-simple">{mem.sesiones.map((s) => {
      const ses = d.sesiones.find((x) => x.id === s.id)
      return <li className="fila" key={s.id}>
        <span className="corto crece">{ses ? nombreSesion(ses, tareas) : (s.nombre ?? s.id.slice(0, 8))}</span>
        {s.pausada && <Chip color="naranja">pausado</Chip>}<span className="meta">{(s.mb / 1024).toFixed(1)} GB</span>
        <BotonAccion className={`boton-chico ${s.pausada ? 'primario' : ''}`}
          accion={async () => { await postSeguro(rutaSesion(s.id, s.pausada ? 'reanudar' : 'pausar')); cargarMemoria() }}>{s.pausada ? 'Reanudar' : 'Pausar'}</BotonAccion>
      </li>
    })}</ul> : <p className="vacio">No hay agentes abiertos.</p>}
  </>
}
