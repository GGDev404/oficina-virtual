// Estado en vivo: el servidor empuja todo por SSE en cada cambio (`event: estado`) y avisa cada escritura en el
// transcript de una sesión (`event: conversacion`), para que la ficha abierta muestre la respuesta al momento.
import { useEffect, useState } from 'react'
import type { Datos } from './tipos'

const conversaciones = new EventTarget()
export function alEscribirConversacion(fn: (sid: string) => void) {
  const oyente = (ev: Event) => fn((ev as CustomEvent<string>).detail)
  conversaciones.addEventListener('sid', oyente)
  return () => conversaciones.removeEventListener('sid', oyente)
}

export function useEstado() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [conectado, setConectado] = useState<boolean | null>(null)
  useEffect(() => {
    const fuente = new EventSource('/api/stream')
    fuente.addEventListener('estado', (ev) => setDatos(JSON.parse(ev.data)))
    fuente.addEventListener('conversacion', (ev) => conversaciones.dispatchEvent(new CustomEvent('sid', { detail: JSON.parse(ev.data).sid })))
    fuente.onopen = () => setConectado(true)
    fuente.onerror = () => setConectado(false)
    return () => fuente.close()
  }, [])
  return { datos, conectado }
}

// Hora que avanza sola: repinta los «hace X min», las duraciones y las cuentas regresivas.
export function useAhora(cada: number) {
  const [ahora, setAhora] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), cada)
    return () => clearInterval(t)
  }, [cada])
  return ahora
}
