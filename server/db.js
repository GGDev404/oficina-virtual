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
`;

// Columnas agregadas después de la v1: se suman a bases que ya existían.
const COLUMNAS_NUEVAS = [
  ['sesiones', 'nombre TEXT'],
  ['sesiones', 'procesos_json TEXT'],
  ['comentarios', 'para_mi INTEGER NOT NULL DEFAULT 0'],
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
  };
}
