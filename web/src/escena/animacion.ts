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
export type Vaiven = '' | 'respira' | 'respira-lenta' | 'balanceo' | 'alza' | 'flota' | 'reposo' | 'suspiro'

const PI2 = Math.PI * 2
/** Onda que cicla `k` veces por ciclo: seno con fase en vueltas. */
export const onda = (t: number, k = 1, fase = 0) => Math.sin(PI2 * (t * k + fase))
/** 0 → 1 → 0 suave en un ciclo (empieza en 0). */
export const pulso = (t: number, k = 1, fase = 0) => 0.5 - 0.5 * Math.cos(PI2 * (t * k + fase))
const frac = (v: number) => v - Math.floor(v)

// Extras escondidos salvo que la pose los pida.
export const OCULTOS = ['.carpeta', '.taza', '.zz', '.punto', '.ojo-cerrado', '.boca-t', '.lagrima']

/** Cuadro i que hornea t = i / n. */
const cuadro = (t: number, n: number) => Math.min(n - 1, Math.floor(t * n + 1e-6))
/** Tiempo real (0..1 del ciclo) a mitad de cada cuadro, cuando los `pesos` los hacen de duración desigual. */
const reloj = (pesos: number[]) => {
  const tot = pesos.reduce((a, b) => a + b, 0)
  let s = 0
  const mid = pesos.map((p) => { const m = s + p / 2; s += p; return m / tot })
  return (t: number) => mid[cuadro(t, pesos.length)]
}
const en = <T,>(a: T[], t: number) => a[cuadro(t, a.length)]

// zZ que suben en arco, crecen y se desvanecen, uno tras otro.
const zeta = (k: number) => (t: number): Mov => {
  const u = frac(t + k / 3)
  return { x: 1.8 * u + 1.1 * Math.sin(PI2 * u), y: 2 - 6 * u, sx: 0.65 + 0.6 * u, sy: 0.65 + 0.6 * u, o: u < 0.25 ? u / 0.25 : 1 - (u - 0.25) / 0.75 }
}
// Vapor: dos vueltas por ciclo, sube serpenteando y se disipa.
const vapor = (fase: number, tt: (t: number) => number) => (t: number): Mov => {
  const u = frac(2 * tt(t) + fase)
  return { x: 0.7 * Math.sin(PI2 * (u + fase)), y: 1 - 3.6 * u, o: u < 0.3 ? u / 0.3 : 0.85 * (1 - (u - 0.3) / 0.7) }
}

// Parado: abierto mucho rato, parpadeo y doble parpadeo (cada cuadro dura peso × 0,05 s), mirada que se afloja.
const P_PARADO = [60, 2, 2, 44, 2, 2, 6, 3]
const OJOS = [1, 0.5, 0.1, 1, 0.5, 0.1, 1, 0.1]
// Teclea (de espaldas): ráfagas irregulares con pausas donde alza la cabeza.
const P_TECLEA = [3, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 2, 1]
const TL = [0, 1, -0.4, 0.7, 0.2, -1, 0.6, -0.3, 0.9, 0, -0.5, 0.8, 0.1, -0.7, 0, 0.6]
const TR = [0, -0.3, 1, -0.6, 0.9, 0.3, -0.8, 0.7, -0.2, 0, 0.6, -0.8, 0.9, 0.2, 0, -0.5]
const TCAB = [0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, -2, 0]
// Espera: tamborilea con la derecha y mira a un lado y a otro.
const P_ESPERA = [4, 1, 1, 1, 1, 1, 1, 1, 1, 3, 1, 2]
const TAMBOR = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0]
const relojEspera = reloj(P_ESPERA)
const ECAB = [5, 6, 6, 6, 6, 6, 6, 6, 6, 0, -4, -4]
// Triste: mirada baja con un parpadeo lento y una lágrima que cae.
const P_TRISTE = [10, 1, 6, 2, 2, 2]
// Entrega: sostiene, se encoge (anticipación), empuja pasándose y se asienta.
const P_ENTREGA = [9, 2, 2, 1, 1, 2, 2]
const EB = [58, 44, 38, 66, 70, 62, 57] // giro de cada brazo hacia la carpeta
const EY = [0, 1.2, 1.8, -1.6, -2.2, -0.8, 0.2] // carpeta
const ESY = [1, 0.97, 0.955, 1.03, 1.04, 1.01, 1] // cuerpo
// Café: reposa, sube la taza, bebe con los ojos cerrados y baja (cuadros de 0,1 s al moverse, 0,2 s al reposar).
const P_CAFE = [2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 2, 2]
const CA = [0, 0, 0, 0, 0.3, 0.65, 0.9, 1, 1, 1, 1, 0.75, 0.45, 0.15, 0, 0] // alzada del brazo
const CT = [0, 0, 0, 0, 0, 0, 0, 0.5, 1, 1, 0.4, 0, 0, 0, 0, 0] // inclinación de la taza
const relojCafe = reloj(P_CAFE)

