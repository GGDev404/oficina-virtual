// Escenario de cada tema: la geometría es la misma (comun.ts); cambian pisos, muros, muebles y decorado animado.
import type { TemaId } from '@/lib/tema'
import { limpia, type Escenario } from './escenarios/comun'
import { escenario as halo } from './escenarios/halo'
import { escenario as cyberpunk } from './escenarios/cyberpunk'
import { escenario as doom } from './escenarios/doom'
import { escenario as minecraft } from './escenarios/minecraft'

export { ESCRITORIOS, H, MESA_YO, SALAS, W, mesaYo, type Sala } from './escenarios/comun'
const POR_TEMA: Partial<Record<TemaId, () => Escenario>> = { halo, cyberpunk, doom, minecraft }
export const escenario = (tema: TemaId): Escenario => (POR_TEMA[tema] ?? limpia)()
