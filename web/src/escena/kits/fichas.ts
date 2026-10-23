// Fichas: cada agente es un retrato redondo con el arte del juego (Halo, Edgerunners, DOOM, Claro/Oscuro). El anillo dice
// el estado con el mismo color en todos los temas; el marco exterior es del tema. La ficha flota, late o se balancea
// según la pose (vaivén del cuerpo entero) y lleva el rasgo del rol abajo a la izquierda. Ver scripts/assets-juegos.py.
import type { Actor, KitPixel, Ritmo } from '../rig'
import type { Aspecto, Pose } from '../sprites'
import { retratos } from './juego'
import { at, mapa, PROP, puntos, zeta, type P } from './pixel'

// Color del anillo por pose (= estado de la sesión): trabaja, espera procesos, pide permiso, te espera, bloqueado…
const ANILLO: Record<Pose, string> = {
  teclea: '#4fe3f0', espera: '#4fe3f0', mano: '#ff9a3c', parado: '#ffd84a', triste: '#ff4b3e', duerme: '#8a8f96',
  entrega: '#6fe39a', camina: '#e9ecf2', cafe: '#ffb347',
}
const RITMOS: Partial<Record<Pose, Ritmo>> = {
  parado: { cuadros: 1, dur: 1, vaiven: 'respira' }, camina: { cuadros: 2, dur: 0.36 }, teclea: { cuadros: 2, dur: 0.7 },
  espera: { cuadros: 4, dur: 2.4 }, mano: { cuadros: 2, dur: 0.7, vaiven: 'alza' }, triste: { cuadros: 1, dur: 1, vaiven: 'suspiro' },
  duerme: { cuadros: 3, dur: 2.4, vaiven: 'respira-lenta' }, entrega: { cuadros: 1, dur: 1, vaiven: 'flota' }, cafe: { cuadros: 1, dur: 1, vaiven: 'respira' },
}
const R = 13 // radio del retrato en px lógicos

/** Kit de ficha: `retrato` elige la imagen (por gesto, rol o colores); `marco` es el aro exterior del tema. */
export function ficha(nombre: string, retrato: (a: Aspecto, pose: Pose, actor?: Actor) => string, marco: string, usa: KitPixel['usa'] = []): KitPixel | null {
  if (!retratos) return null
  return {
    nombre, usa, ritmos: RITMOS,
    pintar: (r, pz, f) => {
      const pose = pz.pose, img = retratos![retrato(pz.aspecto, pose, pz.actor)]
      if (!img || !r.imagen || !r.circulo) return
      const salto = (pose === 'camina' || pose === 'teclea') && f === 1 ? -1 : 0, cy = -R - 5 + salto
      r.circulo(0, -1, 10, 2.4, 'rgba(0,0,0,.35)') // sombra en el piso
      r.circulo(0, cy, R + 2.2, R + 2.2, '#0b0c10')
      r.imagen(img, 0, 0, img.naturalWidth, img.naturalHeight, -R, cy - R, R * 2, R * 2)
      if (pose === 'duerme') r.circulo(0, cy, R, R, 'rgba(10,12,18,.55)')
      if (pose === 'triste') r.circulo(0, cy, R, R, 'rgba(120,0,0,.18)')
      r.circulo(0, cy, R + 0.9, R + 0.9, ANILLO[pose], pose === 'mano' && f === 1 ? 2.4 : 1.7)
      r.circulo(0, cy, R + 2.4, R + 2.4, marco, 0.9)
      const p: P = r
      if (pz.aspecto.rol && pose !== 'entrega') PROP[pz.aspecto.rol](at(p, -R + 1, cy + R + 1))
      if (pose === 'espera') puntos(p, R - 1, cy - R - 2, f)
      if (pose === 'duerme') zeta(p, R - 2, cy - R + 2, f)
      if (pose === 'entrega') mapa(at(p, 3, cy + R - 5), 10)
    },
  }
}

/** Elige una de `n` variantes por los colores guardados (las sesiones sin rol se distinguen entre sí). */
export const variante = (a: Aspecto, n: number) => [...`${a.camisa}${a.pantalon}${a.brillo}${a.pelo}${a.piel}`].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7) % n
