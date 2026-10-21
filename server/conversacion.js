// Últimos intercambios de una sesión, leídos del final de su transcript (JSONL de Claude Code).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROYECTOS = path.join(os.homedir(), '.claude', 'projects') + path.sep;
// Se lee el final del transcript y, si ahí no aparece ningún prompt tuyo, se amplía (las imágenes pesan mucho).
const COLAS = [1, 4, 16].map((mb) => mb * 1024 * 1024);
const SISTEMA = /^\s*<(task-notification|agent-message|system-reminder|local-command|command-)/;
// Claude Code puede anteponer una línea («Another Claude session sent a message:») antes de la etiqueta.
const ENTRE_SESIONES = /^\s*(?:[^<\n]*\n)?\s*<cross-session-message\b[^>]*>([\s\S]*?)<\/cross-session-message>/;
const NOTA_RESPUESTA = /\n*\(Contesta aquí mismo, en tu propio turno, no con SendMessage:[^)]*\)\s*$/;

// Solo transcripts de Claude Code: la ruta llega de los hooks, pero se valida antes de leer.
export function rutaValida(ruta) {
  if (typeof ruta !== 'string' || !ruta.endsWith('.jsonl')) return false;
  return path.resolve(ruta).startsWith(PROYECTOS);
}

function textoDe(contenido) {
  if (typeof contenido === 'string') return contenido;
  if (!Array.isArray(contenido)) return '';
  return contenido.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

// Convierte líneas del transcript en [{ rol: 'tu'|'agente'|'mensaje'|'sistema', texto, ts }].
export function intercambios(lineas, max = 14) {
  const salida = [];
  for (const linea of lineas) {
    let e;
    try { e = JSON.parse(linea); } catch { continue; }
    if (e.isSidechain || (e.type !== 'user' && e.type !== 'assistant')) continue;
    const ts = Date.parse(e.timestamp) || null;
    if (e.type === 'assistant') {
      const texto = textoDe(e.message?.content).trim();
      if (!texto) continue;
      salida.push({ rol: 'agente', texto, ts });
      continue;
    }
    const contenido = e.message?.content;
    if (Array.isArray(contenido) && contenido.every((b) => b.type === 'tool_result')) continue;
    const texto = textoDe(contenido).trim();
    if (!texto) continue;
    // Los mensajes entre sesiones llegan marcados isMeta: se revisan antes de descartar lo meta.
    const peer = texto.match(ENTRE_SESIONES);
    if (!peer && e.isMeta) continue;
    if (peer) salida.push({ rol: 'mensaje', texto: peer[1].trim().replace(/^Mensaje de .+ desde la oficina virtual:\n/, '').replace(NOTA_RESPUESTA, ''), ts });
    else if (texto.startsWith('[Request interrupted')) salida.push({ rol: 'sistema', texto: 'Interrumpido (permiso rechazado o Esc).', ts });
    else if (SISTEMA.test(texto)) continue;
    else salida.push({ rol: 'tu', texto, ts });
  }
  return salida.slice(-max).map((m) => ({ ...m, texto: m.texto.length > 4000 ? `${m.texto.slice(0, 4000)}…` : m.texto }));
}

function leerCola(fd, size, n) {
  const buf = Buffer.alloc(n);
  fs.readSync(fd, buf, 0, n, size - n);
  const lineas = buf.toString('utf8').split('\n');
  if (n < size) lineas.shift(); // la primera puede venir cortada
  return lineas;
}

export function leerConversacion(ruta, max) {
  if (!rutaValida(ruta)) return [];
  let fd;
  try {
    fd = fs.openSync(ruta, 'r');
    const { size } = fs.fstatSync(fd);
    let resultado = [];
    for (const cola of COLAS) {
      const n = Math.min(size, cola);
      resultado = intercambios(leerCola(fd, size, n), max);
      if (n === size || resultado.some((m) => m.rol === 'tu')) break;
    }
    return resultado;
  } catch {
    return [];
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// Modelos con ventana de 1 M de fábrica (docs de Claude Code: Fable, Sonnet 5+, Haiku 5.5, Opus 4.7+).
// Los demás tienen 200 mil salvo que la sesión ya los haya pasado (se lanzó con `[1m]`).
export const VENTANA_1M = /^claude-(fable|(opus|sonnet|haiku)-[5-9])|^claude-opus-4-([7-9]|\d\d)/;

// Uso de la ventana de contexto: lo que ocupó la última respuesta del agente principal
// (entrada + caché leída + caché creada + salida).
export function usoContexto(lineas) {
  for (let i = lineas.length - 1; i >= 0; i--) {
    let e;
    try { e = JSON.parse(lineas[i]); } catch { continue; }
    const u = e.type === 'assistant' && !e.isSidechain ? e.message?.usage : null;
    if (!u) continue;
    const tokens = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0);
    const limite = tokens > 200_000 || VENTANA_1M.test(e.message?.model ?? '') ? 1_000_000 : 200_000;
    return { tokens, limite, modelo: e.message?.model ?? null, ts: Date.parse(e.timestamp) || null };
  }
  return null;
}

export function leerContexto(ruta) {
  if (!rutaValida(ruta)) return null;
  let fd;
  try {
    fd = fs.openSync(ruta, 'r');
    const { size } = fs.fstatSync(fd);
    for (const cola of [512 * 1024, 4 * 1024 * 1024]) { // las líneas con imágenes pueden tapar la última respuesta
      const uso = usoContexto(leerCola(fd, size, Math.min(size, cola)));
      if (uso || cola >= size) return uso;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
