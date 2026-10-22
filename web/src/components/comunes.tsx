import { useEffect, useState, type ReactNode } from 'react'
import { ESTADOS, PRIORIDAD, cuandoVence, partesTarea } from '@/lib/oficina'
import type { Tarea } from '@/lib/tipos'

export const Chip = ({ color = '', className = '', children }: { color?: string; className?: string; children: ReactNode }) =>
  <span className={`chip ${color} ${className}`}>{children}</span>
export const ChipEstado = ({ estado }: { estado: string }) => { const [t, c] = ESTADOS[estado] ?? [estado, '']; return <Chip color={c}>{t}</Chip> }
export const ChipPrioridad = ({ p }: { p: string | null }) => { if (!p) return null; const [t, c] = PRIORIDAD[p] ?? [p, '']; return <Chip color={c}>{t}</Chip> }

export const Enlace = ({ href, className, style, children }: { href: string; className?: string; style?: React.CSSProperties; children: ReactNode }) =>
  <a href={href} target="_blank" rel="noopener" className={className} style={style}>{children}</a>

export function NombreTarea({ t }: { t: Tarea }) {
  const { codigo, titulo } = partesTarea(t.nombre)
  return <>{codigo && <span className="codigo">{codigo}</span>}<span>{titulo}</span></>
}

export function ResumenTarea({ t }: { t: Tarea }) {
  const [cuando, tono] = cuandoVence(t)
  return <>
    <Enlace href={t.url} className="negrita">{t.nombre}</Enlace>
    <div className="fila meta">
      <span className={`cuando negrita ${tono}`}>Vence {cuando}</span>
      <Chip>{t.estado ?? '—'}</Chip><ChipPrioridad p={t.prioridad} />{t.lista && <span>{t.lista}</span>}
    </div>
    {t.horario && <div className="ficha-tarea"><b>Horario: </b>{t.horario}</div>}
    {t.choque && <div className="ficha-tarea"><b>Choque: </b>{t.choque}</div>}
  </>
}

// Botón que se desactiva mientras su acción corre (evita doble clic) y vuelve a activarse al terminar.
export function BotonAccion({ accion, className = 'boton-chico', children }: { accion: () => Promise<unknown>; className?: string; children: ReactNode }) {
  const [ocupado, setOcupado] = useState(false)
  return <button type="button" className={className} disabled={ocupado}
    onClick={async () => { setOcupado(true); try { await accion() } finally { setOcupado(false) } }}>{children}</button>
}

// Cuenta regresiva hasta que un permiso o pregunta pasa a su terminal.
export function Cuenta({ vence }: { vence: number }) {
  const [, setTic] = useState(0)
  useEffect(() => { const t = setInterval(() => setTic((n) => n + 1), 1000); return () => clearInterval(t) }, [])
  const faltan = Math.max(0, Math.round((vence - Date.now()) / 1000))
  return <b>{faltan ? `${Math.floor(faltan / 60)}:${String(faltan % 60).padStart(2, '0')}` : 'su terminal'}</b>
}
