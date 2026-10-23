// Pizarra (ventana propia): una tarjeta por worktree que responde en este orden: en qué estado está, qué se hizo, qué falta y qué falta de ti.
// Arriba van las que te tocan a ti; el resto avanza sin ti. El avance sale del plan de la tarea, de los commits y del turno nocturno.
import { useState } from 'react'
import { Chip } from '@/components/comunes'
import { useOficina } from '@/components/contexto'
import { Icono, type NombreIcono } from '@/components/icono'
import { Cerrar, Descripcion, Titulo, Ventana } from '@/components/ventana'
import { hace, nombreSesion, plano, resumenPizarra, tareasPizarra, type ClavePz, type PedidoPz, type TareaPz } from '@/lib/oficina'
import type { Worktree } from '@/lib/tipos'

type Paso = Worktree['pasos'][number]
// Estado en una frase, con color (clase de tono) e icono: nunca solo color.
const ESTADO: Record<ClavePz, { icono: NombreIcono; tono: string; frase: string }> = {
  curso: { icono: 'curso', tono: 'azul', frase: 'En curso' },
  espera: { icono: 'campana', tono: 'naranja', frase: 'Parada · espera tu respuesta' },
  terminada: { icono: 'terminada', tono: 'verde', frase: 'Terminada · falta tu revisión' },
  aparcada: { icono: 'decidir', tono: 'naranja', frase: 'Aparcada · necesita tu decisión' },
  pausada: { icono: 'pausa', tono: 'gris', frase: 'Pausada · nadie trabaja ahora' },
  nueva: { icono: 'nueva', tono: 'gris', frase: 'Sin empezar' },
}
const ICONO_PEDIDO: Record<PedidoPz['tipo'], NombreIcono> = { sesion: 'campana', listo: 'ojo', revisar: 'ojo', decidir: 'decidir', commit: 'archivo' }

export function PizarraVentana() {
  const { datos: d, cerrarVentana } = useOficina()
  const [viejos, setViejos] = useState(false)
  const todas = tareasPizarra(d)
  const nViejos = todas.filter((x) => x.quieto).length
  const visibles = viejos ? todas : todas.filter((x) => !x.quieto)
  const tocan = visibles.filter((x) => x.pedidos.length)
  const resto = visibles.filter((x) => !x.pedidos.length)
  const r = resumenPizarra(d)
  return (
    <Ventana alCerrar={cerrarVentana} id="v-pizarra">
      <header className="vo-cabeza"><Titulo>Pizarra</Titulo>
        <Descripcion oculta>Tus tareas por worktree: en qué estado está cada una, qué se hizo, qué falta y qué falta de ti.</Descripcion>
        <div className="fila">
          <Chip color="azul-suave">{r.enCurso} en curso</Chip><Chip color="verde">{r.revisar} por revisar</Chip>
          <Chip color={r.tocan ? 'naranja' : ''}>{r.tocan} te tocan</Chip>
        </div>
        <Cerrar /></header>
      <div className="cuerpo pila-grande">
        {!visibles.length ? <p className="vacio">No hay worktrees con trabajo en los repos donde trabajan tus sesiones.</p> : <>
          <section aria-labelledby="pz-toca">
            <h3 id="pz-toca" className="pz-titulo-seccion"><Icono n="campana" />Te toca a ti · {tocan.length}</h3>
            {tocan.length ? <ul className="pz-rejilla">{tocan.map((x) => <Tarjeta key={x.w.ruta} x={x} />)}</ul>
              : <p className="pz-nada"><Icono n="terminada" />Nada te espera: todo avanza sin ti.</p>}
          </section>
          {resto.length > 0 && <section aria-labelledby="pz-resto">
            <h3 id="pz-resto" className="pz-titulo-seccion"><Icono n="curso" />Avanza sin ti · {resto.length}</h3>
            <ul className="pz-rejilla">{resto.map((x) => <Tarjeta key={x.w.ruta} x={x} />)}</ul>
          </section>}
        </>}
        {nViejos > 0 && <label className="fila meta"><input type="checkbox" checked={viejos} onChange={(e) => setViejos(e.target.checked)} />
          Mostrar {nViejos} sin movimiento en 14 días</label>}
      </div>
    </Ventana>
  )
}

