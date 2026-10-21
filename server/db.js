// Esquema SQLite de la oficina (node:sqlite, sin dependencias).
import { DatabaseSync } from 'node:sqlite';

const ESQUEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS sesiones (
  id TEXT PRIMARY KEY,
  cwd TEXT, transcript_path TEXT, permission_mode TEXT, rama_git TEXT,
  tarea_id TEXT, tarea_origen TEXT,
  estado TEXT NOT NULL, estado_desde_ts INTEGER NOT NULL,
  ultimo_evento_ts INTEGER NOT NULL, ultimo_mensaje TEXT, ultimo_prompt TEXT,
  iniciada_ts INTEGER NOT NULL, terminada_ts INTEGER, fin_razon TEXT
);
CREATE TABLE IF NOT EXISTS subagentes (
  id INTEGER PRIMARY KEY,
  agent_id TEXT UNIQUE, tool_use_id TEXT UNIQUE,
  sesion_id TEXT NOT NULL, tipo TEXT, descripcion TEXT, en_fondo INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL, ultimo_mensaje TEXT, inicio_ts INTEGER NOT NULL, fin_ts INTEGER
);
CREATE INDEX IF NOT EXISTS subagentes_sesion ON subagentes (sesion_id);
CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY, sesion_id TEXT, tipo TEXT, ts INTEGER NOT NULL, payload_json TEXT
);
CREATE INDEX IF NOT EXISTS eventos_ts ON eventos (ts);
CREATE TABLE IF NOT EXISTS tareas (
  id TEXT PRIMARY KEY, nombre TEXT, estado TEXT, prioridad TEXT, due_ts INTEGER,
  lista TEXT, url TEXT, horario TEXT, choque TEXT, actualizada_ts INTEGER
);
CREATE TABLE IF NOT EXISTS comentarios (
  id TEXT PRIMARY KEY, tarea_id TEXT, parent_id TEXT, autor_id TEXT, autor TEXT, texto TEXT,
  ts INTEGER, es_mio INTEGER NOT NULL DEFAULT 0, respondido INTEGER NOT NULL DEFAULT 0,
  visto_local INTEGER NOT NULL DEFAULT 0,
  tipo TEXT CHECK (tipo IN ('ficha', 'correccion', 'instruccion', 'otro'))
);
CREATE TABLE IF NOT EXISTS pendientes (
  id INTEGER PRIMARY KEY, texto TEXT NOT NULL, creado_ts INTEGER NOT NULL, hecho_ts INTEGER
);
-- Navegadores donde entraste con tu frase: solo el sha256 de la cookie.
CREATE TABLE IF NOT EXISTS web_sesiones (hash TEXT PRIMARY KEY, creado_ts INTEGER NOT NULL, vence_ts INTEGER NOT NULL);
-- Sesiones que un agente pidió abrir; se abren solo si las apruebas en la página.
CREATE TABLE IF NOT EXISTS solicitudes (
  id INTEGER PRIMARY KEY, de_sesion TEXT, nombre TEXT, cwd TEXT NOT NULL, prompt TEXT NOT NULL, permiso TEXT NOT NULL,
  modelo TEXT, tarea_id TEXT, creado_ts INTEGER NOT NULL, estado TEXT NOT NULL DEFAULT 'pendiente', resuelto_ts INTEGER
);
-- Mensajes entre sesiones (cross-session-message / agent-message) y encargos a las sesiones por rol.
CREATE TABLE IF NOT EXISTS entre_sesiones (
  id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, de TEXT, de_sesion TEXT, a_sesion TEXT NOT NULL, texto TEXT,
  tipo TEXT NOT NULL DEFAULT 'mensaje'
);
CREATE TABLE IF NOT EXISTS encargos (
  id INTEGER PRIMARY KEY, rol TEXT NOT NULL, de_sesion TEXT, a_sesion TEXT, cwd TEXT, texto TEXT NOT NULL,
  estado TEXT NOT NULL, via TEXT, detalle TEXT, resultado TEXT, creado_ts INTEGER NOT NULL, resuelto_ts INTEGER
);
`;

// Columnas agregadas después de la v1: se suman a bases que ya existían.
const COLUMNAS_NUEVAS = [
  ['sesiones', 'nombre TEXT'],
  ['sesiones', 'procesos_json TEXT'],
  ['sesiones', 'permiso_json TEXT'],
  ['comentarios', 'para_mi INTEGER NOT NULL DEFAULT 0'],
  ['sesiones', 'pendiente INTEGER NOT NULL DEFAULT 0'], // murió sin cerrarse: espera Retomar o Descartar
  ['sesiones', 'tmux TEXT'], // socket de su tmux (`tmux -L`) si la abrió la oficina: ahí se teclean tus mensajes
  ['sesiones', 'rol TEXT'], // sesión fija de un rol (agentes/<rol>.md): recibe encargos
];

export function abrir(ruta) {
  const db = new DatabaseSync(ruta);
  db.exec(ESQUEMA);
  for (const [tabla, columna] of COLUMNAS_NUEVAS) {
    try { db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna}`); }
    catch (e) { if (!/duplicate column/.test(e.message)) throw e; }
  }
  return db;
}

// Todo lo que pinta la página. Las sesiones cerradas se ocultan después de 2 h.
export function estado(db, ahora = Date.now()) {
  const sesiones = db.prepare(
    `SELECT * FROM sesiones WHERE estado <> 'cerrada' OR terminada_ts > ? ORDER BY ultimo_evento_ts DESC`
  ).all(ahora - 2 * 3600_000);
  const ids = new Set(sesiones.map((s) => s.id));
  const subagentes = db.prepare('SELECT * FROM subagentes ORDER BY inicio_ts').all()
    .filter((a) => ids.has(a.sesion_id));
  return {
    ahora,
    sesiones,
    subagentes,
    tareas: db.prepare('SELECT * FROM tareas ORDER BY due_ts IS NULL, due_ts').all(),
    comentarios: db.prepare('SELECT * FROM comentarios ORDER BY ts DESC').all(),
    entre_sesiones: db.prepare('SELECT id, ts, de, de_sesion, a_sesion, substr(texto, 1, 300) AS texto, tipo FROM entre_sesiones ORDER BY id DESC LIMIT 50').all().reverse(),
    encargos: db.prepare(`SELECT id, rol, de_sesion, a_sesion, cwd, substr(texto, 1, 300) AS texto, estado, via, detalle,
                          substr(resultado, 1, 600) AS resultado, creado_ts, resuelto_ts FROM encargos ORDER BY id DESC LIMIT 30`).all().reverse(),
    pendientes: {
      sesiones: db.prepare(`SELECT id, nombre, cwd, tarea_id, ultimo_mensaje, terminada_ts FROM sesiones
                            WHERE pendiente = 1 AND estado = 'cerrada' ORDER BY terminada_ts DESC`).all(),
      notas: db.prepare('SELECT * FROM pendientes WHERE hecho_ts IS NULL ORDER BY creado_ts').all(),
      solicitudes: db.prepare(`SELECT * FROM solicitudes WHERE estado = 'pendiente' ORDER BY creado_ts`).all(),
    },
  };
}
