// Tarjetas de resumen debajo de la escena: un ítem cada una; cada una abre solo lo suyo.
import { useOficina } from '@/components/contexto'
import { Icono, type NombreIcono } from '@/components/icono'
import { ESTADOS, colaUrgente, gb, nombreSesion, pendientesParaMi, proximoCorte, veredicto } from '@/lib/oficina'

export const NIVEL_MEM = { bien: ['Memoria bien', 'verde', 'bien'], alto: ['Memoria alta', 'naranja', 'aviso'], critico: ['Memoria casi agotada', 'rojo', 'alerta'] } as const

function Tarjeta({ icon, tono = '', titulo, detalle, accion }: { icon: NombreIcono; tono?: string; titulo: string; detalle: string; accion: () => void }) {
  return (
    <button className={`tarjeta ${tono}`} type="button" aria-haspopup="dialog" onClick={accion}>
      <span className="icono-t"><Icono n={icon} /></span>
      <span style={{ minWidth: 0 }}><b>{titulo}</b><span className="detalle" title={detalle}>{detalle}</span></span>
      <Icono n="flecha" />
    </button>
  )
}

export function Tarjetas() {
  const { datos: d, tareas, mem, abrirNecesitan, abrirOficina } = useOficina()
  const cola = colaUrgente(d)
  const v = veredicto(d)
  const paraMi = pendientesParaMi(d).sort((a, b) => b.ts - a.ts)
  const c = proximoCorte()
  const p = d.pendientes
  const pend = p.sesiones.length + p.notas.length + p.solicitudes.length
  const pausados = mem?.sesiones.filter((s) => s.pausada).length ?? 0
  return (
    <nav className="tarjetas" aria-label="Resumen">
      <Tarjeta icon="campana" tono={cola.some((s) => s.estado === 'necesita_permiso' || s.estado === 'bloqueado') ? 'alerta' : cola.length ? 'aviso' : 'bien'}
        titulo={cola.length ? `Te necesitan · ${cola.length}` : 'Nadie te espera'}
        detalle={cola.length ? `${nombreSesion(cola[0], tareas)}: ${ESTADOS[cola[0].estado][0].toLowerCase()}` : 'Los agentes siguen trabajando solos'}
        accion={abrirNecesitan} />
      <Tarjeta icon="arroba" tono={paraMi.some((x) => x.tipo === 'correccion') ? 'aviso' : ''} titulo={paraMi.length ? `Para ti · ${paraMi.length}` : 'Nada para ti'}
        detalle={paraMi[0] ? `${paraMi[0].autor.split(' ')[0]}: ${paraMi[0].texto.split('\n')[0]}` : 'Sin comentarios dirigidos a ti'} accion={() => abrirOficina('parati')} />
      {/* Una sola tarjeta para «Tu día»: el próximo corte y lo que vence hoy. */}
      <Tarjeta icon="calendario" tono={({ rojo: 'alerta', naranja: 'aviso', verde: '' } as Record<string, string>)[v.color]}
        titulo={c ? `${c.nombre} · ${c.hora}` : 'Sin cortes por hoy'}
        detalle={[c && `En ${c.faltan >= 60 ? `${Math.floor(c.faltan / 60)} h ` : ''}${c.faltan % 60} min`, v.vencidas.length || v.hoy.length ? v.texto.split(' · ')[0] : 'Al día'].filter(Boolean).join(' · ')}
        accion={() => abrirOficina('agenda')} />
      <Tarjeta icon="listo" tono={p.sesiones.length || p.solicitudes.length ? 'aviso' : ''} titulo={pend ? `Pendientes · ${pend}` : 'Sin pendientes'}
        detalle={p.solicitudes.length ? `${p.solicitudes.length} sesiones por aprobar`
          : p.sesiones.length ? `${p.sesiones.length} sesiones por retomar` : p.notas[0]?.texto ?? 'Nada por retomar'}
        accion={() => abrirOficina('pendientes')} />
      {mem && <Tarjeta icon="hora" tono={NIVEL_MEM[mem.nivel][2] === 'bien' ? '' : NIVEL_MEM[mem.nivel][2]} titulo={NIVEL_MEM[mem.nivel][0]}
        detalle={`${gb(mem.disponible)} libres · swap ${Math.round(100 - (100 * mem.swapLibre) / (mem.swapTotal || 1))} %${pausados ? ` · ${pausados} pausados` : ''}`}
        accion={() => abrirOficina('memoria')} />}
    </nav>
  )
}
