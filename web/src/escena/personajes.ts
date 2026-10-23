// Personajes: quién se dibuja con qué kit, y su tira de sprites horneada para cada pose.
// El REPARTO de cada tema (kits/<tema>.ts) asigna un kit a «yo», a cada rol y a las sesiones de fondo; en Claro/Oscuro/
// Automático decide la clase guardada (KIT_DE_CLASE). Sumar un personaje = escribir su kit y una línea en su reparto.
import type { AspectoGuardado, Clase } from '@/lib/tipos'
import type { TemaId } from '@/lib/tema'
import { poseDe } from './animacion'
import { claveTema, enCache, hornearPixel, hornearVector, type Tira } from './hornear'
import { RITMOS, SENTADO, type Actor, type Kit, type Reparto } from './rig'
import type { Aspecto, Pose } from './sprites'
import { oficina } from './kits/oficina'
import { tripulacion } from './kits/cozy'
import { conFichasDoom, conFichasEdge, conFichasHalo, fichaCozy } from './kits/repartos-fichas'
import { reparto as haloCodigo } from './kits/halo'
import { reparto as cyberpunkCodigo } from './kits/cyberpunk'
import { reparto as doomCodigo } from './kits/doom'
import { reparto as minecraft } from './kits/minecraft'

export { actorDe, type Actor, type Vista } from './rig'

// Halo, Edgerunners y DOOM con fichas (retratos) si están extraídas; Minecraft siempre en pixel art.
const halo = conFichasHalo(haloCodigo), cyberpunk = conFichasEdge(cyberpunkCodigo), doom = conFichasDoom(doomCodigo)
const TEMAS: Partial<Record<TemaId, Reparto>> = { halo, cyberpunk, doom, minecraft }
export const KITS: Record<string, Kit> = { oficina: fichaCozy ?? tripulacion ?? oficina, ...halo.kits, ...cyberpunk.kits, ...doom.kits, ...minecraft.kits }
// La clase guardada decide el kit en Claro/Oscuro/Automático; los temas pueden registrar el suyo para cada clase.
export const KIT_DE_CLASE: Partial<Record<Clase, string>> = { spartan: 'spartan', netrunner: 'netrunner', marine: 'wad-doomguy' in doom.kits ? 'wad-doomguy' : 'marine', bloque: 'bloque' }

export function elegirKit(tema: TemaId, actor: Actor, clase: Clase): string {
  const id = TEMAS[tema]?.quien[actor] ?? KIT_DE_CLASE[clase] ?? 'oficina'
  return id in KITS ? id : 'oficina'
}

/** ¿El reparto del tema asigna personaje a este actor? (si no, manda la clase guardada) */
export const hayReparto = (tema: TemaId, actor: Actor) => !!TEMAS[tema]?.quien[actor]

/** Nombre del personaje que se ve y los colores guardados que de verdad lo tiñen. */
export function personajeDe(tema: TemaId, actor: Actor, clase: Clase): { nombre: string; usa: (keyof AspectoGuardado)[] } {
  const k = KITS[elegirKit(tema, actor, clase)]
  return { nombre: k.nombre ?? 'Personaje', usa: k.usa ?? COLORES_TODOS }
}
const COLORES_TODOS: (keyof AspectoGuardado)[] = ['camisa', 'pantalon', 'brillo', 'pelo', 'piel']

/** Tira de sprites del personaje en una pose (horneada una vez; la comparten escena, Armería y ficha). */
export function tiraPersonaje(aspecto: Aspecto, tema: TemaId, actor: Actor, pose: Pose): Tira {
  const id = elegirKit(tema, actor, aspecto.clase)
  return enCache(`pj|${id}|${actor}|${pose}|${claveTema()}|${JSON.stringify(aspecto)}`, () => {
    const kit = KITS[id], pieza = { aspecto, vista: SENTADO.has(pose) ? 'espalda' as const : 'frente' as const, pose, actor }
    if ('pintar' in kit) return hornearPixel((r, f) => kit.pintar(r, pieza, f), kit.ritmos?.[pose] ?? RITMOS[pose])
    return hornearVector(kit.dibujar(pieza), poseDe(pose, kit.poses?.[pose]))
  })
}
