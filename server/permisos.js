// Aprobar o rechazar permisos desde la oficina. hooks/permiso.sh manda el PermissionRequest y espera la respuesta
// HTTP hasta ESPERA_MS: si decides a tiempo, la respuesta lleva la decisión que Claude Code aplica; si no, se
// responde vacío y Claude Code muestra su diálogo de siempre. La página solo aprueba o rechaza: nunca cambia la entrada.
// Mientras el hook espera, la terminal no muestra el diálogo: «Decidir en la terminal» lo suelta antes.
export const ESPERA_MS = Number(process.env.OFICINA_PERMISO_ESPERA_MS) || 15 * 60_000;

const CAMPOS = ['command', 'file_path', 'url', 'pattern', 'path', 'description', 'old_string', 'new_string', 'content', 'prompt'];

// Lo que ves para decidir: los campos que importan de la entrada, recortados.
export function resumenEntrada(entrada = {}) {
  return CAMPOS.filter((k) => typeof entrada[k] === 'string' && entrada[k].trim())
    .map((k) => [k, entrada[k].length > 1500 ? `${entrada[k].slice(0, 1500)}…` : entrada[k]]);
}

// «Permitir siempre» solo guarda las reglas allow que el propio Claude Code sugirió; nunca reglas armadas por la página.
export const sugerenciasAllow = (payload = {}) => (Array.isArray(payload.permission_suggestions) ? payload.permission_suggestions : [])
  .filter((s) => s?.type === 'addRules' && s.behavior === 'allow' && Array.isArray(s.rules) && s.rules.length);

export function decisionHook(behavior, motivo, sugerencias) {
  const decision = { behavior };
  if (behavior === 'deny') decision.message = motivo || 'Rechazado desde la oficina virtual.';
  if (behavior === 'allow' && sugerencias?.length) decision.updatedPermissions = sugerencias;
  return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } };
}

// Preguntas de AskUserQuestion (hooks/pregunta.sh, PreToolUse): lo que ves para elegir, sin campos de más.
export function resumenPreguntas(entrada = {}) {
  if (!Array.isArray(entrada.questions)) return null;
  const txt = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  return entrada.questions.slice(0, 4).map((q) => ({ pregunta: txt(q.question, 1000), titulo: txt(q.header, 40), multiple: q.multiSelect === true,
    opciones: (Array.isArray(q.options) ? q.options : []).slice(0, 6).map((o) => ({ etiqueta: txt(o.label, 200), descripcion: txt(o.description, 500) })) }));
}

// Respuesta al hook: la entrada original más tus respuestas ({pregunta: etiqueta}; varias se unen con comas).
export function respuestaHook(entrada, respuestas) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow',
    permissionDecisionReason: 'Respondido desde la oficina virtual.', updatedInput: { ...entrada, answers: respuestas } } };
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
      preguntas: resumenPreguntas(payload.tool_input), creado: ahora, vence: ahora + espera, responder, entrada: payload.tool_input ?? {},
      sugerencias: sugerenciasAllow(payload) };
    p.temporizador = reloj.setTimeout(() => cerrar(id, null), espera);
    pendientes.set(id, p);
    alCambiar();
    return id;
  }

  return {
    pedir,
    // `siempre`: allow con las reglas sugeridas; sin sugerencias no hay «siempre».
    decidir: (id, behavior, motivo, { siempre = false } = {}) => {
      const p = pendientes.get(id);
      if (!p || (behavior !== 'allow' && behavior !== 'deny')) return false;
      if (siempre && (behavior !== 'allow' || !p.sugerencias.length)) return false;
      return cerrar(id, decisionHook(behavior, motivo, siempre ? p.sugerencias : undefined));
    },
    // Solo respuestas a preguntas que de verdad hizo, con texto; si falta alguna, no se contesta.
    contestar: (id, respuestas) => {
      const p = pendientes.get(id);
      if (!p?.preguntas || typeof respuestas !== 'object' || !respuestas) return false;
      const limpias = {};
      for (const q of p.entrada.questions ?? []) {
        const r = respuestas[q.question];
        if (typeof r !== 'string' || !r.trim()) return false;
        limpias[q.question] = r.trim().slice(0, 2000);
      }
      return cerrar(id, respuestaHook(p.entrada, limpias));
    },
    abandonar: (id) => cerrar(id, null), // el hook se cortó (Claude Code siguió por su lado)
    sesionDe: (id) => pendientes.get(id)?.sid ?? null,
    lista: () => [...pendientes.values()].map(({ responder, temporizador, entrada, sugerencias, ...p }) => ({ ...p,
      reglas: sugerencias.flatMap((s) => s.rules.map((r) => (r.ruleContent ? `${r.toolName}(${r.ruleContent})` : r.toolName))),
      destino: sugerencias[0]?.destination ?? null })),
  };
}
