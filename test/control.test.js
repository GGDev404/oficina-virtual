// Abrir y cerrar sesiones: validaciones y los dos caminos de cierre, sin lanzar procesos reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { enScope, nuevaEnTmux, carpetaValida, nuevaSesion, nuevaEnTerminal, cerrarSesion, worktreeDeTarea, carpetaAparte } from '../server/control.js';

test('carpeta válida: absoluta, existente y dentro de tu home', () => {
  assert.equal(carpetaValida(os.homedir()), true);
  assert.equal(carpetaValida('relativa/x'), false);
  assert.equal(carpetaValida('/etc'), false);
  assert.equal(carpetaValida(`${os.homedir()}/../`), false);
  assert.equal(carpetaValida(`${os.homedir()}/no-existe-${Date.now()}`), false);
});

test('nueva sesión: claude --bg con nombre, permisos, indicación y CLICKUP_TASK', async () => {
  let visto;
  const ejecutar = async (cmd, args, opts) => { visto = { args, opts }; return { texto: 'backgrounded · 5e3c1b1d · k7p2tfedr\n  claude attach 5e3c1b1d' }; };
  const r = await nuevaSesion({ cwd: '/home/x', prompt: '/agil k7p2tfedr', nombre: 'k7p2tfedr', permiso: 'auto', tarea: 'k7p2tfedr' }, { ejecutar });
  assert.deepEqual(r, { ok: true, id: '5e3c1b1d' });
  assert.deepEqual(visto.args, ['--bg', '--permission-mode', 'auto', '--name', 'k7p2tfedr', '/agil k7p2tfedr']);
  assert.equal(visto.opts.cwd, '/home/x');
  assert.equal(visto.opts.env.CLICKUP_TASK, 'k7p2tfedr');
  const sinConfianza = await nuevaSesion({ cwd: '/home/x', prompt: 'hola', permiso: 'auto' },
    { ejecutar: async () => ({ texto: 'Workspace not trusted. Run `claude` in /home/x once' }) });
  assert.equal(sinConfianza.ok, false);
  assert.match(sinConfianza.motivo, /aún no confía en \/home\/x/);
});

test('cerrar: segundo plano con claude stop; interactiva con SIGTERM solo si el pid sigue siendo de Claude', async () => {
  let args;
  const bg = await cerrarSesion({ tipo: 'background', corto: '5e3c1b1d', pid: 1 }, { ejecutar: async (c, a) => { args = a; return { texto: 'stopped 5e3c1b1d' }; } });
  assert.deepEqual(bg, { ok: true });
  assert.deepEqual(args, ['stop', '5e3c1b1d']);
  const señales = [];
  const matar = (pid, s) => señales.push([pid, s]);
  assert.deepEqual(await cerrarSesion({ tipo: 'interactive', pid: 4242 }, { matar, verificar: () => true }), { ok: true });
  assert.deepEqual(señales, [[4242, 'SIGTERM']]);
  const ajeno = await cerrarSesion({ tipo: 'interactive', pid: 4243 }, { matar, verificar: () => false });
  assert.equal(ajeno.ok, false);
  assert.equal(señales.length, 1);
});

test('terminal nueva: xdg-terminal-exec con claude interactivo en la carpeta, permisos y CLICKUP_TASK', () => {
  let visto;
  nuevaEnTerminal({ cwd: '/home/x', prompt: 'Retoma el traspaso', nombre: 'traspaso', permiso: 'auto', tarea: null },
    { lanzar: (cmd, args, opts) => { visto = { cmd, args, opts }; return { on() {}, unref() {} }; } });
  assert.equal(visto.cmd, 'xdg-terminal-exec');
  assert.deepEqual(visto.args, ['claude', '--permission-mode', 'auto', '--name', 'traspaso', 'Retoma el traspaso']);
  assert.equal(visto.opts.cwd, '/home/x');
  assert.equal(visto.opts.env.CLICKUP_TASK, undefined);
});

test('modelo elegido: --model va a claude --bg y a la terminal', async () => {
  let visto;
  await nuevaSesion({ cwd: '/home/x', prompt: 'hola', permiso: 'auto', modelo: 'claude-sonnet-5-5' },
    { ejecutar: async (c, args) => { visto = args; return { texto: 'backgrounded · 5e3c1b1d' }; } });
  assert.deepEqual(visto, ['--bg', '--permission-mode', 'auto', '--model', 'claude-sonnet-5-5', 'hola']);
  let lanzado;
  nuevaEnTerminal({ cwd: '/home/x', prompt: 'hola', permiso: 'auto', modelo: 'claude-haiku-5-5' }, { lanzar: (c, args) => { lanzado = args; return {}; } });
  assert.deepEqual(lanzado, ['claude', '--permission-mode', 'auto', '--model', 'claude-haiku-5-5', 'hola']);
});

