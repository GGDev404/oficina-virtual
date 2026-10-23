// Íconos de trazo (Lucide): los mismos nombres que usaba la página para no buscar el componente en cada vista.
import {
  AtSignIcon, BellIcon, BotIcon, CalendarIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon,
  CopyIcon, CpuIcon, DoorOpenIcon, EllipsisIcon, ExternalLinkIcon, FolderIcon, GitBranchIcon, HourglassIcon, ImageIcon,
  MailIcon, OctagonXIcon, RefreshCwIcon, SendIcon, ShieldIcon, SquareKanbanIcon, TerminalIcon, XIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONOS = {
  cerrar: XIcon, correo: MailIcon, robot: BotIcon, rama: GitBranchIcon, carpeta: FolderIcon, alto: OctagonXIcon,
  listo: CheckIcon, calendario: CalendarIcon, externo: ExternalLinkIcon, reloj: HourglassIcon, enviar: SendIcon,
  imagen: ImageIcon, terminal: TerminalIcon, flecha: ChevronRightIcon, arroba: AtSignIcon, puerta: DoorOpenIcon,
  campana: BellIcon, hora: ClockIcon, recargar: RefreshCwIcon, copiar: CopyIcon, mas: EllipsisIcon,
  abajo: ChevronDownIcon, izquierda: ChevronLeftIcon, chip: CpuIcon, escudo: ShieldIcon, pizarra: SquareKanbanIcon,
}
export type NombreIcono = keyof typeof ICONOS

export function Icono({ n, className }: { n: NombreIcono; className?: string }) {
  const C = ICONOS[n]
  return <C className={cn('icono', className)} aria-hidden="true" />
}
