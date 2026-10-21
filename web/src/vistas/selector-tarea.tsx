// Selector de tareas: busca por nombre o ID, agrupa por cuándo vence y muestra lo que importa para elegir.
import { useState } from 'react'
import { Chip, ChipPrioridad } from '@/components/comunes'
import { GRUPOS, VIVOS, cuandoVence, grupoDe } from '@/lib/oficina'
import type { Datos, Tarea } from '@/lib/tipos'

export function SelectorTarea({ datos, seleccionada = null, alElegir, autoFocus = false }: {
  datos: Datos; seleccionada?: string | null; alElegir: (t: Tarea) => void; autoFocus?: boolean
}) {
  const [busqueda, setBusqueda] = useState('')
  const q = busqueda.trim().toLowerCase()
  const ts = datos.tareas.filter((t) => !q || t.nombre.toLowerCase().includes(q) || t.id.includes(q))
    .sort((a, b) => (a.due_ts ?? Infinity) - (b.due_ts ?? Infinity))
  const porGrupo = Object.groupBy(ts, (t) => grupoDe(t))
  const opcion = (t: Tarea) => {
    const ses = datos.sesiones.filter((x) => x.tarea_id === t.id && VIVOS.has(x.estado))
    const [cuando, tono] = cuandoVence(t)
    return (
      <button type="button" className="opcion" aria-pressed={t.id === seleccionada} onClick={() => alElegir(t)} key={t.id}>
        <span className="fila" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 12 }}>
          <span className="nombre">{t.nombre}</span><span className={`meta cuando ${tono}`}>{cuando}</span>
        </span>
        <span className="fila meta">
          <span>{t.id}</span><Chip>{t.estado ?? '—'}</Chip><ChipPrioridad p={t.prioridad} />{t.lista && <span>{t.lista}</span>}
          {ses.length > 0 && <Chip color="verde">{ses.length > 1 ? `${ses.length} agentes en ella` : 'un agente en ella'}</Chip>}
        </span>
        {t.horario && <span className="ficha-tarea"><b>Horario: </b>{t.horario}</span>}
      </button>
    )
  }
  return (
    <div className="selector">
      <input type="search" placeholder="Buscar por nombre o ID" aria-label="Buscar tarea" autoComplete="off" autoFocus={autoFocus}
        value={busqueda} onChange={(e) => setBusqueda(e.target.value)} data-buscar-tarea="" />
      <div className="opciones">
        {ts.length ? GRUPOS.filter((g) => porGrupo[g]).flatMap((g) => [
          <div className="grupo-titulo" key={`g-${g}`}>{g} · {porGrupo[g]!.length}</div>, ...porGrupo[g]!.map(opcion)])
          : <p className="vacio">{q ? 'Ninguna tarea coincide.' : 'No hay tareas abiertas sincronizadas.'}</p>}
      </div>
    </div>
  )
}