/** Poses del rig humano (personajes.ts). Un kit puede sobreescribir o sumar partes con su propio `poses`. */
export const POSES: Record<Pose, PoseDef> = {
  parado: {
    dur: 6.05, cuadros: 8, pesos: P_PARADO, vaiven: 'reposo',
    partes: {
      '.ojos': (t) => ({ sy: en(OJOS, t) }),
      '.cabeza': (t) => (cuadro(t, 8) >= 3 ? { r: 1.6, y: 0.1 } : {}), '.cuerpo': (t) => (cuadro(t, 8) >= 3 ? { x: 0.3 } : {}),
    },
  },
  camina: {
    // 12 cuadros = 2 pasos. t = 0 es el contacto (piernas abiertas, cuerpo en lo más bajo): congelado sigue leyéndose como paso.
    // El cuerpo sube en la pasada (2 botes por ciclo); brazos y cabeza van con un poco de retraso (solapamiento).
    dur: 0.9, cuadros: 12,
    partes: {
      '.pierna.i': (t) => ({ r: -22 * onda(t, 1, 0.25), sy: 1 - 0.13 * Math.max(0, onda(t)) }),
      '.pierna.d': (t) => ({ r: 22 * onda(t, 1, 0.25), sy: 1 - 0.13 * Math.max(0, -onda(t)) }),
      '.brazo.i': (t) => ({ r: 18 * onda(t, 1, 0.18) }), '.brazo.d': (t) => ({ r: -18 * onda(t, 1, 0.18) }),
      '.antebrazo.i': (t) => ({ r: -6 - 7 * pulso(t, 1, 0.18) }), '.antebrazo.d': (t) => ({ r: -6 - 7 * pulso(t, 1, 0.68) }),
      '.cuerpo': (t) => ({ y: -1 * pulso(t, 2), r: 1.4 * onda(t, 1, 0.25) }),
      '.cabeza': (t) => ({ r: -1.4 * onda(t, 1, 0.25) + 1.2 * onda(t, 1, 0.12), y: 0.35 * pulso(t, 2, 0.1) }),
    },
  },
  teclea: {
    dur: 2.2, cuadros: 16, pesos: P_TECLEA,
    partes: {
      '.brazo.i': (t) => ({ r: -8.5 - 4.5 * en(TL, t) }), '.brazo.d': (t) => ({ r: 8.5 + 4.5 * en(TR, t) }),
      '.antebrazo.i': (t) => ({ r: 4 * en(TL, t) }), '.antebrazo.d': (t) => ({ r: -4 * en(TR, t) }),
      '.cabeza': (t) => { const i = cuadro(t, 16); return { y: i === 0 || i === 9 || i === 14 ? 0 : 0.55, r: en(TCAB, t) } },
    },
  },
  espera: {
    dur: 2.4, cuadros: 12, pesos: P_ESPERA, ver: ['.punto'],
    partes: {
      '.brazo.i': () => ({ r: -14 }), '.brazo.d': (t) => ({ r: 14 - 5 * en(TAMBOR, t) }), '.antebrazo.d': (t) => ({ r: -3 * en(TAMBOR, t) }),
      '.cabeza': (t) => ({ r: en(ECAB, t) }),
      '.punto.p0': (t) => ({ o: 0.25 + 0.75 * pulso(relojEspera(t), 2) }), '.punto.p1': (t) => ({ o: 0.25 + 0.75 * pulso(relojEspera(t), 2, -1 / 6) }),
      '.punto.p2': (t) => ({ o: 0.25 + 0.75 * pulso(relojEspera(t), 2, -1 / 3) }),
    },
  },
  mano: {
    // Brazo al costado y antebrazo vertical que saluda; el antebrazo va retrasado respecto al brazo y la cabeza al antebrazo.
    dur: 1.2, cuadros: 12, vaiven: 'respira',
    partes: {
      '.brazo.d': (t) => ({ r: -122 + 4 * onda(t, 2) }), '.antebrazo.d': (t) => ({ r: -58 + 24 * onda(t, 2, -0.12) }),
      '.brazo.i': () => ({ r: 5 }), '.cuerpo': (t) => ({ r: -1.2 * onda(t, 2, 0.05), sy: 1.02 }), '.cabeza': (t) => ({ r: -2 + 2.5 * onda(t, 2, -0.2) }),
    },
  },
  triste: {
    dur: 3.45, cuadros: 6, pesos: P_TRISTE, vaiven: 'suspiro', ver: ['.boca-t', '.lagrima'], ocultar: ['.boca-s'],
    partes: {
      '.cabeza': (t) => ({ y: cuadro(t, 6) === 2 ? 1.6 : 1.2, r: cuadro(t, 6) === 2 ? 10 : 9 }), '.cuerpo': () => ({ sy: 0.95 }),
      '.brazo.i': () => ({ r: 6 }), '.brazo.d': () => ({ r: -6 }), '.antebrazo.i': () => ({ r: -8 }), '.antebrazo.d': () => ({ r: 8 }),
      '.ojos': (t) => ({ sy: cuadro(t, 6) === 1 ? 0.1 : 0.7 }),
      '.lagrima': (t) => { const i = cuadro(t, 6); return i < 3 ? { o: 0 } : { y: (i - 3) * 3.2, o: i === 5 ? 0.45 : 0.9 } },
    },
  },
  duerme: {
    dur: 3.2, cuadros: 16, vaiven: 'respira-lenta', ver: ['.zz', '.ojo-cerrado'], ocultar: ['.ojos', '.boca-s'],
    partes: { '.cabeza': (t) => ({ r: 11 + 3 * onda(t), y: 0.4 * pulso(t) }), '.zz.z0': zeta(0), '.zz.z1': zeta(1), '.zz.z2': zeta(2) },
  },
  entrega: {
    dur: 2.4, cuadros: 7, pesos: P_ENTREGA, vaiven: 'respira', ver: ['.carpeta'],
    partes: {
      '.brazo.i': (t) => ({ r: -en(EB, t) }), '.brazo.d': (t) => ({ r: en(EB, t) }),
      '.carpeta': (t) => ({ y: en(EY, t), sy: 1 + (en(ESY, t) - 1) * 0.6 }), '.cuerpo': (t) => ({ sy: en(ESY, t) }),
      '.cabeza': (t) => ({ r: [0, 2, 2.5, -1.5, -2, -0.5, 0][cuadro(t, 7)] }),
    },
  },
  cafe: {
    // Hombro y codo suben la taza (que se mantiene derecha y se inclina al beber); el vapor sigue a la taza.
    dur: 2.4, cuadros: 16, pesos: P_CAFE, vaiven: 'respira', ver: ['.taza'],
    partes: {
      '.brazo.d': (t) => ({ r: -6 - 2 * en(CA, t) }), '.antebrazo.d': (t) => ({ r: 28 + 122 * en(CA, t) }),
      '.taza': (t) => ({ r: -(22 + 120 * en(CA, t)) - 28 * en(CT, t) }),
      '.vapor.v0': vapor(0, relojCafe), '.vapor.v1': vapor(0.5, relojCafe),
      '.ojos': (t) => ({ sy: en(CT, t) >= 1 ? 0.12 : cuadro(t, 16) === 2 ? 0.12 : 1 }), '.cabeza': (t) => ({ y: -0.5 * en(CT, t) }),
    },
  },
}

/** La pose de un kit: la base con lo que el kit cambie (sus partes se suman a las de la base). */
export function poseDe(pose: Pose, propia?: Partial<PoseDef>): PoseDef {
  const b = POSES[pose]
  return propia ? { ...b, ...propia, partes: { ...b.partes, ...propia.partes } } : b
}
