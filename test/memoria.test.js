import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerMeminfo, nivelMemoria, pausar } from '../server/memoria.js';

const GB = 1024 * 1024;
test('nivelMemoria: bien, alto y crítico según RAM disponible y swap usado', () => {
  const m = leerMeminfo('MemTotal: 16000000 kB\nMemAvailable: 8000000 kB\nSwapTotal: 16000000 kB\nSwapFree: 16000000 kB\n');
  assert.deepEqual(m, { total: 16000000, disponible: 8000000, swapTotal: 16000000, swapLibre: 16000000 });
  assert.equal(nivelMemoria(m, 15), 'bien');
  assert.equal(nivelMemoria({ ...m, disponible: 3 * GB }, 15), 'alto');
  assert.equal(nivelMemoria({ ...m, disponible: 2 * GB }, 15), 'critico');
  assert.equal(nivelMemoria({ ...m, swapLibre: 1 * GB }, 15), 'critico'); // el caso del OOM del 20-oct
  assert.equal(nivelMemoria({ ...m, swapTotal: 0, swapLibre: 0 }, 15), 'bien');
});

test('pausar manda SIGSTOP a todo el árbol y reanudar SIGCONT', () => {
  const señales = [];
  pausar(process.pid, { matar: (p, s) => señales.push([p, s]) });
  assert.deepEqual(señales[0], [process.pid, 'SIGSTOP']);
  señales.length = 0;
  pausar(process.pid, { reanudar: true, matar: (p, s) => señales.push([p, s]) });
  assert.ok(señales.every(([, s]) => s === 'SIGCONT') && señales.some(([p]) => p === process.pid));
});