test('worktree de la tarea: nuevo desde origin/develop, con su rama si existe, y reutiliza el que ya hay', async () => {
  const raiz = fs.mkdtempSync(path.join(os.homedir(), '.cache', 'oficina-wt-'));
  const g = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const origen = path.join(raiz, 'origen.git'), repo = path.join(raiz, 'repo');
    execFileSync('git', ['init', '-q', '--bare', origen]);
    execFileSync('git', ['clone', '-q', origen, repo], { stdio: 'ignore' });
    g(repo, '-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-q', '--allow-empty', '-m', 'base');
    g(repo, 'push', '-q', 'origin', 'HEAD:develop');
    fs.mkdirSync(path.join(repo, '.git', 'info'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.git', 'info', 'exclude'), '/CLAUDE.local.md\n/*.log\n');
    fs.writeFileSync(path.join(repo, 'CLAUDE.local.md'), 'local');

    const a = await worktreeDeTarea(repo, 'abc123xyz');
    assert.equal(a.ok, true);
    assert.equal(a.cwd, `${repo}.worktrees/abc123xyz`);
    assert.deepEqual([a.creado, a.rama, a.base], [true, null, 'origin/develop']);
    assert.equal(fs.readlinkSync(path.join(a.cwd, 'CLAUDE.local.md')), path.join(repo, 'CLAUDE.local.md'));
    // Desde el propio worktree (o el repo) se reutiliza: misma carpeta, sin crear otra.
    const otra = await worktreeDeTarea(a.cwd, 'abc123xyz');
    assert.deepEqual([otra.ok, otra.cwd, otra.creado], [true, a.cwd, false]);

    g(repo, 'branch', 'feature/filtro-k7p2tfedr');
    const b = await worktreeDeTarea(repo, 'k7p2tfedr');
    assert.deepEqual([b.creado, b.rama], [true, 'feature/filtro-k7p2tfedr']);
    assert.match(g(b.cwd, 'branch', '--show-current'), /feature\/filtro-k7p2tfedr/);

    assert.equal((await worktreeDeTarea(raiz, 'zzz999zzz')).ok, false); // no es repo
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); fs.rmSync(`${path.join(raiz, 'repo')}.worktrees`, { recursive: true, force: true }); }
});

test('carpeta aparte: nueva en ~/Agentes con fecha y nombre, sin pisar una existente', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-aparte-'));
  try {
    const hoy = new Date('2026-10-20T18:00:00Z');
    const a = carpetaAparte('Investigación: precios A+W', { raiz, hoy });
    assert.equal(a, path.join(raiz, '2026-10-20-investigacion-precios-a-w'));
    assert.equal(carpetaAparte('Investigación: precios A+W', { raiz, hoy }), `${a}-2`);
    assert.equal(path.basename(carpetaAparte('', { raiz, hoy })), '2026-10-20-sesion');
    assert.equal(fs.statSync(a).isDirectory(), true);
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
});

test('enScope lanza la sesión en su propio scope de systemd', () => {
  let visto;
  enScope((cmd, args, opts) => { visto = { cmd, args, opts }; })('claude', ['--bg', 'hola'], { cwd: '/home/x' });
  assert.deepEqual(visto, { cmd: 'systemd-run', args: ['--user', '--scope', '--collect', '--quiet', 'claude', '--bg', 'hola'], opts: { cwd: '/home/x' } });
});

test('nuevaSesion con reanudar retoma la conversación con --resume', async () => {
  let visto;
  await nuevaSesion({ cwd: '/home/x', prompt: 'sigue', permiso: 'auto', reanudar: 'e727960d-922e-461a-9232-51058f1dabd2' },
    { ejecutar: async (c, args) => { visto = args; return { texto: 'backgrounded · 8c2b2240' }; } });
  assert.deepEqual(visto, ['--bg', '--permission-mode', 'auto', '--resume', 'e727960d-922e-461a-9232-51058f1dabd2', 'sigue']);
});

test('nuevaEnTmux: claude dentro de su propio tmux con permisos, modelo, nombre, resume y la tarea', async () => {
  let visto;
  const r = await nuevaEnTmux({ cwd: '/home/x', prompt: 'sigue', nombre: 'Director', permiso: 'auto', tarea: 'k7p2tfedr', modelo: 'claude-opus-5-5', reanudar: 'e727960d' },
    { socket: 'ov-director-ab12', esperar: 0, pantalla: async () => '> ', ejecutar: async (cmd, args, opts) => { visto = { cmd, args, opts }; return { texto: '' }; } });
  assert.deepEqual(r, { ok: true, socket: 'ov-director-ab12' });
  assert.equal(visto.cmd, 'tmux');
  assert.deepEqual(visto.args, ['-L', 'ov-director-ab12', 'new-session', '-d', '-s', 'main', '-x', '200', '-y', '50', '-c', '/home/x',
    '-e', 'CLICKUP_TASK=k7p2tfedr', '-e', 'OFICINA_TMUX=ov-director-ab12',
    'claude', '--permission-mode', 'auto', '--model', 'claude-opus-5-5', '--name', 'Director', '--resume', 'e727960d', 'sigue']);
  assert.equal(visto.opts.env.CLICKUP_TASK, 'k7p2tfedr');
});

test('nuevaEnTmux: carpeta sin confianza abre una terminal adjunta para aceptar el aviso', async () => {
  let adjunto;
  const r = await nuevaEnTmux({ cwd: '/home/x', prompt: 'hola', permiso: 'auto' },
    { socket: 'ov-sesion-0000', esperar: 0, pantalla: async () => 'Do you trust the files in this folder?', adjuntar: (s) => { adjunto = s; },
      ejecutar: async () => ({ texto: '' }) });
  assert.deepEqual(r, { ok: true, socket: 'ov-sesion-0000', confianza: true });
  assert.equal(adjunto, 'ov-sesion-0000');
});
