// Lo que actúa en tu nombre va con la cookie de este navegador (entras una vez con tu frase; dura 30 días).
let alNoAutorizado = () => {}
export const siNoAutorizado = (fn: () => void) => { alNoAutorizado = fn }

export async function post<T = unknown>(url: string, cuerpo?: unknown): Promise<T | null> {
  const r = await fetch(url, { method: 'POST', body: JSON.stringify(cuerpo ?? {}), headers: { 'Content-Type': 'application/json' } })
  if (r.status === 401) alNoAutorizado()
  if (!r.ok && r.status !== 202) throw new Error((await r.json().catch(() => ({}))).error ?? `Error ${r.status}`)
  return r.status === 204 ? null : r.json().catch(() => null)
}
export const postSeguro = (url: string, cuerpo?: unknown) => post(url, cuerpo).catch((e: Error) => alert(e.message))

export async function leer<T>(url: string): Promise<T> {
  const r = await fetch(url)
  return r.json()
}

export const rutaSesion = (sid: string, resto: string) => `/api/sesiones/${encodeURIComponent(sid)}/${resto}`
