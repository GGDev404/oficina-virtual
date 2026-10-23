// Pizarra: una tarjeta por worktree con lo hecho, lo que sigue y quién trabaja ahí (sesiones, subagentes y turno nocturno).
// El avance sale del plan de la tarea, que comparten todos los que la trabajan; los commits y la noche lo completan.
import { useState } from 'react'
import { Chip } from '@/components/comunes'
import { useOficina } from '@/components/contexto'
import { DIA, columnaDe, enWorktree, hace, nombreSesion, type Columna } from '@/lib/oficina'
import type { Sesion, Worktree } from '@/lib/tipos'

const COLUMNAS = [['falta', 'Falta'], ['progreso', 'En progreso'], ['revisar', 'Para revisar']] as const
const VIEJO = 14 * DIA

export function PizarraVista() {
  const { datos: d } = useOficina()
  const [viejos, setViejos] = useState(false)
  const todos = (d.worktrees ?? []).map((w) => ({ w, ...enWorktree(w, d) }))
    // Sin plan, sin commits, sin cambios, sin noche y sin nadie: un worktree vacío (develop, main, pruebas).
    .filter(({ w, sesiones }) => w.pasos.length || w.commits || w.sin_commit || w.noche || sesiones.length)
  const quieto = ({ w, sesiones }: typeof todos[number]) => !sesiones.length && !w.noche?.corriendo && !w.sin_commit
    && Date.now() - Math.max(w.ultimo_ts ?? 0, Date.parse(w.noche?.fecha ?? '') || 0) > VIEJO
  const nViejos = todos.filter(quieto).length
  const visibles = viejos ? todos : todos.filter((x) => !quieto(x))
  if (!todos.length) return <p className="vacio">No hay worktrees con trabajo en los repos donde trabajan tus sesiones.</p>
  return (
    <div className="pila-media">
      {nViejos > 0 && <label className="fila meta"><input type="checkbox" checked={viejos} onChange={(e) => setViejos(e.target.checked)} />
        Mostrar {nViejos} sin movimiento en 14 días</label>}
      <div className="pz-columnas">
        {COLUMNAS.map(([id, titulo]) => {
          const col = visibles.filter((x) => columnaDe(x.w, x.sesiones) === id)
          return (
            <section key={id} className={`pz-columna ${id}`} aria-labelledby={`pz-${id}`}>
              <h3 id={`pz-${id}`} className="fila">{titulo}<span className="cuenta">{col.length}</span></h3>
              {col.length ? <ul className="pila-chica">{col.map((x) => <Tarjeta key={x.w.ruta} {...x} columna={id} />)}</ul>
                : <p className="vacio">Nada aquí.</p>}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Tarjeta({ w, sesiones, subagentes, columna }: { w: Worktree; sesiones: Sesion[]; subagentes: number; columna: Columna }) {
  const { tareas, abrirAgente } = useOficina()
  const t = tareas[w.id]
  const hechos = w.pasos.filter((p) => p.estado === 'hecho').length
  const sigue = w.pasos.find((p) => p.estado === 'progreso') ?? w.pasos.find((p) => p.estado === 'falta')
  const pct = w.pasos.length ? Math.round((100 * hechos) / w.pasos.length) : null
  return (
    <li className="pz-nota">
      <b>{t?.nombre ?? w.titulo ?? w.nombre}</b>
      <span className="meta una-linea" title={w.ruta}>{w.id !== w.nombre ? `${w.id} · ` : ''}{w.repo} · {w.rama ?? 'sin rama'}</span>
      {pct != null && <div className="fila">
        <div className="medidor nivel crece" role="meter" aria-label="Pasos del plan hechos" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
        <span className="meta">{hechos}/{w.pasos.length}</span></div>}
      {sigue && columna !== 'revisar' && <span className="pz-sigue">{sigue.estado === 'progreso' ? 'En curso' : 'Sigue'}: {sigue.texto}</span>}
      {w.pasos.length > 0 && <details><summary>Pasos del plan</summary>
        <ul className="pz-pasos">{w.pasos.map((p, i) => <li key={i} className={p.estado}>{p.texto}</li>)}</ul></details>}
      {(sesiones.length > 0 || w.noche) && <div className="fila">
        {sesiones.map((s) => <button key={s.id} className="enlace" type="button" onClick={() => abrirAgente(s.id)}>{nombreSesion(s, tareas)}</button>)}
        {subagentes > 0 && <Chip color="azul-suave">+{subagentes} subagentes</Chip>}
        {w.noche?.corriendo && <Chip color="azul-suave">Turno nocturno trabajando</Chip>}
      </div>}
      {w.noche && !w.noche.corriendo && w.noche.estado && <span className="meta corto3" title={w.noche.reporte ?? ''}>
        <b>Noche {w.noche.fecha.slice(5)}:</b> {w.noche.estado}</span>}
      <span className="meta">
        {w.commits ? `${w.commits} commits · ${hace(w.ultimo_ts)}` : 'Sin commits'}
        {w.sin_commit ? ` · ${w.sin_commit} archivos sin commit` : ''}
      </span>
      {w.ultimos[0] && <span className="meta una-linea" title={w.ultimos.map((c) => c.texto).join('\n')}>Último: {w.ultimos[0].texto}</span>}
      {t?.estado && <div className="fila"><Chip>{t.estado}</Chip></div>}
    </li>
  )
}
