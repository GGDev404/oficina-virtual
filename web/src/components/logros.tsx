// Avisos de logro (como los de Minecraft): una entrega de un rol o una subida de nivel. Arriba a la derecha, 5 s,
// anunciados al lector de pantalla sin robar el foco. Lo que ya había al abrir la página no se anuncia.
import { useEffect, useRef, useState } from 'react'
import type { Datos } from '@/lib/tipos'
import { nivelDe } from '@/vistas/armeria'

interface Aviso { id: string; titulo: string; texto: string }

export function Logros({ d }: { d: Datos }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const relojes = useRef<ReturnType<typeof setTimeout>[]>([])
  const visto = useRef<{ encargos: Map<number, string>; niveles: Map<string, number> } | null>(null)

  useEffect(() => {
    const encargos = new Map((d.encargos ?? []).map((e) => [e.id, e.estado]))
    const niveles = new Map(d.roles.map((r) => [r.id, nivelDe(d, r.id).nivel]))
    const antes = visto.current
    visto.current = { encargos, niveles }
    if (!antes) return
    const nuevos: Aviso[] = []
    for (const e of d.encargos ?? []) {
      if (e.estado === 'respondido' && antes.encargos.get(e.id) !== 'respondido') {
        const rol = d.roles.find((r) => r.id === e.rol)?.titulo ?? e.rol
        nuevos.push({ id: `e${e.id}`, titulo: '¡Entrega lograda!', texto: `${d.aspectos?.[`rol:${e.rol}`]?.apodo ?? rol} · encargo #${e.id}` })
      }
    }
    for (const [rol, n] of niveles) {
      if (n > (antes.niveles.get(rol) ?? n)) nuevos.push({ id: `n${rol}${n}`, titulo: '¡Subió de nivel!', texto: `${d.roles.find((r) => r.id === rol)?.titulo ?? rol} · NV ${n}` })
    }
    if (!nuevos.length) return
    setAvisos((a) => [...a, ...nuevos].slice(-4))
    // El reloj no depende de d: el SSE trae estados nuevos cada pocos segundos y no debe reiniciarlo.
    relojes.current.push(setTimeout(() => setAvisos((a) => a.filter((x) => !nuevos.includes(x))), 5000))
  }, [d])
  useEffect(() => () => relojes.current.forEach(clearTimeout), [])

  return <div className="logros" role="status" aria-live="polite">
    {avisos.map((a) => <div key={a.id} className="logro"><b>{a.titulo}</b><span>{a.texto}</span></div>)}
  </div>
}
