import { useEffect, useRef } from 'react'
import type { Datos } from '@/lib/tipos'
import { montarEscena, type Acciones } from './escena'

export function Escena({ datos, acciones }: { datos: Datos | null; acciones: Acciones }) {
  const lienzo = useRef<SVGSVGElement>(null)
  const escena = useRef<HTMLDivElement>(null)
  const capa = useRef<HTMLDivElement>(null)
  const montada = useRef<ReturnType<typeof montarEscena>>(null)
  const ultimas = useRef(acciones)
  ultimas.current = acciones

  useEffect(() => {
    const m = montarEscena(lienzo.current!, escena.current!, capa.current!, {
      abrirAgente: (id) => ultimas.current.abrirAgente(id),
      abrirOficina: (s) => ultimas.current.abrirOficina(s),
      abrirPizarra: () => ultimas.current.abrirPizarra(),
    })
    montada.current = m
    return () => { m.destruir(); montada.current = null }
  }, [])
  // Solo en desarrollo: /?demo=20 (y &ciclo=5) sustituye los datos reales por sesiones falsas (demo.ts).
  const demo = import.meta.env.DEV ? new URLSearchParams(location.search) : null
  const nDemo = Number(demo?.get('demo')), ciclo = Number(demo?.get('ciclo'))
  useEffect(() => {
    if (!import.meta.env.DEV || !nDemo) return
    let vuelta = 0, parar = false, reloj = 0
    void import('./demo').then(({ datosDemo }) => {
      if (parar) return
      const poner = () => montada.current?.actualizar(datosDemo(nDemo, vuelta++))
      poner()
      if (ciclo) reloj = window.setInterval(poner, ciclo * 1000)
    })
    return () => { parar = true; clearInterval(reloj) }
  }, [nDemo, ciclo])
  useEffect(() => { if (datos && !nDemo) montada.current?.actualizar(datos) }, [datos, nDemo])

  return (
    <div className="escenario">
      <div className="escena" ref={escena} role="region" aria-label="Oficina: cada agente está en el cuarto de su estado">
        <svg ref={lienzo} viewBox="0 0 480 272" aria-hidden="true"><g id="fondo" /><g id="actores" /><g id="efectos" /></svg>
        <div className="capa" ref={capa} />
      </div>
    </div>
  )
}
