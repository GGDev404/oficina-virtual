// Bandeja de preguntas: lee y actualiza la tabla de preguntas.md del vault (OFICINA_PREGUNTAS).
// El archivo es la fuente: Obsidian lo edita igual que la oficina; aquí solo se reescribe la fila tocada.
import fs from 'node:fs';

const COLUMNAS = ['id', 'estado', 'para', 'bloquea', 'tarea', 'pregunta', 'contexto', 'enviada', 'respuesta', 'respondida', 'fuente', 'modulo'];
export const ESTADOS_PREGUNTA = ['por enviar', 'enviada', 'por responder', 'supuesto', 'respondida', 'descartada'];
// Cerradas: ya no piden nada. «supuesto» se construye con lo anotado y se confirma después (no cuenta como abierta).
const CERRADAS = ['respondida', 'descartada', 'supuesto'];
const FILA = /^\|\s*P-\d+\s*\|/;

const celdas = (linea) => linea.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const limpio = (t) => String(t ?? '').replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const hoy = () => new Date().toLocaleDateString('sv');

export function leerBandeja(ruta) {
  if (!ruta) return { filas: [], error: 'falta OFICINA_PREGUNTAS en el .env' };
  let texto;
  try { texto = fs.readFileSync(ruta, 'utf8'); } catch (e) { return { filas: [], error: `no pude leer ${ruta}: ${e.code}` }; }
  const filas = texto.split('\n').filter((l) => FILA.test(l)).map((l) => Object.fromEntries(COLUMNAS.map((c, i) => [c, celdas(l)[i] ?? ''])));
  return { filas };
}

// cambios: {estado?, respuesta?}. Responder pone la fecha y deja la fila en «respondida»; enviar pone la fecha de envío.
export function actualizarPregunta(ruta, id, { estado, respuesta } = {}) {
  if (estado != null && !ESTADOS_PREGUNTA.includes(estado)) throw new Error(`estado no válido: ${ESTADOS_PREGUNTA.join(', ')}`);
  if (respuesta != null && (!limpio(respuesta) || limpio(respuesta).length > 2000)) throw new Error('la respuesta lleva entre 1 y 2000 caracteres');
  const lineas = fs.readFileSync(ruta, 'utf8').split('\n');
  const i = lineas.findIndex((l) => FILA.test(l) && celdas(l)[0] === id);
  if (i < 0) return null;
  const f = Object.fromEntries(COLUMNAS.map((c, j) => [c, celdas(lineas[i])[j] ?? '']));
  if (respuesta != null) Object.assign(f, { respuesta: limpio(respuesta), respondida: hoy(), estado: 'respondida' });
  else if (estado) {
    f.estado = estado;
    if (estado === 'enviada' && !f.enviada) f.enviada = hoy();
  }
  lineas[i] = `| ${COLUMNAS.map((c) => f[c]).join(' | ')} |`;
  const tmp = `${ruta}.oficina-tmp`;
  fs.writeFileSync(tmp, lineas.join('\n'));
  fs.renameSync(tmp, ruta); // atómico: Obsidian nunca ve el archivo a medias
  return f;
}

// Texto para /api/siguiente: lo que bloquea y sigue abierto, primero lo que decides tú.
export function resumenBandeja(ruta, n = 8) {
  const { filas, error } = leerBandeja(ruta);
  if (error) return '';
  const abiertas = filas.filter((f) => !CERRADAS.includes(f.estado));
  if (!abiertas.length) return '';
  const tuyas = abiertas.filter((f) => f.estado === 'por responder').length;
  const porEnviar = abiertas.filter((f) => f.estado === 'por enviar').length;
  const bloquean = abiertas.filter((f) => f.bloquea === 'sí').sort((a, b) => (a.estado === 'por responder' ? -1 : 0) - (b.estado === 'por responder' ? -1 : 0));
  const lineas = ['', `Preguntas abiertas: ${abiertas.length} (${tuyas} las decides tú, ${porEnviar} por enviar) · bloquean: ${bloquean.length}`];
  for (const f of bloquean.slice(0, n)) lineas.push(`   ${f.id} [${f.estado} · ${f.para}] ${f.tarea}: ${f.pregunta}`);
  return lineas.join('\n') + '\n';
}
