// Encargos a roles y actividad entre sesiones: panel de la ficha, pestaña «Roles» de Tu día y sesión fija de un rol.
import { useEffect, useState } from 'react'
import { Chip } from '@/components/comunes'
import { useOficina } from '@/components/contexto'
import { leer, post } from '@/lib/api'
import { Markdown } from '@/lib/markdown'
import { carpeta, encargosDe, hace, horaDe, nombreSesion, plano, tituloRol } from '@/lib/oficina'
import type { Datos, Encargo, EntreSesiones, Sesion } from '@/lib/tipos'

const ESTADO_ENCARGO: Record<Encargo['estado'], [string, string]> = {
  arrancando: ['Arrancando', 'naranja'], entregando: ['Entregando', 'naranja'], entregado: ['Entregado', 'azul-suave'], respondido: ['Respondido', 'verde'], error: ['Error', 'rojo'],
}
const VIA: Record<string, string> = { tmux: 'por tmux', mensajero: 'por bandeja', nueva: 'sesión nueva' }
const TIPO: Record<EntreSesiones['tipo'], string> = { mensaje: 'mensaje', encargo: 'encargo', entrega: 'entrega', duda: 'duda', respuesta: 'respuesta' }
const COLOR_TIPO: Record<EntreSesiones['tipo'], string> = { mensaje: '', encargo: 'naranja', entrega: 'verde', duda: 'rojo', respuesta: '' }

const useQuien = (d: Datos, tareas: Record<string, import('@/lib/tipos').Tarea>) => (sid: string | null, respaldo = 'Oficina') => {
  const s = sid ? d.sesiones.find((x) => x.id === sid) : null
  return s ? nombreSesion(s, tareas) : sid ? sid.slice(0, 8) : respaldo
}

// Últimos mensajes, encargos y entregas entre sesiones: quién → quién, tipo, hora y texto truncado (completo en el title).
export function ActividadEntre({ sid, max = 8 }: { sid?: string; max?: number }) {
  const { datos: d, tareas } = useOficina()
  const quien = useQuien(d, tareas)
  const filas = (d.entre_sesiones ?? []).filter((f) => !sid || f.de_sesion === sid || f.a_sesion === sid).slice(-max).reverse()
  if (!filas.length) return <p className="vacio">Aún no hay mensajes entre sesiones.</p>
  return <ul className="lista-simple" aria-label="Actividad entre sesiones">{filas.map((f) => (
    <li key={f.id} title={f.texto}>
      <div className="fila sin-corte"><b className="corto corto-1">{quien(f.de_sesion, f.de ?? 'Oficina')} → {quien(f.a_sesion)}</b>
        <Chip color={COLOR_TIPO[f.tipo]}>{TIPO[f.tipo]}</Chip><span className="meta">{horaDe(f.ts)}</span></div>
      <div className="meta una-linea">{plano(f.texto)}</div>
    </li>
  ))}</ul>
}

function FilaEncargo({ e }: { e: Encargo }) {
  const { datos: d, tareas } = useOficina()
  const quien = useQuien(d, tareas)
  const [txt, color] = ESTADO_ENCARGO[e.estado]
  return (
    <div className="proc pila-chica relleno-chico">
      <div className="fila"><b>{tituloRol(d, e.rol)}</b><Chip color={color}>{txt}</Chip>
        {(e.mision || e.cadena) && <span className="chip azul-suave">misión #{e.mision ?? e.id}{e.intento ? ` · reintento ${e.intento}` : ''}</span>}{e.via && <span className="meta">{VIA[e.via] ?? e.via}</span>}
        <span className="meta">{hace(e.creado_ts)}</span></div>
      <div className="meta">{quien(e.de_sesion, 'Oficina')} → {e.a_sesion ? quien(e.a_sesion) : 'sesión del rol (arrancando)'}</div>
      <div className="corto3" title={e.texto}>{e.texto}</div>
      {e.estado === 'error' && e.detalle && <div className="aviso-caja rojo sin-margen" role="alert">{e.detalle}</div>}
      {e.resultado && <details><summary>Resultado</summary><Markdown texto={e.resultado} /></details>}
    </div>
  )
}

// Misiones: después del primer rol, la entrega pasa sola a los siguientes (server/encargos.js); si QA rechaza,
// vuelve una vez a implementación. Solo la entrega del último paso regresa a esta sesión.
const MISIONES: [string, string[]][] = [
  ['Solo este rol', []], ['→ Revisión y QA', ['revision-qa']], ['→ QA → Documentación', ['revision-qa', 'docs-entrega']],
  ['→ Implementación → QA → Documentación', ['implementacion', 'revision-qa', 'docs-entrega']],
]

// Encargo a un rol: la sesión fija del rol lo hace y su entrega vuelve a la sesión de origen.
function FormEncargo({ s }: { s: Sesion }) {
  const { datos: d } = useOficina()
  const [rol, setRol] = useState<string>('')
  const [texto, setTexto] = useState('')
  const [mision, setMision] = useState(0)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [enviando, setEnviando] = useState(false)
  const elegido = rol || d.roles?.[0]?.id || ''
  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!texto.trim() || !elegido) return
    setEnviando(true); setError(''); setOk('')
    try {
      await post(`/api/roles/${encodeURIComponent(elegido)}/encargo`, { texto: texto.trim(), de_sesion: s.id, cwd: s.cwd, cadena: MISIONES[mision][1].filter((r) => r !== elegido) })
      setTexto(''); setOk('Encargo enviado; su avance aparece arriba.')
    } catch (err) { setError((err as Error).message) } finally { setEnviando(false) }
  }
  if (!d.roles?.length) return null
  return (
    <form className="bloque" onSubmit={enviar} aria-label="Encargar a un rol">
      <h4>Encargar a un rol</h4>
      <label className="campo"><span>Rol</span>
        <select value={elegido} onChange={(e) => setRol(e.target.value)}>{d.roles.map((r) => <option key={r.id} value={r.id}>{r.titulo}</option>)}</select></label>
      <label className="campo"><span>Después (misión)</span>
        <select value={mision} onChange={(e) => setMision(Number(e.target.value))}>{MISIONES.map(([t], i) => <option key={t} value={i}>{t}</option>)}</select></label>
      <label className="campo"><span>Qué debe hacer</span>
        <textarea rows={3} maxLength={4000} required placeholder="Describe el encargo; su entrega vuelve a esta sesión." value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); ev.currentTarget.form?.requestSubmit() } }} /></label>
      <div className="fila"><button className="primario" type="submit" disabled={enviando || !texto.trim()}>{enviando ? 'Enviando…' : 'Encargar'}</button>
        <span className="meta" role="status">{ok}</span></div>
      {error && <div className="aviso-caja rojo sin-margen" role="alert">{error}</div>}
    </form>
  )
}

