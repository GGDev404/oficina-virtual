// Nueva sesión: tarea opcional, carpeta, indicación, nombre, modelo y permisos.
import { useRef, useState } from 'react'
import { ResumenTarea } from '@/components/comunes'
import { useOficina, type OpcionesNueva } from '@/components/contexto'
import { Cerrar, Descripcion, Titulo, Ventana } from '@/components/ventana'
import { post } from '@/lib/api'
import { carpeta } from '@/lib/oficina'
import type { Tarea } from '@/lib/tipos'
import { SelectorTarea } from './selector-tarea'

interface Respuesta { cwd?: string; terminal?: boolean; confianza?: boolean; worktree?: { creado?: boolean; rama?: string; base?: string } }

// La raíz del worktree (la ruta más corta con el ID), no una subcarpeta donde haya trabajado una sesión.
const propiaDe = (t: string | null, carpetas: string[]) => (t ? carpetas.filter((c) => c.includes(t)).sort((x, y) => x.length - y.length)[0] ?? null : null)
// Dónde trabaja la sesión nueva: con tarea, su propio worktree (el que ya tenga o uno nuevo); sin tarea, una carpeta
// aparte en ~/Agentes para que nada de otro trabajo llegue a un repo. «Otra carpeta» deja escribir la ruta.
const opcionesUbicacion = (t: string | null, propia: string | null): [string, string][] => (t
  ? [['worktree', propia ? `Su worktree: ${carpeta(propia)}` : 'Worktree nuevo para la tarea (desde origin/develop o su rama)'], ['carpeta', 'Otra carpeta']]
  : [['aparte', 'Carpeta aparte nueva en ~/Agentes (fuera de cualquier repo)'], ['carpeta', 'Otra carpeta']])
const autoDe = (t: Tarea) => ({ prompt: `/agil ${t.id}`, nombre: `${t.id} · ${t.nombre.replace(/^.*?·\s*/, '')}`.slice(0, 60) })

