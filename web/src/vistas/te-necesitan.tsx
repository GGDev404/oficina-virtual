// Te necesitan: cola de agentes que esperan algo de ti, el más urgente primero.
import { ChipEstado } from '@/components/comunes'
import { useOficina } from '@/components/contexto'
import { Icono } from '@/components/icono'
import { Cerrar, Descripcion, Titulo, Ventana } from '@/components/ventana'
import { postSeguro, rutaSesion } from '@/lib/api'
import { carpeta, colaUrgente, hace, nombreSesion, permisoPendiente, plano } from '@/lib/oficina'
import { DecisionPermiso } from './permisos'

export function TeNecesitan() {
  const { datos: d, tareas, abrirAgente, cerrarVentana } = useOficina()
  const cola = colaUrgente(d)
  return (
    <Ventana alCerrar={cerrarVentana} id="v-necesitan">
      <header><div className="titulos"><Titulo>Te necesitan</Titulo><Descripcion>Agentes que esperan algo de ti, el más urgente primero.</Descripcion></div>
        <Cerrar /></header>
      <div className="cuerpo"><ul>
        {cola.length ? cola.map((s) => {
          const p = permisoPendiente(d, s.id)
          return (
            <li className="comentario" key={s.id}>
              <div className="fila"><ChipEstado estado={s.estado} /><b>{nombreSesion(s, tareas)}</b><span className="meta">lleva {hace(s.estado_desde_ts).replace('hace ', '')}</span></div>
              {s.tarea_id && s.nombre && <div className="meta corto">{tareas[s.tarea_id]?.nombre ?? s.tarea_id}</div>}
              {s.ultimo_mensaje && <div className="mensaje corto3">{plano(s.ultimo_mensaje)}</div>}
              <div className="fila">
                {s.estado === 'necesita_permiso' && p ? <DecisionPermiso key={p.id} p={p} compacto />
                  : s.estado === 'necesita_permiso' ? (s.tmux
                    ? <button className="primario boton-chico" type="button" onClick={() => abrirAgente(s.id)}>Ver el diálogo y contestar</button>
                    : d.vivas?.[s.id]?.tipo === 'background'
                      ? <button className="primario boton-chico" type="button" onClick={() => postSeguro(rutaSesion(s.id, 'terminal'))}><Icono n="terminal" />Abrir su terminal para aprobar</button>
                      : <span className="aviso-caja rojo chico">Apruébalo en su terminal o en la app · {carpeta(s.cwd)}</span>)
                    : <button className="primario boton-chico" type="button" onClick={() => abrirAgente(s.id, { escribir: true })}>Responder</button>}
                <button className="boton-chico" type="button" onClick={() => abrirAgente(s.id)}>Ver ficha</button>
              </div>
            </li>
          )
        }) : <li className="vacio">Ningún agente te espera.</li>}
      </ul></div>
    </Ventana>
  )
}
