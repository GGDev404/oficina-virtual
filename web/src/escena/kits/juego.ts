// Sprites reales de los juegos: scripts/assets-juegos.py los extrae a escena/juegos/<juego>.json, que no se sube al repo
// (es público; los sprites son de uso personal). Si el archivo no está, datosJuego() da undefined y el tema usa sus kits
// dibujados en código.
import type { Pintar } from '../hornear'

/** Un cuadro: `f` son filas de 2 hex por píxel (índice en `p`; «..» = transparente); el origen (ox, oy) va en los pies. */
export interface SpriteJuego { w: number; h: number; ox: number; oy: number; p: string[]; f: string[] }
export interface DatosJuego { escala: number; sprites: Record<string, SpriteJuego>; pisos: Record<string, string>; muros: Record<string, { src: string; w: number; h: number }> }

const archivos = import.meta.glob<DatosJuego>('../juegos/*.json', { eager: true, import: 'default' })
export const datosJuego = (juego: string): DatosJuego | undefined => archivos[`../juegos/${juego}.json`]

/** Pinta el sprite con los pies en (dx, dy), un rectángulo por tramo de color; `filas` recorta (de arriba hacia abajo). */
export function pintarSprite(r: Pintar, s: SpriteJuego, dx = 0, dy = 0, opc: { alfa?: number; filas?: number; espejo?: boolean } = {}) {
  const a = opc.alfa == null ? '' : Math.round(opc.alfa * 255).toString(16).padStart(2, '0')
  const alto = Math.min(s.h, opc.filas ?? s.h)
  for (let y = 0; y < alto; y++) {
    const fila = s.f[y]
    for (let x = 0; x < s.w;) {
      const k = fila.slice(x * 2, x * 2 + 2)
      let n = 1
      while (x + n < s.w && fila.slice((x + n) * 2, (x + n) * 2 + 2) === k) n++
      if (k !== '..') r(dx + (opc.espejo ? s.ox - x - n : x - s.ox), dy + y - s.oy, n, 1, s.p[parseInt(k, 16)] + a)
      x += n
    }
  }
}

// ── Cozy Space Station (CC-BY 4.0, Bramble & Byte): imágenes ya decodificadas para hornear sin esperar ──
export interface ImagenJuego { src: string; w: number; h: number }
export interface Tripulante { src: string; fw: number; fh: number; img: HTMLImageElement }
const cozyArchivo = datosJuego('cozy') as unknown as { muebles: Record<string, ImagenJuego>; tripulacion: Record<string, Omit<Tripulante, 'img'>> } | undefined
async function cargar(src: string) { const i = new Image(); i.src = src; await i.decode().catch(() => {}); return i }
export const cozy = cozyArchivo && {
  muebles: cozyArchivo.muebles,
  tripulacion: Object.fromEntries(await Promise.all(Object.entries(cozyArchivo.tripulacion).map(async ([k, t]) => [k, { ...t, img: await cargar(t.src) }] as const))) as Record<string, Tripulante>,
}

// ── Fichas (retratos redondos de 160 px; scripts/assets-juegos.py → fichas.json), ya decodificadas ──
const fichasArchivo = datosJuego('fichas') as unknown as { retratos: Record<string, string> } | undefined
export const retratos: Record<string, HTMLImageElement> | undefined = fichasArchivo &&
  Object.fromEntries(await Promise.all(Object.entries(fichasArchivo.retratos).map(async ([k, src]) => [k, await cargar(src)] as const)))
