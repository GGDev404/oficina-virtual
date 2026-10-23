// Lo que manda el servidor en /api/estado y en el SSE (server/index.js → estadoCompleto). Las banderas de SQLite
// llegan como 0/1.

export type Estado = 'trabajando' | 'necesita_permiso' | 'bloqueado' | 'duda' | 'te_espera' | 'listo_para_revisar'
  | 'sin_señal' | 'cerrada' | 'terminado'

export interface Sesion {
  id: string
  cwd: string | null
  rama_git: string | null
  tarea_id: string | null
  tarea_origen: string | null
  estado: Estado
  estado_desde_ts: number
  ultimo_evento_ts: number
  ultimo_mensaje: string | null
  iniciada_ts: number
  terminada_ts: number | null
  nombre: string | null
  procesos_json: string | null
  permiso_json: string | null
  tmux: string | null
  rol: RolId | null
}

export interface Tarea {
  id: string
  nombre: string
  estado: string | null
  prioridad: string | null
  due_ts: number | null
  lista: string | null
  url: string
  horario: string | null
  choque: string | null
}

export interface Comentario {
  id: string
  tarea_id: string
  autor: string
  texto: string
  ts: number
  es_mio: number
  respondido: number
  visto_local: number
  tipo: 'ficha' | 'correccion' | 'otro'
  para_mi: number
}

export interface Subagente {
  id: number
  sesion_id: string
  tipo: string | null
  descripcion: string | null
  en_fondo: number
  estado: string
  inicio_ts: number
  fin_ts: number | null
}

export interface Viva {
  nombre: string | null
  ocupada: boolean
  esperando: boolean
  bandeja: boolean
  tipo: string
  corto: string | null
}

export interface MensajeOficina {
  id: number
  texto: string
  estado: 'enviando' | 'enviado' | 'error'
  detalle: string | null
  ts: number
}

export interface Contexto {
  tokens: number
  limite: number
  modelo: string | null
}

export interface Permiso {
  id: number
  sid: string
  herramienta: string
  campos: [string, string][]
  vence: number
  reglas: string[]
  destino: string | null
}

export interface PreguntaOpciones {
  pregunta: string
  titulo: string
  multiple: boolean
  opciones: { etiqueta: string; descripcion: string }[]
}

export interface Pregunta {
  id: number
  sid: string
  vence: number
  preguntas: PreguntaOpciones[]
}

export interface Nota {
  id: number
  texto: string
  creado_ts: number
}

export interface Solicitud {
  id: number
  de_sesion: string | null
  nombre: string
  cwd: string
  prompt: string
  permiso: string
  modelo: string
  tarea_id: string | null
  creado_ts: number
}

export type RolId = 'analisis-plan' | 'implementacion' | 'revision-qa' | 'docs-entrega' | 'diseno' | 'integracion'

// Armería (server/aspectos.js): equipo guardado por `rol:<id>`, `sesion:<uuid>` o `yo`.
export type Clase = 'ninguna' | 'spartan' | 'netrunner' | 'marine' | 'bloque'
export interface AspectoGuardado { clase?: Clase; camisa?: string; pelo?: string; piel?: string; pantalon?: string; brillo?: string; apodo?: string }

export interface Rol {
  id: RolId
  titulo: string
  modelo?: string
  permiso?: string
  equipo?: string[]
}

// Mensaje o encargo entre dos sesiones (últimos 50). `de_sesion` es null si el origen no es una sesión conocida (o es la oficina).
export interface EntreSesiones {
  id: number
  ts: number
  de: string | null
  de_sesion: string | null
  a_sesion: string
  texto: string
  tipo: 'mensaje' | 'encargo' | 'entrega' | 'duda' | 'respuesta'
}

// Encargo a la sesión de un rol (últimos 30). `a_sesion` es null mientras la sesión del rol arranca.
export interface Encargo {
  id: number
  rol: RolId
  de_sesion: string | null
  a_sesion: string | null
  cwd: string | null
  texto: string
  estado: 'arrancando' | 'entregando' | 'entregado' | 'respondido' | 'error'
  via: 'tmux' | 'mensajero' | 'nueva' | null
  detalle: string | null
  resultado: string | null
  creado_ts: number
  resuelto_ts: number | null
  cadena: string | null // misión: JSON con los roles que siguen
  mision: number | null
  intento: number
}

export interface Datos {
  sesiones: Sesion[]
  tareas: Tarea[]
  comentarios: Comentario[]
  subagentes: Subagente[]
  pendientes: { sesiones: Sesion[]; notas: Nota[]; solicitudes: Solicitud[] }
  sync: { ultima_ts: number | null; corriendo: boolean; error: string | null }
  vivas: Record<string, Viva>
  mensajes: Record<string, MensajeOficina[]>
  contexto: Record<string, Contexto>
  permisos: Permiso[]
  preguntas: Pregunta[]
  roles: Rol[]
  aspectos?: Record<string, AspectoGuardado>
  gastos?: Record<string, Gasto>
  experiencia?: { rol: RolId; hechos: number; fallos: number; ultimo_ts: number | null }[]
  encargos: Encargo[]
  entre_sesiones: EntreSesiones[]
  worktrees?: Worktree[]
}

// Pizarra: un worktree de tarea con los pasos de su plan, sus commits frente a develop y el turno nocturno (server/worktrees.js).
export interface Worktree {
  id: string // ID de ClickUp si lo hay; si no, la carpeta
  nombre: string
  ruta: string
  rama: string | null
  repo: string
  titulo: string | null
  plan: string | null
  pasos: { estado: 'hecho' | 'progreso' | 'falta'; texto: string }[]
  commits: number
  ultimos: { ts: number; texto: string }[]
  ultimo_ts: number | null
  sin_commit: number
  noche: { fecha: string; estado: string | null; corriendo: boolean; reporte: string | null } | null
}

export interface Intercambio {
  rol: 'tu' | 'agente' | 'mensaje' | 'sistema'
  texto: string
  ts: number | null
}

export interface Memoria {
  nivel: 'bien' | 'alto' | 'critico'
  total: number
  disponible: number
  swapTotal: number
  swapLibre: number
  sesiones: { id: string; nombre: string | null; mb: number; pausada: boolean }[]
}

export interface Yo {
  entrado?: boolean
  frase: boolean
  nombre?: string | null
}

// Tokens que lleva gastados una sesión (server/conversacion.js → leerGasto). cache_pct: parte de la entrada que salió de caché.
export interface Gasto { entrada: number; cache_leida: number; cache_creada: number; salida: number; respuestas: number; cache_pct: number | null }
