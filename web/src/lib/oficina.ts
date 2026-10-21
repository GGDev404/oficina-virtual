// Datos y utilidades de la oficina, sin DOM: lo mismo que usaba public/index.html.
import type { Contexto, Datos, Sesion, Tarea } from './tipos'

export const ESTADOS: Record<string, [string, string]> = {
  necesita_permiso: ['Necesita permiso', 'rojo'], bloqueado: ['Bloqueado', 'rojo'],
  duda: ['Duda', 'naranja'], te_espera: ['Te espera', 'naranja'],
  listo_para_revisar: ['Listo para revisar', 'amarillo'], trabajando: ['Trabajando', 'verde'],
  sin_señal: ['Sin señal', ''], cerrada: ['Cerrada', ''], terminado: ['Terminado', ''],
}
export const PRIORIDAD: Record<string, [string, string]> = { urgent: ['Urgente', 'rojo'], high: ['Alta', 'naranja'], normal: ['Normal', ''], low: ['Baja', ''] }
export const URGENCIA: Record<string, number> = { necesita_permiso: 0, bloqueado: 1, duda: 2, te_espera: 3 }
export const MAX_ACTIVOS = 3 // regla del sprint: máximo 3 agentes vivos
// Cortes del día (plan del Sprint 02): daily, seguimientos de ClickUp e integración a develop.
const CORTES: [string, string][] = [['09:00', 'Daily'], ['09:35', 'Seguimiento de ClickUp'], ['13:00', 'Integración a develop'],
  ['13:35', 'Seguimiento de ClickUp'], ['17:35', 'Seguimiento de ClickUp'], ['18:00', 'Integración a develop']]
// Estados con personaje en la escena (las sesiones vivas).
export const VIVOS = new Set(['trabajando', 'necesita_permiso', 'duda', 'te_espera', 'bloqueado', 'listo_para_revisar', 'sin_señal'])

