// Entrega tus mensajes a una sesión viva con la mensajería entre sesiones de Claude Code: un `claude -p` corto
// (Haiku, solo ListAgents y SendMessage, sin tus hooks ni plugins) busca la sesión por nombre y le manda el texto.
// La sesión lo recibe como «mensaje de otra sesión»: si está libre empieza un turno; si está ocupada lo lee entre
// herramientas. No puede aprobar permisos ni cambiar configuración (así lo limita Claude Code).
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_TEXTO = 4000;
export const MAX_IMAGENES = 4;
const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;
// Se reconoce el formato por sus primeros bytes, no por lo que diga la página.
const FIRMAS = [['png', '89504e47'], ['jpg', 'ffd8ff'], ['gif', '47494638'], ['webp', '52494646']];

// Guarda las imágenes que pegaste o elegiste (base64) en `dir` y devuelve sus rutas para que el agente las abra
// con Read. Los adjuntos de más de 7 días se borran.
export function guardarImagenes(dir, imagenes, ahora = Date.now()) {
  if (imagenes === undefined || imagenes === null) return [];
  if (!Array.isArray(imagenes) || imagenes.length > MAX_IMAGENES) throw new Error(`máximo ${MAX_IMAGENES} imágenes`);
  const buffers = imagenes.map((b64) => {
    const buf = typeof b64 === 'string' ? Buffer.from(b64, 'base64') : Buffer.alloc(0);
    if (!buf.length || buf.length > MAX_BYTES_IMAGEN) throw new Error('cada imagen debe pesar menos de 5 MB');
    const tipo = FIRMAS.find(([, firma]) => buf.subarray(0, firma.length / 2).toString('hex') === firma)?.[0];
    if (!tipo || (tipo === 'webp' && buf.subarray(8, 12).toString() !== 'WEBP')) throw new Error('solo imágenes PNG, JPG, GIF o WebP');
    return [buf, tipo];
  });
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const f of fs.readdirSync(dir)) {
    const ruta = path.join(dir, f);
    try { if (ahora - fs.statSync(ruta).mtimeMs > 7 * 86_400_000) fs.unlinkSync(ruta); } catch {}
  }
  return buffers.map(([buf, tipo]) => {
    const ruta = path.join(dir, `${new Date(ahora).toISOString().slice(0, 10)}-${crypto.randomBytes(6).toString('hex')}.${tipo}`);
    fs.writeFileSync(ruta, buf, { mode: 0o600 });
    return ruta;
  });
}

export const conImagenes = (texto, rutas) => rutas.length
  ? `${texto}${texto ? '\n\n' : ''}Te mando ${rutas.length === 1 ? 'una imagen' : `${rutas.length} imágenes`}; ábrelas con Read:\n${rutas.map((r) => `- ${r}`).join('\n')}`
  : texto;

// El mensajero es un `claude -p` de un solo uso: cuando la sesión contesta ya no existe. La respuesta va en su chat.
export const AVISO_RESPUESTA = '(Contesta aquí mismo, en tu propio turno, no con SendMessage: este mensajero ya se cerró y no recibe respuestas. La oficina lee tu respuesta de tu conversación y me avisa.)';

export function promptMensajero({ nombre, cwd, texto, firma = 'el usuario' }) {
  return [
    `Usa ListAgents para encontrar la sesión local de Claude Code cuyo nombre es «${nombre}» y cuyo directorio es ${cwd}.`,
    'Si hay varias con ese nombre, elige la de ese directorio. Envíale con SendMessage exactamente el texto que está entre',
    'las marcas <<<INICIO>>> y <<<FIN>>>, sin las marcas, sin cambiarlo ni agregar nada:',
    `<<<INICIO>>>\nMensaje de ${firma} desde la oficina virtual:\n${texto}\n\n${AVISO_RESPUESTA}\n<<<FIN>>>`,
    'Después responde solo ENVIADO, o NO ENVIADO: <motivo en una línea>.',
  ].join('\n');
}

export function interpretar(salida) {
  const ultima = salida.trim().split('\n').filter(Boolean).at(-1) ?? '';
  if (/^NO ENVIADO/i.test(ultima)) return { ok: false, detalle: ultima.replace(/^NO ENVIADO:?\s*/i, '') || 'sin motivo' };
  if (/ENVIADO/i.test(ultima)) return { ok: true, detalle: null };
  return { ok: false, detalle: ultima.slice(0, 200) || 'el mensajero no respondió' };
}

// Cola por sesión destino (varias sesiones se entregan en paralelo; a una sola, en orden); `alCambiar` avisa a la página cada que un mensaje cambia de estado.
export function crearMensajero({ dir, claude = 'claude', firma, alCambiar = () => {}, ejecutar = execFile }) {
  fs.mkdirSync(dir, { recursive: true });
  const porSesion = new Map(); // sesión → últimos 20 mensajes
  const colas = new Map(); // sesión → cola de entregas
  let siguienteId = 1;

  function registrar(sid, m) {
    const lista = porSesion.get(sid) ?? [];
    lista.push(m);
    porSesion.set(sid, lista.slice(-20));
    alCambiar();
  }

  function enviar(sid, destino, texto, alTerminar = () => {}) {
    const m = { id: siguienteId++, texto, estado: 'enviando', detalle: null, ts: Date.now() };
    registrar(sid, m);
    const previa = colas.get(sid) ?? Promise.resolve();
    const esta = previa.then(() => new Promise((listo) => {
      ejecutar(claude, ['-p', '--model', 'haiku', '--setting-sources', 'project', '--allowedTools=ListAgents,SendMessage',
        promptMensajero({ ...destino, texto, firma })],
      { cwd: dir, timeout: 60_000, maxBuffer: 1024 * 1024 }, (e, salida = '') => {
        const r = e && !salida ? { ok: false, detalle: e.killed ? 'tardó más de 1 min' : e.message.split('\n')[0] } : interpretar(salida);
        m.estado = r.ok ? 'enviado' : 'error';
        m.detalle = r.detalle;
        alCambiar();
        alTerminar(m);
        listo();
      }).stdin?.end();
    }));
    colas.set(sid, esta);
    esta.then(() => { if (colas.get(sid) === esta) colas.delete(sid); });
    return m;
  }

  // Mensaje que ya llegó por otro camino (tecleado en su tmux): solo queda en la lista de la ficha.
  function anotar(sid, texto) {
    const m = { id: siguienteId++, texto, estado: 'enviado', detalle: null, ts: Date.now() };
    registrar(sid, m);
    return m;
  }

  return { enviar, anotar, mensajes: () => Object.fromEntries(porSesion) };
}
