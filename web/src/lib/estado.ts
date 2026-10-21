// Estado en vivo: el servidor empuja todo por SSE en cada cambio (`event: estado`) y avisa cada escritura en el
// transcript de una sesión (`event: conversacion`), para que la ficha abierta muestre la respuesta al momento.
// Si la conexión se cae de verdad (EventSource en CLOSED) se reabre con backoff, y al volver a la pestaña se
// pide el estado de nuevo por si se perdió algo mientras estaba en segundo plano.
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
    let fuente: EventSource | null = null
    let reintento: ReturnType<typeof setTimeout> | undefined
    let espera = 1000
    let activo = true

    const abrir = () => {
      fuente?.close()
      const f = new EventSource('/api/stream')
      fuente = f
      f.addEventListener('estado', (ev) => setDatos(JSON.parse((ev as MessageEvent).data)))
      f.addEventListener('conversacion', (ev) => conversaciones.dispatchEvent(new CustomEvent('sid', { detail: JSON.parse((ev as MessageEvent).data).sid })))
      f.onopen = () => { espera = 1000; setConectado(true) }
      f.onerror = () => {
        setConectado(false)
        if (f.readyState !== EventSource.CLOSED || !activo) return // CONNECTING: el navegador reintenta solo (retry: 3000)
        f.close()
        reintento = setTimeout(abrir, espera)
        espera = Math.min(espera * 2, 15_000)
      }
    }

    const alVolver = () => {
      if (document.visibilityState !== 'visible') return
      if (!fuente || fuente.readyState === EventSource.CLOSED) { clearTimeout(reintento); espera = 1000; abrir(); return }
      fetch('/api/estado').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && activo) setDatos(d) }).catch(() => {})
    }

    abrir()
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      activo = false
      clearTimeout(reintento)
      document.removeEventListener('visibilitychange', alVolver)
      fuente?.close()
    }
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
