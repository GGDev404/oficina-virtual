// Aprobar o rechazar permisos desde la oficina. hooks/permiso.sh manda el PermissionRequest y espera la respuesta
// HTTP hasta ESPERA_MS: si decides a tiempo, la respuesta lleva la decisión que Claude Code aplica; si no, se
// responde vacío y Claude Code muestra su diálogo de siempre. La página solo aprueba o rechaza: nunca cambia la entrada.
export const ESPERA_MS = 120_000;

const CAMPOS = ['command', 'file_path', 'url', 'pattern', 'path', 'description', 'old_string', 'new_string', 'content', 'prompt'];

// Lo que ves para decidir: los campos que importan de la entrada, recortados.
export function resumenEntrada(entrada = {}) {
  return CAMPOS.filter((k) => typeof entrada[k] === 'string' && entrada[k].trim())
    .map((k) => [k, entrada[k].length > 1500 ? `${entrada[k].slice(0, 1500)}…` : entrada[k]]);
}

export function decisionHook(behavior, motivo) {
  const decision = { behavior };
  if (behavior === 'deny') decision.message = motivo || 'Rechazado desde la oficina virtual.';
  return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } };
}

export function crearPermisos({ alCambiar = () => {}, espera = ESPERA_MS, reloj = { setTimeout, clearTimeout } } = {}) {
  const pendientes = new Map(); // id → { sid, herramienta, campos, creado, vence, responder }
  let siguiente = 1;

  function cerrar(id, cuerpo) {
    const p = pendientes.get(id);
    if (!p) return false;
    pendientes.delete(id);
    reloj.clearTimeout(p.temporizador);
    p.responder(cuerpo);
    alCambiar();
    return true;
  }

  // `responder(cuerpo|null)`: null = sin decisión (el diálogo sale en la terminal).
  function pedir(payload, responder, ahora = Date.now()) {
    const id = String(siguiente++);
    const p = { id, sid: payload.session_id, herramienta: payload.tool_name ?? 'herramienta', campos: resumenEntrada(payload.tool_input),
      creado: ahora, vence: ahora + espera, responder };
    p.temporizador = reloj.setTimeout(() => cerrar(id, null), espera);
    pendientes.set(id, p);
    alCambiar();
    return id;
  }

  return {
    pedir,
    decidir: (id, behavior, motivo) => (behavior === 'allow' || behavior === 'deny') && cerrar(id, decisionHook(behavior, motivo)),
    abandonar: (id) => cerrar(id, null), // el hook se cortó (Claude Code siguió por su lado)
    sesionDe: (id) => pendientes.get(id)?.sid ?? null,
    lista: () => [...pendientes.values()].map(({ responder, temporizador, ...p }) => p),
  };
}
