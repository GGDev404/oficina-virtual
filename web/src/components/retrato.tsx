// Retrato de un personaje: la misma tira de sprites que la escena (Armería, ficha), animada en la GPU; con movimiento
// reducido queda en el primer cuadro, la postura de su pose.
import { useLayoutEffect, useRef } from 'react'
import { figura, type Figura } from '@/escena/hornear'
import { actorDe, tiraPersonaje, type Actor } from '@/escena/personajes'
import type { Aspecto, Pose } from '@/escena/sprites'
import { useTema } from '@/lib/tema'

export function Retrato({ aspecto, pose = 'parado', tam = 96, etiqueta, actor }: { aspecto: Aspecto; pose?: Pose; tam?: number; etiqueta?: string; actor?: Actor }) {
  const caja = useRef<HTMLSpanElement>(null)
  const fig = useRef<Figura>(null)
  const tema = useTema()
  const quien = actor ?? actorDe(null, aspecto.rol)
  const clave = JSON.stringify(aspecto) // el aspecto llega como objeto nuevo en cada render: se compara por valor
  useLayoutEffect(() => {
    if (!fig.current) { fig.current = figura(); caja.current!.append(fig.current.el) }
    fig.current.poner(tiraPersonaje(JSON.parse(clave) as Aspecto, tema, quien, pose))
  }, [clave, tema, quien, pose])
  // 26 × 32,5 px lógicos alrededor del personaje (pies a 31 px del borde de arriba), como el retrato de antes.
  return <span ref={caja} className="retrato" style={{ width: tam, height: tam * 1.25, '--e': tam / 26 } as React.CSSProperties}
    role={etiqueta ? 'img' : undefined} aria-label={etiqueta} aria-hidden={etiqueta ? undefined : true} />
}
