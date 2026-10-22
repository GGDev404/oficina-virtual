// Solo desarrollo (Escena.tsx lo importa detrás de import.meta.env.DEV): `/?demo=20` pinta N sesiones falsas repartidas por
// todos los estados, con roles, subagentes y procesos, para medir el rendimiento de la escena. `&ciclo=5` las baraja cada 5 s
// para que caminen. No toca el servidor ni lo guardado.
import type { Datos, Estado, RolId, Sesion } from '@/lib/tipos'

const ESTADOS: Estado[] = ['trabajando', 'necesita_permiso', 'trabajando', 'duda', 'te_espera', 'trabajando', 'bloqueado', 'listo_para_revisar', 'trabajando', 'sin_señal']
const ROLES: (RolId | null)[] = ['analisis-plan', null, 'implementacion', 'revision-qa', null, 'diseno', 'docs-entrega', 'integracion', null]

export function datosDemo(n: number, vuelta = 0): Datos {
  const sesiones = Array.from({ length: n }, (_, i): Sesion => ({
    id: `demo-${i}`, cwd: `/demo/proyecto-${i}`, rama_git: 'main', tarea_id: null, tarea_origen: null,
    estado: ESTADOS[(i + vuelta) % ESTADOS.length], estado_desde_ts: i, ultimo_evento_ts: i, ultimo_mensaje: null, iniciada_ts: i, terminada_ts: null,
    nombre: `Demo ${i + 1}`, procesos_json: i % 7 === 0 ? JSON.stringify([{ tipo: 'shell' }]) : null, permiso_json: null, tmux: null, rol: ROLES[i % ROLES.length],
  }))
  return {
    sesiones, tareas: [], comentarios: [], pendientes: { sesiones: [], notas: [], solicitudes: [] }, sync: { ultima_ts: null, corriendo: false, error: null },
    vivas: {}, permisos: [], preguntas: [], roles: [], encargos: [],
    // Desde la segunda tanda: un mensaje tuyo a demo-1 (sale tu mensajero) y un sobre entre sesiones, para ver caminar y entregar.
    mensajes: vuelta ? { 'demo-1': [{ id: vuelta, texto: 'demo', estado: 'enviado', detalle: null, ts: 0 }] } : {},
    entre_sesiones: vuelta ? [{ id: vuelta, ts: 0, de: null, de_sesion: 'demo-2', a_sesion: 'demo-5', texto: 'demo', tipo: (['mensaje', 'encargo', 'entrega', 'duda', 'respuesta'] as const)[vuelta % 5] }] : [],
    subagentes: sesiones.filter((_, i) => i % 3 === 0).flatMap((s) => Array.from({ length: 1 + (s.iniciada_ts % 3) }, (_, k) => ({
      id: s.iniciada_ts * 10 + k, sesion_id: s.id, tipo: null, descripcion: null, en_fondo: 0, estado: 'trabajando', inicio_ts: 0, fin_ts: null,
    }))),
    contexto: Object.fromEntries(sesiones.map((s, i) => [s.id, { tokens: (i * 9000) % 200000, limite: 200000, modelo: 'claude-sonnet-5-5' }])),
  } as unknown as Datos
}
