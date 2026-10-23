// Poses de los personajes como funciones del tiempo: t va de 0 a 1 en un ciclo y cada parte del rig (selector CSS dentro
// del grupo .pj) recibe su movimiento. hornear.ts muestrea cada pose en `cuadros` y guarda una tira de sprites; la escena
// la anima con transform + steps() en la GPU, así que en reposo el hilo principal no hace nada por cuadro.
// El cuadro 0 (t = 0) es la postura de reposo de la pose: es lo que se ve con movimiento reducido, y debe leerse sola.
import type { Pose } from './sprites'

/** Movimiento de una parte: giro en grados alrededor de su pivote, desplazamiento, escala y opacidad. */
export interface Mov { r?: number; x?: number; y?: number; sx?: number; sy?: number; o?: number }
export interface PoseDef {
  dur: number // segundos por ciclo
  cuadros: number // cuadros horneados por ciclo (1 = quieta)
  pesos?: number[] // cuánto dura cada cuadro, relativo (parpadeo: abierto mucho, cerrado poco); sin pesos, todos igual
  partes: Record<string, (t: number) => Mov>
  ver?: string[] // extras que se muestran en esta pose (carpeta, zz…)
  ocultar?: string[]
  vaiven?: Vaiven // movimiento suave del cuerpo entero, en CSS sobre la tira (60 fps en la GPU)
}
export type Vaiven = '' | 'respira' | 'respira-lenta' | 'balanceo' | 'alza' | 'flota'

const PI2 = Math.PI * 2
/** Onda que cicla `k` veces por ciclo: seno con fase en vueltas. */
export const onda = (t: number, k = 1, fase = 0) => Math.sin(PI2 * (t * k + fase))
/** 0 → 1 → 0 suave en un ciclo (empieza en 0). */
export const pulso = (t: number, k = 1, fase = 0) => 0.5 - 0.5 * Math.cos(PI2 * (t * k + fase))
const frac = (v: number) => v - Math.floor(v)

// Extras escondidos salvo que la pose los pida.
export const OCULTOS = ['.carpeta', '.taza', '.zz', '.punto', '.ojo-cerrado', '.boca-t']

// zZ que suben y se desvanecen, uno tras otro.
const zeta = (k: number) => (t: number): Mov => {
  const u = frac(t + k / 3)
  return { x: 2 * u, y: 2 - 5 * u, o: u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7 }
}
const vapor = (fase: number) => (t: number): Mov => { const u = frac(t + fase); return { y: 1 - 3 * u, o: u < 0.4 ? u * 2 : 0.8 * (1 - (u - 0.4) / 0.6) } }

/** Poses del rig humano (personajes.ts). Un kit puede sobreescribir o sumar partes con su propio `poses`. */
export const POSES: Record<Pose, PoseDef> = {
  parado: { dur: 4, cuadros: 2, pesos: [23, 1], vaiven: 'respira', partes: { '.ojos': (t) => (t >= 0.5 ? { sy: 0.1 } : {}) } },
  camina: {
    dur: 0.9, cuadros: 12,
    partes: { // arranca a media zancada: con movimiento reducido queda un paso congelado
      '.pierna.i': (t) => ({ r: -22 * onda(t, 1, 0.25) }), '.pierna.d': (t) => ({ r: 22 * onda(t, 1, 0.25) }),
      '.brazo.i': (t) => ({ r: 16 * onda(t, 1, 0.25) }), '.brazo.d': (t) => ({ r: -16 * onda(t, 1, 0.25) }),
      '.cuerpo': (t) => ({ y: -0.8 * Math.abs(onda(t)) }), '.cabeza': (t) => ({ r: 1.5 * onda(t, 1, 0.25) }),
    },
  },
  teclea: {
    dur: 1.6, cuadros: 16,
    partes: {
      '.brazo.i': (t) => ({ r: -8.5 - 5.5 * onda(t, 4) }), '.brazo.d': (t) => ({ r: 8.5 + 5.5 * onda(t, 4, 0.5) }),
      '.cabeza': (t) => ({ y: 0.8 * pulso(t) }),
    },
  },
  espera: {
    dur: 2.4, cuadros: 12, ver: ['.punto'],
    partes: {
      '.brazo.i': () => ({ r: -14 }), '.brazo.d': () => ({ r: 14 }), '.cabeza': (t) => ({ r: 6 * pulso(t) }),
      '.punto.p0': (t) => ({ o: 0.25 + 0.75 * pulso(t, 2) }), '.punto.p1': (t) => ({ o: 0.25 + 0.75 * pulso(t, 2, -1 / 6) }),
      '.punto.p2': (t) => ({ o: 0.25 + 0.75 * pulso(t, 2, -1 / 3) }),
    },
  },
  mano: { dur: 0.8, cuadros: 8, partes: { '.brazo.d': (t) => ({ r: -142 + 24 * pulso(t) }), '.cabeza': (t) => ({ r: -2 * pulso(t) }) } },
  triste: {
    dur: 1, cuadros: 1, vaiven: 'balanceo', ver: ['.boca-t'], ocultar: ['.boca-s'],
    partes: { '.cabeza': () => ({ y: 1.2, r: 9 }), '.cuerpo': () => ({ sy: 0.95 }), '.brazo.i': () => ({ r: 6 }), '.brazo.d': () => ({ r: -6 }) },
  },
  duerme: {
    dur: 2.4, cuadros: 12, vaiven: 'respira-lenta', ver: ['.zz', '.ojo-cerrado'], ocultar: ['.ojos', '.boca-s'],
    partes: { '.cabeza': () => ({ r: 11 }), '.zz.z0': zeta(0), '.zz.z1': zeta(1), '.zz.z2': zeta(2) },
  },
  entrega: { dur: 1, cuadros: 1, vaiven: 'alza', ver: ['.carpeta'], partes: { '.brazo.i': () => ({ r: -58 }), '.brazo.d': () => ({ r: 58 }) } },
  cafe: { dur: 2.4, cuadros: 12, vaiven: 'respira', ver: ['.taza'], partes: { '.vapor.v0': vapor(0), '.vapor.v1': vapor(0.5) } },
}

/** La pose de un kit: la base con lo que el kit cambie (sus partes se suman a las de la base). */
export function poseDe(pose: Pose, propia?: Partial<PoseDef>): PoseDef {
  const b = POSES[pose]
  return propia ? { ...b, ...propia, partes: { ...b.partes, ...propia.partes } } : b
}
