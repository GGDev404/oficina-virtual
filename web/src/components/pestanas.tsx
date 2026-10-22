// Pestañas accesibles (tablist/tab/tabpanel, flechas, Inicio/Fin, foco) sobre Radix, con el estilo de `.vo-tabs` (subrayado)
// o `.va-tabs` (pastilla). Los paneles son `Panel` con el `valor` de su pestaña.
import type { ComponentProps, ReactNode } from 'react'
import { Tabs } from 'radix-ui'

export function Panel({ valor, ...resto }: { valor: string } & Omit<ComponentProps<typeof Tabs.Content>, 'value'>) {
  return <Tabs.Content value={valor} {...resto} />
}

export interface ItemPestana { id: string; titulo: string; cuenta?: number }

export function Pestanas({ valor, alCambiar, etiqueta, items, variante = 'vo', className, children }: {
  valor: string; alCambiar: (id: string) => void; etiqueta: string; items: ItemPestana[]; variante?: 'vo' | 'va'; className?: string; children?: ReactNode
}) {
  return (
    <Tabs.Root value={valor} onValueChange={alCambiar} className={className}>
      <Tabs.List className={`${variante}-tabs`} aria-label={etiqueta}>
        {items.map((i) => <Tabs.Trigger key={i.id} value={i.id}>{i.titulo}{i.cuenta != null && <span className="cuenta">{i.cuenta}</span>}</Tabs.Trigger>)}
      </Tabs.List>
      {children}
    </Tabs.Root>
  )
}
