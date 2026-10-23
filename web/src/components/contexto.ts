import { createContext, useContext } from 'react'
import type { Datos, Memoria, Tarea, Yo } from '@/lib/tipos'

export type Seccion = 'agenda' | 'pizarra' | 'pendientes' | 'parati' | 'memoria' | 'roles'
export interface OpcionesNueva {
  tareaId?: string | null
  cwd?: string | null
  prompt?: string
  nombre?: string
  modelo?: string
  cerrar?: string | null // sesión que se traspasa: se cierra cuando la nueva arranca
}

export interface Oficina {
  datos: Datos
  tareas: Record<string, Tarea>
  yo: Yo
  mem: Memoria | null
  cargarMemoria: () => void
  abrirAgente: (id: string, opciones?: { escribir?: boolean }) => void
  abrirOficina: (seccion?: Seccion) => void
  abrirNecesitan: () => void
  abrirNueva: (opciones?: OpcionesNueva) => void
  abrirArmeria: (clave?: string) => void
  cerrarVentana: () => void
}

export const ContextoOficina = createContext<Oficina | null>(null)
export const useOficina = () => useContext(ContextoOficina)!
