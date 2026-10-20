// Notificaciones de escritorio con notify-send. El primer aviso sale al momento; los que llegan en el minuto
// siguiente se juntan en uno solo al cerrar esa ventana.
import { execFile } from 'node:child_process';

const VENTANA_MS = 60_000;
export const ESTADOS_AVISO = {
  necesita_permiso: 'necesita permiso',
  bloqueado: 'está bloqueada',
  duda: 'tiene una duda',
  te_espera: 'te espera',
};

export function crearNotificador({ enviar = notifySend, ventanaMs = VENTANA_MS } = {}) {
  let abierta = false;
  let acumulados = [];

  function cerrar() {
    if (acumulados.length === 0) { abierta = false; return; }
    const lote = acumulados;
    acumulados = [];
    enviar(lote.length === 1 ? lote[0] : {
      titulo: `Oficina: ${lote.length} avisos`,
      cuerpo: lote.map((a) => `• ${a.titulo}`).join('\n'),
      urgente: lote.some((a) => a.urgente),
    });
    setTimeout(cerrar, ventanaMs).unref?.();
  }

  return function avisar(aviso) {
    if (!abierta) {
      abierta = true;
      enviar(aviso);
      setTimeout(cerrar, ventanaMs).unref?.();
    } else {
      acumulados.push(aviso);
    }
  };
}

function notifySend({ titulo, cuerpo = '', urgente = false }) {
  // execFile sin shell: el texto viene de agentes y comentarios.
  // Urgentes (permiso, bloqueo) se quedan hasta cerrarlas; las demás 15 s (mako por omisión las quita a los 5 s).
  execFile('notify-send', ['-a', 'Oficina virtual', '-u', urgente ? 'critical' : 'normal', '-t', urgente ? '0' : '15000',
    titulo, cuerpo.slice(0, 300)],
    { timeout: 5000 }, (e) => { if (e) console.error('notify-send:', e.message); });
}
