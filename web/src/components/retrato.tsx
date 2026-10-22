// Retrato de un personaje: el mismo rig vectorial de la escena (Armería, ficha). Se anima con CSS (oficina.css, .pj);
// con movimiento reducido queda quieto en la postura de su pose.
import { useLayoutEffect, useRef } from 'react'
import { actorDe, clasePose, construirPersonaje, type Actor, type Vista } from '@/escena/personajes'
import type { Aspecto, Pose } from '@/escena/sprites'
import { useTema } from '@/lib/tema'

const SENTADO = new Set<Pose>(['teclea', 'espera']) // de espaldas, frente al monitor

export function Retrato({ aspecto, pose = 'parado', tam = 96, etiqueta, actor }: { aspecto: Aspecto; pose?: Pose; tam?: number; etiqueta?: string; actor?: Actor }) {
  const svg = useRef<SVGSVGElement>(null)
  const tema = useTema()
  const quien = actor ?? actorDe(null, aspecto.rol)
  const vista: Vista = SENTADO.has(pose) ? 'espalda' : 'frente'
  const clave = JSON.stringify(aspecto) // el aspecto llega como objeto nuevo en cada render: se compara por valor
  // El rig se reconstruye solo si cambia quién es, el tema o la vista; cambiar de pose es cambiar su clase.
  useLayoutEffect(() => {
    const rig = construirPersonaje({ aspecto: JSON.parse(clave) as Aspecto, vista }, tema, quien)
    rig.setAttribute('class', clasePose(pose))
    svg.current!.replaceChildren(rig)
  }, [clave, vista, tema, quien]) // pose va en su propio efecto
  useLayoutEffect(() => { svg.current!.firstElementChild?.setAttribute('class', clasePose(pose)) }, [pose, clave, vista, tema, quien])
  return <svg ref={svg} viewBox="-13 -31 26 32.5" width={tam} height={tam * 1.25} className="retrato"
    role={etiqueta ? 'img' : undefined} aria-label={etiqueta} aria-hidden={etiqueta ? undefined : true} />
}
