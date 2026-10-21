// Entra a tu oficina: una vez por navegador (30 días). Sin esto, nada actúa en tu nombre.
import { useRef, useState } from 'react'
import { Cerrar, Descripcion, Titulo, Ventana } from '@/components/ventana'
import type { Yo } from '@/lib/tipos'

export function Entrar({ yo, alCerrar, alEntrar }: { yo: Yo; alCerrar: () => void; alEntrar: () => void }) {
  const [estado, setEstado] = useState(yo.frase ? '' : 'Aún no tienes frase. En tu terminal corre: ~/Proyectos/Oficina-virtual/scripts/poner-frase.sh')
  const caja = useRef<HTMLInputElement>(null)
  const entrar = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const r = await fetch('/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frase: caja.current!.value }) })
    caja.current!.value = ''
    if (r.ok) { alEntrar(); return }
    setEstado((await r.json().catch(() => ({}))).error ?? `Error ${r.status}`)
  }
  return (
    <Ventana alCerrar={alCerrar} id="v-entrar" style={{ maxWidth: 440 }} enfocar={() => caja.current}>
      <header><div className="titulos"><Titulo>Entra a tu oficina</Titulo>
        <Descripcion>Una vez en este navegador; dura 30 días. Así ningún agente puede aprobar ni teclear en tu nombre.</Descripcion></div>
        <Cerrar /></header>
      <div className="cuerpo">
        <form onSubmit={entrar} style={{ display: 'grid', gap: 8 }}>
          <label htmlFor="ve-frase">Tu frase</label>
          <input id="ve-frase" ref={caja} type="password" autoComplete="current-password" required />
          <div className="fila"><button className="primario" type="submit">Entrar</button><span className="meta" role="status">{estado}</span></div>
        </form>
      </div>
    </Ventana>
  )
}
