// Sesiones de la oficina dentro de tmux: lo que escribes en la oficina se teclea en su terminal, así que Claude Code
// lo toma como tuyo (aprobaciones incluidas), no como mensaje de otra sesión.
// Un servidor tmux por sesión (`tmux -L <socket>`): cada uno nace en su propio scope de systemd, y un OOM o un
// cierre se lleva solo esa sesión. Un servidor compartido las juntaría en un cgroup, como el daemon de `claude --bg`.
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const PANEL = 'main';
// Solo estas teclas se mandan sueltas (diálogos de Claude Code); el texto va por enviarTexto.
export const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Enter', 'Escape', 'Up', 'Down'];

export function socketDe(nombre, sufijo = crypto.randomBytes(2).toString('hex')) {
  const slug = (nombre || 'sesion').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sesion';
  return `ov-${slug}-${sufijo}`;
}
export const socketValido = (s) => typeof s === 'string' && /^ov-[a-z0-9-]{1,40}-[0-9a-f]{4}$/.test(s);

// argv de tmux para abrir `claude <args>` en una sesión nueva sin ventana. OFICINA_TMUX liga la sesión de Claude
// con su socket (hook.sh lo manda como tmux_env en SessionStart).
export function argsNueva({ socket, cwd, env = {}, claudeArgs }) {
  const vars = Object.entries({ ...env, OFICINA_TMUX: socket }).filter(([, v]) => v).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  return ['-L', socket, 'new-session', '-d', '-s', PANEL, '-x', '200', '-y', '50', '-c', cwd, ...vars, 'claude', ...claudeArgs];
}
export const argsAdjuntar = (socket) => ['-L', socket, 'attach', '-t', PANEL];

const tmux = (ejecutar, args, entrada) => new Promise((ok, falla) => {
  const hijo = ejecutar('tmux', args, { timeout: 5000 }, (e, salida = '') => (e ? falla(e) : ok(salida)));
  hijo?.stdin?.end(entrada);
});

// ¿Lo pegado sigue en la caja de entrada? Claude Code lo agrupa como «[Pasted text #N…]» / «[Image #N]» o lo deja tal cual.
export function sigueEnLaCaja(pantalla, texto) {
  const caja = pantalla.split('\n').reverse().find((l) => /^\s*❯/.test(l))?.replace(/^\s*❯\s?/, '').trim() ?? '';
  if (!caja) return false;
  if (/\[(Pasted text|Image) #\d+/.test(caja)) return true;
  const inicio = texto.trim().split('\n')[0].slice(0, 24).trim();
  return !!inicio && caja.startsWith(inicio);
}

// Pega el texto como bracketed paste (los saltos de línea no lo envían a medias) y luego Enter. Claude Code procesa lo
// pegado (imágenes, texto largo) de forma asíncrona y un Enter que llega antes se pierde: se espera y, si el texto sigue
// en la caja, se reintenta (hasta 3 veces).
export async function enviarTexto(socket, texto, { ejecutar = execFile, esperar = (ms) => new Promise((ok) => setTimeout(ok, ms)) } = {}) {
  if (!socketValido(socket)) throw new Error('socket no válido');
  await tmux(ejecutar, ['-L', socket, 'load-buffer', '-b', 'ov', '-'], texto);
  await tmux(ejecutar, ['-L', socket, 'paste-buffer', '-p', '-d', '-b', 'ov', '-t', PANEL]);
  await esperar(/\.(png|jpe?g|gif|webp)\b/i.test(texto) ? 1200 : texto.includes('\n') || texto.length > 200 ? 500 : 250);
  for (let intento = 0; intento < 3; intento++) {
    await tmux(ejecutar, ['-L', socket, 'send-keys', '-t', PANEL, 'Enter']);
    await esperar(700);
    if (!sigueEnLaCaja(await tmux(ejecutar, ['-L', socket, 'capture-pane', '-p', '-t', PANEL]), texto)) return;
  }
  throw new Error('lo pegué en su terminal pero no se envió; revisa su caja de entrada');
}

export async function enviarTecla(socket, tecla, { ejecutar = execFile } = {}) {
  if (!socketValido(socket)) throw new Error('socket no válido');
  if (!TECLAS.includes(tecla)) throw new Error('tecla no permitida');
  await tmux(ejecutar, ['-L', socket, 'send-keys', '-t', PANEL, tecla]);
}

// Últimas líneas de la pantalla (para ver un diálogo que pasó a la terminal).
export const capturar = (socket, { ejecutar = execFile } = {}) =>
  tmux(ejecutar, ['-L', socket, 'capture-pane', '-p', '-t', PANEL, '-S', '-25']);

export const vive = (socket, { ejecutar = execFile } = {}) =>
  socketValido(socket) ? tmux(ejecutar, ['-L', socket, 'has-session', '-t', PANEL]).then(() => true, () => false) : Promise.resolve(false);

// Cierra el servidor: Claude Code recibe SIGHUP y la conversación queda guardada.
export const cerrar = (socket, { ejecutar = execFile } = {}) => tmux(ejecutar, ['-L', socket, 'kill-server']);
