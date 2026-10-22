// Retrato de un personaje con el mismo sprite de la escena (Armería, ficha). Se anima solo sin movimiento reducido.
import { useEffect, useRef } from 'react'
import { personaje, type Aspecto, type Pose } from '@/escena/sprites'

export function Retrato({ aspecto, pose = 'parado', tam = 96, etiqueta }: { aspecto: Aspecto; pose?: Pose; tam?: number; etiqueta?: string }) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = lienzo.current!.getContext('2d')!
    const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches
    const pintar = (f: number) => {
      ctx.clearRect(0, 0, 16, 20)
      personaje((x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h) }, 8, 18, aspecto, pose, f, { reducido })
    }
    pintar(0)
    if (reducido) return
    let f = 0
    const t = setInterval(() => pintar(++f), 250) // 4 cuadros por segundo, como la escena
    return () => clearInterval(t)
  }, [aspecto, pose])
  return <canvas ref={lienzo} width={16} height={20} className="retrato" style={{ width: tam, height: tam * 1.25 }}
    role={etiqueta ? 'img' : undefined} aria-label={etiqueta} aria-hidden={etiqueta ? undefined : true} />
}
