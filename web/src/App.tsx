import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ContextoOficina, type OpcionesNueva, type Oficina, type Seccion } from '@/components/contexto'
import { Escena } from '@/escena/Escena'
import { Icono } from '@/components/icono'
import { leer, postSeguro, siNoAutorizado } from '@/lib/api'
import { useAhora, useEstado } from '@/lib/estado'
import { hace, tareaPorId } from '@/lib/oficina'
import type { Memoria, Yo } from '@/lib/tipos'
import { Armeria } from '@/vistas/armeria'
import { Entrar } from '@/vistas/entrar'
import { Ficha } from '@/vistas/ficha'
import { NuevaSesion } from '@/vistas/nueva-sesion'
import { Tarjetas } from '@/vistas/tarjetas'
import { TeNecesitan } from '@/vistas/te-necesitan'
import { TuDia } from '@/vistas/tu-dia'

// Una ventana a la vez (abrir otra la reemplaza); «Entra a tu oficina» puede ir encima de cualquiera.
type Abierta = { tipo: 'agente'; id: string; escribir: boolean } | { tipo: 'oficina'; seccion: Seccion } | { tipo: 'necesitan' }
  | { tipo: 'nueva'; opciones: OpcionesNueva; carpetas: string[] } | { tipo: 'armeria'; clave?: string } | null

export default function App() {
  const { datos, conectado } = useEstado()
  useAhora(30_000) // refresca los «hace X min»
  const [ventana, setVentana] = useState<Abierta>(null)
  const [yo, setYo] = useState<Yo>({ frase: true }) // si ya entraste en este navegador y tu nombre (iniciales en la ficha)
  const [entrar, setEntrar] = useState(false)
  const [mem, setMem] = useState<Memoria | null>(null)
  const barra = useRef<HTMLElement>(null)

  const pedirEntrar = useCallback(async () => {
    let nuevo: Yo
    try { nuevo = await leer<Yo>('/api/yo') } catch { return }
    setYo(nuevo)
    if (!nuevo.entrado) setEntrar(true)
  }, [])
  useEffect(() => { siNoAutorizado(pedirEntrar); pedirEntrar() }, [pedirEntrar])

  // Memoria: cuánta queda y cuánto usa cada agente.
  const cargarMemoria = useCallback(() => { leer<Memoria>('/api/memoria').then(setMem, () => {}) }, [])
  useEffect(() => { cargarMemoria(); const t = setInterval(cargarMemoria, 10_000); return () => clearInterval(t) }, [cargarMemoria])

  // La escena se ajusta para caber debajo de la barra.
  useEffect(() => {
    const b = barra.current!
    const o = new ResizeObserver(() => document.documentElement.style.setProperty('--cabecera', `${b.offsetHeight}px`))
    o.observe(b)
    return () => o.disconnect()
  }, [])

  const cerrarVentana = useCallback(() => setVentana(null), [])
  const abrirAgente = useCallback((id: string, { escribir = false } = {}) => setVentana({ tipo: 'agente', id, escribir }), [])
  const abrirOficina = useCallback((seccion: Seccion = 'agenda') => setVentana({ tipo: 'oficina', seccion }), [])
  const abrirNecesitan = useCallback(() => setVentana({ tipo: 'necesitan' }), [])
  const abrirNueva = useCallback(async (opciones: OpcionesNueva = {}) => {
    const carpetas = await leer<string[]>('/api/carpetas').catch(() => [])
    setVentana({ tipo: 'nueva', opciones, carpetas })
  }, [])
  const abrirArmeria = useCallback((clave?: string) => setVentana({ tipo: 'armeria', clave }), [])
  const tareas = useMemo(() => (datos ? tareaPorId(datos) : {}), [datos])
  // Memorizado: un estado nuevo del SSE no vuelve a pintar las vistas si lo que leen no cambió de referencia.
  const oficina: Oficina | null = useMemo(() => datos && { datos, tareas, yo, mem, cargarMemoria, abrirAgente, abrirOficina, abrirNecesitan, abrirNueva, abrirArmeria, cerrarVentana },
    [datos, tareas, yo, mem, cargarMemoria, abrirAgente, abrirOficina, abrirNecesitan, abrirNueva, abrirArmeria, cerrarVentana])
  const acciones = useMemo(() => ({ abrirAgente: (id: string) => abrirAgente(id), abrirOficina: (s?: string) => abrirOficina(s as Seccion | undefined) }), [abrirAgente, abrirOficina])

  const sync = datos?.sync
  const textoSync = !sync ? 'Sin sincronizar' : sync.corriendo ? 'Sincronizando ClickUp…'
    : sync.error ? `ClickUp: ${sync.error}` : sync.ultima_ts ? `ClickUp ${hace(sync.ultima_ts)}` : 'Sin sincronizar'
  return <>
    <header className="barra" ref={barra}>
      <h1>Oficina virtual</h1>
      <button className="primario" type="button" aria-haspopup="dialog" onClick={() => abrirNueva()} disabled={!datos}>Nueva sesión</button>
      <button type="button" aria-haspopup="dialog" onClick={() => abrirArmeria()} disabled={!datos}><Icono n="escudo" />Armería</button>
      <div className="sync"><span title={textoSync}>{textoSync}</span>
        <button type="button" disabled={!!sync?.corriendo} onClick={() => postSeguro('/api/sincronizar')}>Sincronizar ahora</button>
        <span className={`chip ${conectado ? 'verde' : conectado === false ? 'rojo' : ''}`}>{conectado ? 'en vivo' : conectado === false ? 'desconectado' : 'conectando…'}</span></div>
    </header>
    <main>
      <Escena datos={datos} acciones={acciones} />
      {oficina && <ContextoOficina.Provider value={oficina}><Tarjetas /></ContextoOficina.Provider>}
    </main>
    {oficina && <ContextoOficina.Provider value={oficina}>
      {ventana?.tipo === 'agente' && <Ficha id={ventana.id} escribir={ventana.escribir} />}
      {ventana?.tipo === 'oficina' && <TuDia seccion={ventana.seccion} />}
      {ventana?.tipo === 'necesitan' && <TeNecesitan />}
      {ventana?.tipo === 'armeria' && <Armeria inicial={ventana.clave} />}
      {ventana?.tipo === 'nueva' && <NuevaSesion opciones={ventana.opciones} carpetas={ventana.carpetas} />}
    </ContextoOficina.Provider>}
    {entrar && <Entrar yo={yo} alCerrar={() => setEntrar(false)} alEntrar={() => { setEntrar(false); pedirEntrar() }} />}
  </>
}
