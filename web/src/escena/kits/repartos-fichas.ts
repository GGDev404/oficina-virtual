// Repartos con fichas (retratos redondos): mismos personajes y mismas claves de kit que el arte en código de cada tema,
// así que si falta fichas.json se usa ese arte. Minecraft no cambia: queda en pixel art.
import type { Kit, Reparto } from '../rig'
import type { Pose } from '../sprites'
import { ficha, variante } from './fichas'

const solo = (kits: Record<string, Kit | null>) => Object.fromEntries(Object.entries(kits).filter(([, k]) => k)) as Record<string, Kit>
/** Sobrepone las fichas al reparto del tema (sin fichas, el reparto queda igual). */
const encima = (base: Reparto, fichas: Record<string, Kit | null>): Reparto => ({ ...base, kits: { ...base.kits, ...solo(fichas) } })

const HALO = '#5fd4f4', EDGE = '#fcee0a', DOOM = '#c9a24a', COZY = '#ffffff'
const fija = (k: string) => () => k

export const conFichasHalo = (base: Reparto) => encima(base, {
  chief: ficha('Jefe Maestro', fija('halo-chief'), HALO), cortana: ficha('Cortana', fija('halo-cortana'), HALO),
  spark: ficha('343 Guilty Spark', fija('halo-spark'), HALO), johnson: ficha('Sgt. Johnson', fija('halo-johnson'), HALO),
  halsey: ficha('Dra. Halsey', fija('halo-halsey'), HALO), keyes: ficha('Cap. Keyes', fija('halo-keyes'), HALO),
  arbiter: ficha('El Arbiter', fija('halo-arbiter'), HALO),
  spartan: ficha('Spartan o marine', (a) => `halo-f${variante(a, 8)}`, HALO, ['camisa', 'pantalon', 'brillo', 'pelo', 'piel']),
})

export const conFichasEdge = (base: Reparto) => {
  const fondo = ficha('Edgerunner de Night City', (a) => `edge-f${variante(a, 8)}`, EDGE, ['camisa', 'pantalon', 'brillo', 'pelo', 'piel'])
  return encima(base, {
    david: ficha('David Martinez', fija('edge-david'), EDGE), lucy: ficha('Lucy', fija('edge-lucy'), EDGE), kiwi: ficha('Kiwi', fija('edge-kiwi'), EDGE),
    maine: ficha('Maine', fija('edge-maine'), EDGE), rebecca: ficha('Rebecca', fija('edge-rebecca'), EDGE), pilar: ficha('Pilar', fija('edge-pilar'), EDGE),
    falco: ficha('Falco', fija('edge-falco'), EDGE), dorio: ficha('Dorio', fija('edge-f0'), EDGE), fondo, netrunner: fondo,
  })
}

export const conFichasDoom = (base: Reparto) => encima(base, {
  'wad-doomguy': ficha('Doomguy', fija('doom-doomguy'), DOOM), 'wad-baron': ficha('Barón del Infierno', fija('doom-baron'), DOOM),
  'wad-pinky': ficha('Pinky', fija('doom-pinky'), DOOM), 'wad-imp': ficha('Imp', fija('doom-imp'), DOOM),
  'wad-espectro': ficha('Espectro', fija('doom-espectro'), DOOM), 'wad-sargento': ficha('Sargento de escopeta', fija('doom-sargento'), DOOM),
  'wad-rojo': ficha('Doomguy rojo', fija('doom-rojo'), DOOM), 'wad-fondo': ficha('Zombi o marine', (a) => `doom-f${variante(a, 3)}`, DOOM),
})

// Claro/Oscuro: la tripulación de "Cozy Space Portraits" (CC-BY 4.0), con el gesto según el estado.
const GESTO: Partial<Record<Pose, string>> = { mano: 'surprised', triste: 'sad', entrega: 'happy', cafe: 'happy' }
const COZY_ROL: Record<string, string> = {
  'analisis-plan': 'officer-noor', 'revision-qa': 'doctor-lin', implementacion: 'engineer-rosa', diseno: 'cadet-mia',
  'docs-entrega': 'pilot-kai', integracion: 'mechanic-gus',
}
const COZY_FONDO = ['captain-ada', 'alien-zib', 'robot-b0t', 'pilot-kai', 'cadet-mia', 'mechanic-gus', 'officer-noor', 'engineer-rosa', 'doctor-lin']
export const fichaCozy = ficha('Tripulante', (a, pose, actor) => `cozy-${actor === 'yo' ? 'captain-ada' : (a.rol && COZY_ROL[a.rol]) || COZY_FONDO[variante(a, COZY_FONDO.length)]}-${GESTO[pose] ?? 'neutral'}`, COZY,
  ['camisa', 'pantalon', 'brillo', 'pelo', 'piel'])
