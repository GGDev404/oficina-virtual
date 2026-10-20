// Entrega tus mensajes a una sesión viva con la mensajería entre sesiones de Claude Code: un `claude -p` corto
// (Haiku, solo ListAgents y SendMessage, sin tus hooks ni plugins) busca la sesión por nombre y le manda el texto.
// La sesión lo recibe como «mensaje de otra sesión»: si está libre empieza un turno; si está ocupada lo lee entre
// herramientas. No puede aprobar permisos ni cambiar configuración (así lo limita Claude Code).
import { execFile } from 'node:child_process';
import fs from 'node:fs';

export const MAX_TEXTO = 4000;

export function promptMensajero({ nombre, cwd, texto, firma = 'el usuario' }) {
  return [
    `Usa ListAgents para encontrar la sesión local de Claude Code cuyo nombre es «${nombre}» y cuyo directorio es ${cwd}.`,
    'Si hay varias con ese nombre, elige la de ese directorio. Envíale con SendMessage exactamente el texto que está entre',
    'las marcas <<<INICIO>>> y <<<FIN>>>, sin las marcas, sin cambiarlo ni agregar nada:',
    `<<<INICIO>>>\nMensaje de ${firma} desde la oficina virtual:\n${texto}\n<<<FIN>>>`,
    'Después responde solo ENVIADO, o NO ENVIADO: <motivo en una línea>.',
  ].join('\n');
}

export function interpretar(salida) {
  const ultima = salida.trim().split('\n').filter(Boolean).at(-1) ?? '';
  if (/^NO ENVIADO/i.test(ultima)) return { ok: false, detalle: ultima.replace(/^NO ENVIADO:?\s*/i, '') || 'sin motivo' };
  if (/ENVIADO/i.test(ultima)) return { ok: true, detalle: null };
  return { ok: false, detalle: ultima.slice(0, 200) || 'el mensajero no respondió' };
}

// Cola de uno en uno; `alCambiar` avisa a la página cada que un mensaje cambia de estado.
export function crearMensajero({ dir, claude = 'claude', firma, alCambiar = () => {}, ejecutar = execFile }) {
  fs.mkdirSync(dir, { recursive: true });
  const porSesion = new Map(); // sesión → últimos 20 mensajes
  let cola = Promise.resolve();
  let siguienteId = 1;

  function registrar(sid, m) {
    const lista = porSesion.get(sid) ?? [];
    lista.push(m);
    porSesion.set(sid, lista.slice(-20));
    alCambiar();
  }

  function enviar(sid, destino, texto) {
    const m = { id: siguienteId++, texto, estado: 'enviando', detalle: null, ts: Date.now() };
    registrar(sid, m);
    cola = cola.then(() => new Promise((listo) => {
      ejecutar(claude, ['-p', '--model', 'haiku', '--setting-sources', 'project', '--allowedTools=ListAgents,SendMessage',
        promptMensajero({ ...destino, texto, firma })],
      { cwd: dir, timeout: 120_000, maxBuffer: 1024 * 1024 }, (e, salida = '') => {
        const r = e && !salida ? { ok: false, detalle: e.killed ? 'tardó más de 2 min' : e.message.split('\n')[0] } : interpretar(salida);
        m.estado = r.ok ? 'enviado' : 'error';
        m.detalle = r.detalle;
        alCambiar();
        listo();
      }).stdin?.end();
    }));
    return m;
  }

  return { enviar, mensajes: () => Object.fromEntries(porSesion) };
}
