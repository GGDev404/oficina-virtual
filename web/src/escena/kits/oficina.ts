// Kit «oficina»: persona redondeada y plana, sin contornos, corbata del color del brillo. Es el de Claro/Oscuro/Automático
// y el de reserva de cualquier tema que no reparta a alguien. Sirve de ejemplo del contrato de rig.ts.
import { color, nodo, PROPS, type KitVector } from '../rig'
import { aclarar, oscurecer } from '../sprites'

export const oficina: KitVector = {
  dibujar: ({ aspecto: a, vista }) => {
    const camisa = color(a.camisa, '#336fc6'), pelo = color(a.pelo, '#2b1d14'), piel = color(a.piel, '#f1c7a3')
    const pantalon = color(a.pantalon, '#30364a'), brillo = color(a.brillo, '#ffd84a')
    const sombra = oscurecer(camisa), luz = aclarar(camisa, 0.18), pielSombra = oscurecer(piel, 0.88), zapato = '#1b1a22', tinta = '#1e1b26'
    const raiz = nodo('g', {}, undefined, 'pj')
    const espalda = vista === 'espalda'
    nodo('ellipse', { cx: 0, cy: -0.4, rx: 7, ry: 1.6, fill: '#000', opacity: 0.25 }, raiz, 'sombra')
    const f = nodo('g', espalda ? { transform: 'translate(0 3.5)' } : {}, raiz, 'asiento') // sentado: baja el cuerpo
    if (espalda) { // respaldo de la silla, con su brillo
      nodo('rect', { x: -7.5, y: -17, width: 15, height: 15, rx: 3, fill: '#323a4c' }, f, 'silla')
      nodo('rect', { x: -6.5, y: -16.2, width: 13, height: 1.4, rx: 0.7, fill: '#46516b' }, f)
    } else for (const lado of ['i', 'd']) {
      const x = lado === 'i' ? -3.6 : 0.6
      const p = nodo('g', {}, f, `pierna ${lado}`)
      nodo('rect', { x, y: -8, width: 3, height: 6.6, rx: 1.3, fill: pantalon }, p)
      nodo('ellipse', { cx: x + 1.5, cy: -1.4, rx: 2.1, ry: 1.2, fill: zapato }, p)
      nodo('ellipse', { cx: x + 1.1, cy: -1.9, rx: 0.9, ry: 0.35, fill: '#fff', opacity: 0.18 }, p)
    }
    const cuerpo = nodo('g', {}, f, 'cuerpo')
    const brazo = (lado: 'i' | 'd') => { // pivote en el hombro (arriba al centro de su caja)
      const x = lado === 'i' ? -7.9 : 5.4
      const b = nodo('g', {}, cuerpo, `brazo ${lado}`)
      nodo('rect', { x, y: -15, width: 2.5, height: 8, rx: 1.25, fill: camisa }, b)
      nodo('rect', { x: x + (lado === 'i' ? 0 : 1.5), y: -14.4, width: 1, height: 6.6, rx: 0.5, fill: lado === 'i' ? luz : sombra, opacity: 0.6 }, b)
      nodo('circle', { cx: x + 1.25, cy: -6.6, r: 1.5, fill: piel }, b)
      return b
    }
    const izq = brazo('i')
    nodo('rect', { x: -5.2, y: -16, width: 10.4, height: 10, rx: 3.2, fill: camisa }, cuerpo, 'torso')
    nodo('rect', { x: -5.2, y: -8, width: 10.4, height: 2, rx: 1, fill: sombra }, cuerpo)
    if (!espalda) {
      nodo('rect', { x: -5.2, y: -8.6, width: 10.4, height: 1, fill: oscurecer(pantalon, 0.8) }, cuerpo) // cinturón
      nodo('rect', { x: -0.7, y: -8.7, width: 1.4, height: 1.2, rx: 0.2, fill: '#c9a24a' }, cuerpo)
      nodo('path', { d: 'M-2.2-16l2.2 2.4 2.2-2.4 1 1.6-3.2 2.8-3.2-2.8z', fill: '#f4f1ea' }, cuerpo) // cuello y corbata
      nodo('path', { d: 'M0-13.6l-.9 1 .6 4.4.3.4.3-.4.6-4.4z', fill: brillo }, cuerpo)
      nodo('path', { d: 'M-.9-12.6l.9-1 .9 1z', fill: oscurecer(brillo, 0.75) }, cuerpo)
    } else nodo('rect', { x: -5.2, y: -16, width: 10.4, height: 1.4, rx: 0.7, fill: oscurecer(camisa, 0.9) }, cuerpo)
    brazo('d')
    const cab = nodo('g', {}, cuerpo, 'cabeza')
    nodo('rect', { x: -1.6, y: -17, width: 3.2, height: 3, fill: pielSombra }, cab)
    if (!espalda) for (const x of [-5.3, 5.3]) nodo('circle', { cx: x, cy: -19.6, r: 1.1, fill: pielSombra }, cab) // orejas
    nodo('circle', { cx: 0, cy: -20, r: 5.2, fill: espalda ? pelo : piel }, cab)
    if (espalda) {
      nodo('path', { d: 'M-4.2-17.4q4.2 2.6 8.4 0', fill: 'none', stroke: oscurecer(pelo, 0.8), 'stroke-width': 0.8, 'stroke-linecap': 'round' }, cab)
      nodo('path', { d: 'M-2.6-23.6q2-1.2 4 0', fill: 'none', stroke: aclarar(pelo, 0.25), 'stroke-width': 0.7, 'stroke-linecap': 'round' }, cab)
    } else {
      nodo('path', { d: 'M-5.4-20.4C-5.8-26.4 5.8-26.4 5.4-20.4 3.6-22.6-.6-22.6-5.4-20.4z', fill: pelo }, cab)
      nodo('path', { d: 'M-2.8-24.2q2.2-1 4.4-.2', fill: 'none', stroke: aclarar(pelo, 0.25), 'stroke-width': 0.6, 'stroke-linecap': 'round' }, cab)
      for (const x of [-2, 2]) nodo('path', { d: `M${x - 1}-21.1h2`, stroke: oscurecer(pelo, 0.9), 'stroke-width': 0.5, 'stroke-linecap': 'round' }, cab) // cejas
      const ojos = nodo('g', {}, cab, 'ojos')
      for (const x of [-2, 2]) {
        nodo('circle', { cx: x, cy: -19.4, r: 0.75, fill: tinta }, ojos)
        nodo('circle', { cx: x + 0.25, cy: -19.65, r: 0.22, fill: '#fff' }, ojos)
      }
      for (const x of [-2, 2]) nodo('path', { d: `M${x - 1}-19.4q1 .9 2 0`, fill: 'none', stroke: tinta, 'stroke-width': 0.6, 'stroke-linecap': 'round' }, cab, 'ojo-cerrado')
      for (const x of [-3.4, 3.4]) nodo('circle', { cx: x, cy: -18, r: 0.8, fill: '#e8806a', opacity: 0.25 }, cab) // mejillas
      nodo('path', { d: 'M-1.2-17.2q1.2 .9 2.4 0', fill: 'none', stroke: '#8b5a44', 'stroke-width': 0.6, 'stroke-linecap': 'round' }, cab, 'boca-s')
      nodo('path', { d: 'M-1.2-16.6q1.2-.9 2.4 0', fill: 'none', stroke: '#8b5a44', 'stroke-width': 0.6, 'stroke-linecap': 'round' }, cab, 'boca-t')
    }
    // Rasgo del rol: en la mano izquierda (se mueve con el brazo) al estar de pie; asoma junto a la silla al estar sentado.
    if (a.rol) PROPS[a.rol]?.(espalda ? nodo('g', { transform: 'translate(-9.4 -4)' }, f, 'prop') : nodo('g', { transform: 'translate(-6.7 -6.4)' }, izq, 'prop'))
    // Extras de cada pose (animacion.ts los muestra según la pose).
    const extra = nodo('g', {}, f, 'extra')
    const carpeta = nodo('g', {}, extra, 'carpeta')
    nodo('rect', { x: -4.2, y: -13, width: 8.4, height: 6.6, rx: 0.9, fill: '#e0a526' }, carpeta)
    nodo('path', { d: 'M-4.2-12.2h3l.8-1.2h4.4', fill: 'none', stroke: '#c78a10', 'stroke-width': 0.9 }, carpeta)
    nodo('path', { d: 'M-2.4-9.6h4.8M-2.4-8h3', stroke: '#fff', 'stroke-width': 0.6, 'stroke-linecap': 'round' }, carpeta)
    const taza = nodo('g', {}, extra, 'taza')
    nodo('rect', { x: 5.2, y: -10.8, width: 3.2, height: 3.8, rx: 0.8, fill: '#f4f1ea' }, taza)
    nodo('path', { d: 'M8.4-10h.7c.8 0 .8 1.8 0 1.8h-.7', fill: 'none', stroke: '#f4f1ea', 'stroke-width': 0.7 }, taza)
    nodo('rect', { x: 5.2, y: -10.8, width: 3.2, height: 0.9, fill: '#6b3e1f' }, taza)
    for (const [i, x] of [6.1, 7.5].entries()) nodo('path', { d: `M${x}-12q-.9-1 0-2 .9-1 0-2`, fill: 'none', stroke: '#fff', 'stroke-width': 0.6, 'stroke-linecap': 'round', opacity: 0.8 }, taza, `vapor v${i}`)
    for (const [i, [x, y]] of ([[4, -25], [6.8, -27.6], [9.4, -30]] as const).entries())
      nodo('path', { d: `M${x} ${y}h2.6l-2.6 2.8h2.6`, fill: 'none', stroke: '#6b7a99', 'stroke-width': 0.8, 'stroke-linejoin': 'round' }, extra, `zz z${i}`)
    for (const i of [0, 1, 2]) nodo('circle', { cx: 6 + i * 2.4, cy: -26, r: 0.8, fill: '#6b7a99' }, extra, `punto p${i}`)
    return raiz
  },
}