export function hace(ts: number | null | undefined) {
  if (!ts) return ''
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'hace un momento'
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h ${m % 60 ? `${m % 60} min` : ''}`.trim()
  return `hace ${Math.floor(h / 24)} d`
}
export const horaDe = (ts: number) => new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
export const fecha = (ts: number) => new Date(ts).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const diaLargo = (ts: number) => new Date(ts).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' })
export const carpeta = (cwd: string | null | undefined) => (cwd ?? '').split('/').filter(Boolean).slice(-2).join('/')
export const base = (cwd: string | null | undefined) => (cwd ?? '').split('/').filter(Boolean).at(-1) ?? ''
export const inicioDia = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return +d }
export const DIA = 86400000
export const tareaPorId = (d: Datos): Record<string, Tarea> => Object.fromEntries(d.tareas.map((t) => [t.id, t]))
export const plano = (t: string | null | undefined) => String(t ?? '').replace(/```[\s\S]*?```/g, ' [código] ').replace(/\*\*|[`#>|]/g, '').replace(/^\s*[-*•]\s+/gm, '· ').replace(/\s+/g, ' ').trim()

// Ventana de contexto: tokens que ocupó la última respuesta frente al límite de su modelo.
export function nivelContexto(c: Contexto | undefined) {
  if (!c) return null
  const pct = c.tokens / c.limite
  return { pct, clase: pct >= 0.95 ? 'lleno' : pct >= 0.8 ? 'medio' : '' }
}
// Texto legible sobre un color: el de mayor contraste entre oscuro y blanco.
export function textoSobre(hex: string) {
  const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const [rr, gg, bb] = [1, 3, 5].map((k) => lin(parseInt(hex.slice(k, k + 2), 16)))
  const L = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb
  return (L + 0.05) / 0.06 >= 1.05 / (L + 0.05) ? '#1a1922' : '#ffffff'
}
export const pendientesParaMi = (d: Datos) => d.comentarios.filter((c) => !c.es_mio && c.para_mi && !c.respondido && !c.visto_local)
export interface Proceso { tipo: string; descripcion?: string; agente?: string }
export const procesosDe = (s: Sesion): Proceso[] => { try { return JSON.parse(s.procesos_json ?? 'null') ?? [] } catch { return [] } }
export const nombreSesion = (s: Sesion, tareas: Record<string, Tarea>) => s.nombre ?? (s.tarea_id && tareas[s.tarea_id]?.nombre) ?? (carpeta(s.cwd) || s.id.slice(0, 8))
// Esperando procesos: trabajando, con shells o subagentes en fondo y la sesión libre (su turno ya terminó).
export const esperaProcesos = (s: Sesion, d: Datos) => s.estado === 'trabajando' && procesosDe(s).length > 0 && d.vivas?.[s.id]?.ocupada !== true
export const colaUrgente = (d: Datos) => d.sesiones.filter((s) => s.estado in URGENCIA)
  .sort((a, b) => URGENCIA[a.estado] - URGENCIA[b.estado] || a.estado_desde_ts - b.estado_desde_ts)
export const permisoPendiente = (d: Datos | null, sid: string) => (d?.permisos ?? []).filter((p) => p.sid === sid).at(-1) ?? null
export const preguntaPendiente = (d: Datos | null, sid: string) => (d?.preguntas ?? []).filter((p) => p.sid === sid).at(-1) ?? null

// ── Tareas: cuándo vencen ──
export const GRUPOS = ['Vencidas', 'Hoy', 'Mañana', 'Esta semana', 'Después', 'Sin fecha'] as const
export function grupoDe(t: Tarea, ahora = Date.now()): (typeof GRUPOS)[number] {
  if (t.due_ts == null) return 'Sin fecha'
  const hoy = inicioDia(ahora)
  if (t.due_ts < ahora) return 'Vencidas'
  if (t.due_ts < hoy + DIA) return 'Hoy'
  if (t.due_ts < hoy + 2 * DIA) return 'Mañana'
  if (t.due_ts < hoy + 7 * DIA) return 'Esta semana'
  return 'Después'
}
export function cuandoVence(t: Tarea): [string, string] {
  if (t.due_ts == null) return ['sin fecha', '']
  const g = grupoDe(t), hora = horaDe(t.due_ts)
  if (g === 'Vencidas') return [`vencida · ${fecha(t.due_ts)}`, 'vencida']
  if (g === 'Hoy') return [`hoy ${hora}`, 'hoy']
  if (g === 'Mañana') return [`mañana ${hora}`, '']
  return [fecha(t.due_ts), '']
}
export function veredicto(d: Datos) {
  const ahora = Date.now(), finHoy = inicioDia(ahora) + DIA
  const vencidas = d.tareas.filter((t) => t.due_ts != null && t.due_ts < ahora).sort((a, b) => a.due_ts! - b.due_ts!)
  const hoy = d.tareas.filter((t) => t.due_ts != null && t.due_ts >= ahora && t.due_ts < finHoy).sort((a, b) => a.due_ts! - b.due_ts!)
  if (vencidas.length) return { texto: `${vencidas.length} vencida${vencidas.length > 1 ? 's' : ''}`, color: 'rojo', vencidas, hoy }
  if (hoy.length) return { texto: `${hoy.length} vence${hoy.length > 1 ? 'n' : ''} hoy · la primera a las ${horaDe(hoy[0].due_ts!)}`, color: 'naranja', vencidas, hoy }
  return { texto: 'Al día: nada vence hoy', color: 'verde', vencidas, hoy }
}
export function proximoCorte(ahora = new Date()) {
  const dia = ahora.getDay()
  if (dia === 0 || dia === 6) return null // fin de semana
  const minutos = ahora.getHours() * 60 + ahora.getMinutes()
  for (const [hora, nombre] of CORTES) {
    const [h, m] = hora.split(':').map(Number)
    if (h * 60 + m > minutos) return { hora, nombre, faltan: h * 60 + m - minutos }
  }
  return null
}
// «F1-COM-07 · C3.5 · Entregas parciales…» → código «F1-COM-07 · C3.5» y nombre «Entregas parciales…».
export function partesTarea(nombre: string | null | undefined) {
  const partes = String(nombre ?? '').split(' · ')
  let n = 0
  while (n < partes.length - 1 && partes[n].length <= 16 && /^[\p{L}\d.\-]+( [\p{L}\d.\-]+)?$/u.test(partes[n])) n++
  return { codigo: partes.slice(0, n).join(' · '), titulo: partes.slice(n).join(' · ') }
}

// claude-opus-5-5 → «Opus 5.5»; lo que no siga ese formato se muestra tal cual.
export const nombreModelo = (id: string) => {
  const m = id.match(/^claude-([a-z]+)-(\d+)-(\d+)/)
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : id
}
// Duración legible desde un instante: «22 min», «1 h 5 min».
export function duracion(ts: number) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (m < 1) return 'ahora'
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`
}
export const miles = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`)
export const gb = (kb: number) => `${(kb / 1048576).toFixed(1)} GB`

// Procesos en segundo plano: nombre corto, a dónde escribe su log (si lo manda a un .log) y de qué tipo es.
export function infoProceso(p: Proceso) {
  const d = p.descripcion || ''
  if (p.tipo === 'subagent') return { nombre: d || 'subagente', sub: p.agente ? `Subagente · ${p.agente}` : 'Subagente', marca: 'agente', punto: 'azul', log: null, comando: null }
  const log = d.match(/>{1,2}\s*(\S+\.log)\b/)?.[1] ?? null
  const comando = /^[\w./~$-]+(\s|$)/.test(d) && /[/\s]-|\//.test(d)
  return { nombre: comando ? base(d.split(/\s+/)[0]) : d || 'comando', sub: log ? `Escribe en ${base(log)}` : comando ? d : 'Comando en segundo plano',
    marca: 'shell', punto: 'verde', log, comando: d }
}
