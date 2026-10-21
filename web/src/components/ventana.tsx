// Ventana grande de la oficina sobre el Dialog de shadcn (Radix): foco atrapado, Esc y clic en el fondo cierran, y los
// Popover/Select de cualquier librería funcionan adentro (un <dialog> nativo los dejaría inertes en su capa superior).
import type { CSSProperties, ReactNode } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Icono } from './icono'
import { cn } from '@/lib/utils'

export function Ventana({ alCerrar, id, className, style, enfocar, children }: {
  alCerrar: () => void
  id?: string
  className?: string
  style?: CSSProperties
  enfocar?: () => HTMLElement | null | undefined // qué recibe el foco al abrir (si no, el primer control)
  children: ReactNode
}) {
  return (
    <Dialog open onOpenChange={(abierta) => { if (!abierta) alCerrar() }}>
      <DialogContent id={id} className={cn('ventana', className)} style={style} aria-describedby={undefined}
        onOpenAutoFocus={(ev) => { const n = enfocar?.(); if (n) { ev.preventDefault(); n.focus() } }}>
        {children}
      </DialogContent>
    </Dialog>
  )
}

export const Titulo = ({ id, children }: { id?: string; children: ReactNode }) => <DialogPrimitive.Title id={id}>{children}</DialogPrimitive.Title>

export function Cerrar({ etiqueta = 'Cerrar' }: { etiqueta?: string }) {
  return <DialogClose asChild><button className="cerrar" type="button" aria-label={etiqueta}><Icono n="cerrar" /></button></DialogClose>
}