function Pasos({ items, max, vacio }: { items: Paso[]; max: number; vacio: string }) {
  if (!items.length) return <p className="meta sin-margen">{vacio}</p>
  const lista = (l: Paso[]) => <ul className="pz-pasos">{l.map((p, i) => <li key={i} className={p.estado}><span className="corto" title={p.texto}>{plano(p.texto)}</span></li>)}</ul>
  return <>{lista(items.slice(0, max))}
    {items.length > max && <details><summary>y {items.length - max} más</summary>{lista(items.slice(max))}</details>}</>
}

function Tarjeta({ x }: { x: TareaPz }) {
  const { tareas, abrirAgente } = useOficina()
  const { w, sesiones, subagentes, clave, pedidos } = x
  const t = tareas[w.id]
  const e = ESTADO[clave]
  const hechos = w.pasos.filter((p) => p.estado === 'hecho')
  const faltan = [...w.pasos.filter((p) => p.estado === 'progreso'), ...w.pasos.filter((p) => p.estado === 'falta')]
  const sigue = faltan[0]
  const tono = pedidos[0]?.tono
  return (
    <li className="pz-tarjeta" data-tono={e.tono}>
      <div className="pz-estado"><Icono n={e.icono} />
        <b className="corto">{e.frase}{clave === 'curso' && sigue ? ` · ${sigue.texto}` : ''}</b></div>
      <div className="pz-cuerpo">
        <div className="pz-nombre"><b className="corto">{x.nombre}</b>
          <span className="meta una-linea" title={w.ruta}>{w.id !== w.nombre ? `${w.id} · ` : ''}{w.repo} · {w.rama ?? 'sin rama'}{t?.estado ? ` · ${t.estado}` : ''}</span></div>
        {(sesiones.length > 0 || w.noche?.corriendo) && <div className="fila">
          {sesiones.map((s) => <button key={s.id} className="enlace" type="button" onClick={() => abrirAgente(s.id)}>{nombreSesion(s, tareas)}</button>)}
          {subagentes > 0 && <Chip color="azul-suave">+{subagentes} subagentes</Chip>}
          {w.noche?.corriendo && <Chip color="azul-suave">Turno nocturno trabajando</Chip>}
        </div>}
        {w.pasos.length > 0 && <div className="pz-progreso">
          <div className="pz-linea" role="img" aria-label={`${hechos.length} de ${w.pasos.length} pasos hechos`}>
            {w.pasos.map((p, i) => <i key={i} className={p.estado} />)}</div>
          <span className="meta">{hechos.length}/{w.pasos.length}</span></div>}
        <div className="pz-cols">
          <section aria-label="Qué se hizo"><h4>Hecho</h4>
            {w.pasos.length ? <Pasos items={hechos.toReversed()} max={2} vacio="Ningún paso aún." /> : <p className="meta sin-margen">Sin plan de pasos.</p>}
            <p className="meta pz-commits"><Icono n="commit" />{w.commits ? <><b>{w.commits} {w.commits === 1 ? 'commit' : 'commits'}</b> · {hace(w.ultimo_ts)}</> : 'Sin commits'}</p>
            {w.ultimos[0] && <span className="meta una-linea" title={w.ultimos.map((c) => c.texto).join('\n')}>{w.ultimos[0].texto}</span>}
            {w.noche && !w.noche.corriendo && w.noche.estado && <span className="meta corto3" title={w.noche.reporte ?? ''}>
              <b>Noche {w.noche.fecha.slice(5)}:</b> {w.noche.estado}</span>}
          </section>
          {w.pasos.length > 0 && <section aria-label="Qué falta"><h4>Falta</h4>
            <Pasos items={faltan} max={3} vacio="Nada pendiente en el plan." />
          </section>}
        </div>
      </div>
      <div className="pz-ti" data-tono={tono}>
        <h4>Qué falta de ti</h4>
        {pedidos.length ? <ul className="pz-pedidos">{pedidos.map((p, i) => (
          <li key={i}><Icono n={ICONO_PEDIDO[p.tipo]} /><span className="crece">{p.texto}</span>
            {p.sid && <button className="boton-chico" type="button" onClick={() => abrirAgente(p.sid!)}>{p.tipo === 'sesion' ? 'Contestar' : 'Abrir sesión'}</button>}</li>
        ))}</ul> : <p className="pz-nada-ti"><Icono n="listo" />Nada de ti por ahora</p>}
      </div>
    </li>
  )
}
