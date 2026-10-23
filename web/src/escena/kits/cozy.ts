// Tripulación de "Cozy Space Station" (Bramble & Byte, CC-BY 4.0; ver CREDITS.md) para la oficina limpia de Claro/Oscuro.
// La hoja trae 4 cuadros por fila: caminar de frente, de espaldas, quieto (parpadea en el 3), izquierda y derecha. Las poses
// que la hoja no tiene se arman con el vaivén del cuerpo y los extras del motor de pixel (zZ, «…», carpeta, rasgo del rol).
// Cada quien viste el uniforme más parecido a su color de camisa guardado.
import type { KitPixel, Ritmo } from '../rig'
import type { Pose } from '../sprites'
import { cozy } from './juego'
import { at, mapa, PROP, puntos, zeta, type P } from './pixel'

const UNIFORMES: Record<string, string> = {
  'crew-teal': '#2f8a80', 'crew-navy': '#2f4f7a', 'crew-plum': '#7a4a6a', 'crew-slate': '#4a5560',
  'crew-gray': '#8a8f96', 'crew-bridge-white': '#e8ecef', 'crew-lab-coat': '#f4f4f0', 'crew-commander-red': '#b5402e',
}
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
function uniforme(camisa: string) {
  const c = rgb(/^#[0-9a-f]{6}$/i.test(camisa) ? camisa : '#2f8a80')
  let mejor = 'crew-teal', d = Infinity
  for (const [k, u] of Object.entries(UNIFORMES)) {
    const e = rgb(u).reduce((s, v, i) => s + (v - c[i]) ** 2, 0)
    if (e < d) { d = e; mejor = k }
  }
  return mejor
}
// Fila y cuadros de la hoja por pose (fila 0 frente, 1 espalda, 2 quieto).
const CUADROS: Record<Pose, [number, number[]]> = {
  parado: [2, [0, 1, 2, 3]], camina: [0, [0, 1, 2, 3]], teclea: [1, [0, 2, 0, 2]], espera: [1, [0, 0, 0, 0]], mano: [2, [0, 0, 0, 0]],
  triste: [2, [0, 2]], duerme: [2, [2, 2, 2]], entrega: [2, [0, 0]], cafe: [2, [0, 1, 0, 3]],
}
const RITMOS: Partial<Record<Pose, Ritmo>> = {
  parado: { cuadros: 4, dur: 1.4, pesos: [6, 1, 1, 6], vaiven: 'reposo' }, camina: { cuadros: 4, dur: 0.5 }, mano: { cuadros: 4, dur: 0.8, vaiven: 'alza' },
}

export const tripulacion: KitPixel | null = cozy ? {
  nombre: 'Tripulante', usa: ['camisa'], ritmos: RITMOS,
  pintar: (r, pz, f) => {
    const t = cozy!.tripulacion[uniforme(pz.aspecto.camisa)], pose = pz.pose, [fila, cs] = CUADROS[pose], col = cs[f] ?? cs[0]
    if (!t || !r.imagen) return
    const x = -t.fw / 2, sentado = pose === 'teclea' || pose === 'espera'
    // La hoja es 2x: el recorte va en px de imagen, el destino en px lógicos. Los pies (y la sombra) quedan 4 px sobre el
    // borde de abajo del cuadro; sentado se ve hasta la cintura, sobre el respaldo.
    const alto = sentado ? Math.round(t.fh * 0.56) : t.fh, y = sentado ? 4 - t.fh + 6 : 4 - t.fh
    r.imagen(t.img, col * t.fw * 2, fila * t.fh * 2, t.fw * 2, alto * 2, x, y, t.fw, alto)
    const p: P = r
    if (sentado) { p(-8, -9, 16, 7, '#5b6573'); p(-8, -9, 16, 1, '#8a94a3'); p(-7, -2, 2, 2, '#3b4250'); p(5, -2, 2, 2, '#3b4250') } // respaldo de la silla
    if (pose === 'espera') puntos(p, 7, -24, f)
    if (pose === 'duerme') zeta(p, 6, -26, f)
    if (pose === 'entrega') mapa(at(p, -6, -15), 12)
    if (pz.aspecto.rol && !sentado && pose !== 'entrega') PROP[pz.aspecto.rol](at(p, -9, -11))
  },
} : null
