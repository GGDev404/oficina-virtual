// Escenario del tema «cyberpunk» (contrato en comun.ts). Mientras no tenga uno propio, usa la oficina limpia.
import { limpia, type Escenario } from './comun'

export function escenario(): Escenario { return limpia() }