// Contenido de la pestaña «Encargos» de la ficha.
export function PanelEncargos({ s }: { s: Sesion }) {
  const { datos: d } = useOficina()
  const lista = encargosDe(d, s.id)
  return <div className="pila-media">
    {s.rol && <p className="meta sin-margen">Esta es la sesión fija del rol <b>{tituloRol(d, s.rol)}</b>.</p>}
    <FormEncargo s={s} />
    <section aria-label="Encargos de esta sesión" className="pila">
      <h4 className="subtitulo">Encargos</h4>
      {lista.length ? lista.map((e) => <FilaEncargo key={e.id} e={e} />) : <p className="vacio">Sin encargos en esta sesión.</p>}
    </section>
    <section aria-label="Actividad entre sesiones" className="pila-chica">
      <h4 className="subtitulo">Entre sesiones</h4>
      <ActividadEntre sid={s.id} max={6} />
    </section>
  </div>
}

// Abre (o reutiliza) la sesión fija de un rol en una carpeta, sin darle encargo.
export function AbrirRol({ carpetas }: { carpetas?: string[] }) {
  const { datos: d } = useOficina()
  const [lista, setLista] = useState<string[]>(carpetas ?? [])
  useEffect(() => { if (!carpetas) leer<string[]>('/api/carpetas').then(setLista, () => setLista([])) }, [carpetas])
  const [rol, setRol] = useState('')
  const [cwd, setCwd] = useState('')
  const [estado, setEstado] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const elegido = rol || d.roles?.[0]?.id || '', ruta = cwd || lista[0] || ''
  const abrir = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setEnviando(true); setError(''); setEstado('Abriendo…')
    try { await post(`/api/roles/${encodeURIComponent(elegido)}/sesion`, { cwd: ruta.trim() }); setEstado('Listo; aparece en la oficina en unos segundos.') }
    catch (err) { setEstado(''); setError((err as Error).message) } finally { setEnviando(false) }
  }
  if (!d.roles?.length) return <p className="vacio">El servidor no tiene roles definidos.</p>
  return (
    <form className="bloque" onSubmit={abrir} aria-label="Abrir sesión de un rol">
      <h4>Abrir la sesión de un rol</h4>
      <p className="meta sin-margen">Cada rol tiene una sesión fija por carpeta, sin encargo: queda lista para recibirlos.</p>
      <label className="campo"><span>Rol</span>
        <select value={elegido} onChange={(e) => setRol(e.target.value)}>{d.roles.map((r) => <option key={r.id} value={r.id}>{r.titulo}</option>)}</select></label>
      <label className="campo"><span>Carpeta</span>
        <input type="text" list="rol-carpetas" autoComplete="off" required placeholder="/home/…/mi-proyecto" value={ruta} onChange={(e) => setCwd(e.target.value)} />
        <datalist id="rol-carpetas">{lista.map((c) => <option key={c} value={c} label={carpeta(c)} />)}</datalist></label>
      <div className="fila"><button className="primario" type="submit" disabled={enviando || !ruta.trim()}>Abrir sesión del rol</button>
        <span className="meta" role="status">{estado}</span></div>
      {error && <div className="aviso-caja rojo sin-margen" role="alert">{error}</div>}
    </form>
  )
}

// Pestaña «Roles» de Tu día.
export function RolesVista() {
  const { datos: d } = useOficina()
  const vivas = d.sesiones.filter((s) => s.rol)
  return <div className="pila-grande">
    <AbrirRol />
    <section aria-labelledby="vr-fijas" className="pila-chica">
      <h3 id="vr-fijas" className="sin-margen">Sesiones de roles abiertas</h3>
      {vivas.length ? <ul className="lista-simple">{vivas.map((s) => <li key={s.id} className="fila"><b>{tituloRol(d, s.rol)}</b><span className="meta">{carpeta(s.cwd)}</span></li>)}</ul>
        : <p className="vacio">Ningún rol tiene sesión abierta.</p>}
    </section>
    <section aria-labelledby="vr-act" className="pila-chica">
      <h3 id="vr-act" className="sin-margen">Entre sesiones</h3>
      <ActividadEntre max={10} />
    </section>
  </div>
}
