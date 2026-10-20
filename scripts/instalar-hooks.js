#!/usr/bin/env node
// Fusiona los hooks de la oficina en ~/.claude/settings.json (con respaldo).
// Uso: node scripts/instalar-hooks.js [--quitar]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const HOOKS = path.resolve(import.meta.dirname, '..', 'hooks');
const HOOK = path.join(HOOKS, 'hook.sh');
// PermissionRequest espera tu decisión en la oficina hasta 2 min (permiso.sh); el resto solo informa.
const PROPIOS = { PermissionRequest: { command: path.join(HOOKS, 'permiso.sh'), timeout: 130 } };
const EVENTOS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'Notification', 'PermissionRequest', 'Stop', 'SubagentStart', 'SubagentStop', 'SessionEnd'];
const MATCHER = { PreToolUse: 'Task|Agent', PostToolUse: 'Task|Agent' };
// AskUserQuestion espera tu respuesta en la oficina hasta 15 min (pregunta.sh): un grupo aparte con su matcher.
const EXTRA = [['PreToolUse', { matcher: 'AskUserQuestion', hooks: [{ type: 'command', command: path.join(HOOKS, 'pregunta.sh'), timeout: 910 }] }]];
const quitar = process.argv.includes('--quitar');

const texto = fs.readFileSync(SETTINGS, 'utf8');
const settings = JSON.parse(texto); // si no es JSON válido, aborta sin tocar nada
const respaldo = `${SETTINGS}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(respaldo, texto, { mode: 0o600 });

const esNuestro = (h) => typeof h.command === 'string' && h.command.startsWith(HOOKS + path.sep);
const hooks = settings.hooks ?? {};

// Quita siempre las entradas previas de la oficina (instalar es idempotente).
for (const ev of Object.keys(hooks)) {
  hooks[ev] = hooks[ev]
    .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !esNuestro(h)) }))
    .filter((g) => g.hooks.length > 0);
  if (hooks[ev].length === 0) delete hooks[ev];
}

if (!quitar) {
  for (const ev of EVENTOS) {
    const grupo = { hooks: [{ type: 'command', ...(PROPIOS[ev] ?? { command: `${HOOK} ${ev}`, timeout: 2 }) }] };
    if (MATCHER[ev]) grupo.matcher = MATCHER[ev];
    (hooks[ev] ??= []).push(grupo);
  }
  for (const [ev, grupo] of EXTRA) (hooks[ev] ??= []).push(grupo);
}

if (Object.keys(hooks).length) settings.hooks = hooks; else delete settings.hooks;
const tmp = `${SETTINGS}.tmp-oficina`;
fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n');
fs.renameSync(tmp, SETTINGS);
console.log(`${quitar ? 'Hooks quitados' : 'Hooks instalados'}. Respaldo: ${respaldo}`);