export function NuevaSesion({ opciones: o, carpetas }: { opciones: OpcionesNueva; carpetas: string[] }) {
  const { datos: d, cerrarVentana } = useOficina()
  // Estado inicial: lo que venga explícito (por ejemplo, un traspaso) manda sobre lo que se rellena solo.
  const [inicio] = useState(() => {
    const t = d.tareas.find((x) => x.id === o.tareaId) ?? null
    const auto = t ? autoDe(t) : { prompt: '', nombre: '' }
    const propia = propiaDe(t?.id ?? null, carpetas)
    return {
      tarea: t?.id ?? null, auto,
      cwd: o.cwd || (t && propia) || carpetas[0] || '', ubicacion: o.cwd ? 'carpeta' : t ? 'worktree' : 'aparte',
      prompt: o.prompt || auto.prompt, nombre: o.nombre || auto.nombre, modelo: o.modelo || '',
    }
  })
  const [tarea, setTarea] = useState(inicio.tarea)
  const [auto, setAuto] = useState(inicio.auto)
  const [ubicacion, setUbicacion] = useState(inicio.ubicacion)
  const [cwd, setCwd] = useState(inicio.cwd)
  const [prompt, setPrompt] = useState(inicio.prompt)
  const [nombre, setNombre] = useState(inicio.nombre)
  const [modelo, setModelo] = useState(inicio.modelo)
  const [donde, setDonde] = useState('fondo')
  const [permiso, setPermiso] = useState('auto')
  const [estado, setEstado] = useState('')
  const [enviando, setEnviando] = useState(false)
  const cajaPrompt = useRef<HTMLTextAreaElement>(null)
  const columna = useRef<HTMLElement>(null)

  const t = d.tareas.find((x) => x.id === tarea) ?? null
  const propia = propiaDe(tarea, carpetas)
  const opciones = opcionesUbicacion(tarea, propia)
  // Cambiar de tarea o de ubicación: si la ubicación ya no existe, la primera; en su worktree, la ruta de ese worktree.
  const ubicar = (nuevaTarea: string | null, modo: string) => {
    const ops = opcionesUbicacion(nuevaTarea, propiaDe(nuevaTarea, carpetas))
    const m = ops.some(([v]) => v === modo) ? modo : ops[0][0]
    setUbicacion(m)
    const suya = propiaDe(nuevaTarea, carpetas)
    if (m === 'worktree' && suya) setCwd(suya)
  }
  const elegir = (x: Tarea) => {
    setTarea(x.id)
    // Se rellenan indicación y nombre mientras no los hayas cambiado tú.
    const a = autoDe(x)
    if (!prompt || prompt === auto.prompt) setPrompt(a.prompt)
    if (!nombre || nombre === auto.nombre) setNombre(a.nombre)
    setAuto(a)
    ubicar(x.id, ubicacion)
  }
  const quitar = () => { setTarea(null); ubicar(null, ubicacion) }

  const empezar = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setEnviando(true)
    setEstado('Arrancando…')
    try {
      const r = await post<Respuesta>('/api/sesiones/nueva', { cwd: cwd.trim(), prompt, nombre, permiso, tarea_id: tarea, donde, modelo, ubicacion }) ?? {}
      const lugar = r.worktree?.creado ? `Worktree nuevo en ${r.cwd}${r.worktree.rama ? ` (rama ${r.worktree.rama})` : ` (desde ${r.worktree.base})`}. `
        : r.cwd ? `Trabaja en ${r.cwd}. ` : ''
      let texto = lugar + (r.terminal ? 'Se abrió en una terminal nueva; aparece en la oficina en cuanto arranque.'
        : r.confianza ? 'Claude Code aún no confía en esa carpeta: se abrió su terminal para que aceptes el aviso; después aparece en el Taller.'
          : 'Sesión iniciada; aparece en el Taller en unos segundos.')
      setEstado(texto)
      // Traspaso: con la nueva ya arrancada, la anterior se cierra sola (su conversación queda guardada).
      if (o.cerrar && d.vivas?.[o.cerrar]) {
        try { await post(`/api/sesiones/${encodeURIComponent(o.cerrar)}/cerrar`); texto += ' La sesión anterior se cerró.' }
        catch (err) { texto += ` No pude cerrar la anterior: ${(err as Error).message}` }
        setEstado(texto)
      }
      setTimeout(cerrarVentana, 1800)
    } catch (err) {
      setEstado((err as Error).message)
      setEnviando(false)
    }
  }

  return (
    <Ventana alCerrar={cerrarVentana} id="v-nueva"
      enfocar={() => (o.prompt ? cajaPrompt.current : !t ? columna.current?.querySelector<HTMLInputElement>('[data-buscar-tarea]') : null)}>
      <header><div className="titulos"><Titulo>Nueva sesión</Titulo>
        <Descripcion>Para una tarea de ClickUp o para cualquier otra cosa (un traspaso, una investigación): la tarea es opcional.</Descripcion></div>
        <Cerrar etiqueta="Cerrar ventana" /></header>
      <div className="cuerpo"><form className="dos-col" onSubmit={empezar}>
        <section aria-labelledby="vs-tareas-t" ref={columna}><h3 id="vs-tareas-t" style={{ marginTop: 0 }}>Tarea (opcional)</h3>
          <SelectorTarea datos={d} seleccionada={tarea} alElegir={elegir} /></section>
        <div className="contexto">
          <section className="bloque" aria-live="polite">
            {t ? <><div className="fila"><h4 style={{ marginRight: 'auto' }}>Tarea elegida</h4>
              <button className="boton-chico" type="button" onClick={quitar}>Quitar</button></div><ResumenTarea t={t} /></>
              : <><h4>Sin tarea</h4><p className="meta" style={{ margin: 0 }}>Elige una a la izquierda para ligarla desde el inicio, o empieza sin tarea.</p></>}
          </section>
          <label className="campo"><span>Dónde trabaja</span>
            <select value={ubicacion} onChange={(e) => ubicar(tarea, e.target.value)}>{opciones.map(([v, txt]) => <option key={v} value={v}>{txt}</option>)}</select></label>
          <label className="campo" hidden={ubicacion === 'aparte'}><span>{ubicacion === 'worktree' ? 'Repositorio de la tarea' : 'Carpeta'}</span>
            <input type="text" list="vs-carpetas" autoComplete="off" placeholder="/home/…/mi-proyecto" required={ubicacion !== 'aparte'}
              value={cwd} onChange={(e) => setCwd(e.target.value)} />
            <datalist id="vs-carpetas">{carpetas.map((c) => <option key={c} value={c} />)}</datalist>
            <span className="meta">{ubicacion === 'worktree'
              ? (propia ? `Usará ${propia}.` : 'Se crea en <repo>.worktrees/<ID>, como en el turno nocturno, con los enlaces al arnés.') : ''}</span></label>
          <label className="campo"><span>Indicación</span>
            <textarea ref={cajaPrompt} rows={4} required maxLength={4000} placeholder="Por ejemplo: /agil k7p2tfedr, o lo que quieres que haga"
              value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
          <label className="campo"><span>Nombre (como aparece en la oficina)</span><input type="text" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
          <label className="campo"><span>Dónde se abre</span><select value={donde} onChange={(e) => setDonde(e.target.value)}>
            <option value="fondo">En segundo plano: aparece en la oficina y la abres en terminal cuando quieras</option>
            <option value="terminal">En una terminal nueva: interactiva; sirve si la carpeta aún no es de confianza</option></select></label>
          <label className="campo"><span>Modelo</span><select value={modelo} onChange={(e) => setModelo(e.target.value)}>
            <option value="">Predeterminado de Claude Code</option>
            <option value="claude-opus-5-5">Opus 5.5: el más capaz, para planear y tareas difíciles</option>
            <option value="claude-sonnet-5-5">Sonnet 5.5: rápido y capaz, para la mayoría del código</option>
            <option value="claude-haiku-5-5">Haiku 5.5: el más rápido y barato, para cosas chicas</option>
            <option value="claude-fable-5-1">Fable 5.1</option></select></label>
          <label className="campo"><span>Permisos</span><select value={permiso} onChange={(e) => setPermiso(e.target.value)}>
            <option value="auto">Auto: decide solo lo seguro (recomendado)</option>
            <option value="acceptEdits">Aceptar ediciones: pregunta antes de correr comandos</option>
            <option value="manual">Manual: pregunta todo</option></select></label>
          <div className="fila"><button className="primario" type="submit" disabled={enviando}>Empezar sesión</button><span className="meta" role="status">{estado}</span></div>
        </div>
      </form></div>
    </Ventana>
  )
}
