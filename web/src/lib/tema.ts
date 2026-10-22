// Tema de la página: auto (sigue al sistema), claro, oscuro o uno de juego. Se guarda en este navegador.
// html[data-tema] elige los valores (oficina.css) y html[data-modo] el modo claro u oscuro que usan light-dark() y dark:.
export const TEMAS = {
  auto: { titulo: 'Automático', modo: null },
  claro: { titulo: 'Claro', modo: 'claro' },
  oscuro: { titulo: 'Oscuro', modo: 'oscuro' },
  halo: { titulo: 'Halo · UNSC', modo: 'oscuro' },
  cyberpunk: { titulo: 'Cyberpunk · Night City', modo: 'oscuro' },
  doom: { titulo: 'DOOM · Infierno', modo: 'oscuro' },
  minecraft: { titulo: 'Minecraft · Bloques', modo: 'claro' },
} as const
export type TemaId = keyof typeof TEMAS
const CLAVE = 'oficina-tema'
const sistema = matchMedia('(prefers-color-scheme: dark)')

export function temaGuardado(): TemaId {
  try { const t = localStorage.getItem(CLAVE); if (t && t in TEMAS) return t as TemaId } catch { /* sin almacenamiento: auto */ }
  return 'auto'
}
export function aplicarTema(t: TemaId) {
  const html = document.documentElement
  if (t === 'auto') delete html.dataset.tema; else html.dataset.tema = t
  html.dataset.modo = TEMAS[t].modo ?? (sistema.matches ? 'oscuro' : 'claro')
  try { localStorage.setItem(CLAVE, t) } catch { /* solo dura esta visita */ }
  dispatchEvent(new Event('oficina-tema'))
}
sistema.addEventListener('change', () => { if (temaGuardado() === 'auto') aplicarTema('auto') })
