import { useEffect, useRef } from 'react'
import type { Datos } from '@/lib/tipos'
import { montarEscena, type Acciones } from './escena'

export function Escena({ datos, acciones }: { datos: Datos | null; acciones: Acciones }) {
  const lienzo = useRef<HTMLCanvasElement>(null)
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
  useEffect(() => { if (datos) montada.current?.actualizar(datos) }, [datos])

  return (
    <div className="escenario">
      <div className="escena" ref={escena} role="region" aria-label="Oficina: cada agente está en el cuarto de su estado">
        <canvas ref={lienzo} width={480} height={272} aria-hidden="true" />
        <div className="capa" ref={capa} />
      </div>
    </div>
  )
}
