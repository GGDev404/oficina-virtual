// Planos: tablero y detalle desde una bóveda mínima (fixture recortado de la nota real de Compras, 25-oct-2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tablero, detalle, normalizarEstado, parsearNota, porcentaje } from '../server/planos.js';

const COMPRAS = `---
tipo: estado-modulo
modulo: MOD-COM
fecha: 2026-10-25
---
# Compras · estado y brechas · 25-oct-2026

## 1. Cómo debe funcionar (plano 1.7.1)
Texto. ## no es encabezado

## 2. Qué ya tenemos

### Por ficha F1-COM

| Ficha | Estado | Evidencia en código | Nota |
|---|---|---|---|
| [[F1-COM-01]] Requisiciones | **Parcial** | \`Requisicion.cs\` | Falta [[brechas-abiertas]] fila 19. |
| [[F1-COM-03]] OC desde RQ | Construido | \`Oc/Crear*\` | Respeta el faltante. |
| [[F1-COM-09]] MP → A+W | **No construido** | \`Integraciones.Aw\` | Tarea 86e3jvu83. |
| [[F1-COM-05]] Autorizar OC | Construido (ver §4) | \`OrdenCompra.cs\` | N2 por umbral. |

### Por proceso del plano

| Proceso §7 | Estado | Nota |
|---|---|---|
| 7.1 Requisición | Parcial | Otra tabla: no cuenta. |

## 3. Qué falta

| # | Brecha | Fuente | Tarea ClickUp que la cubre | Tamaño |
|---|---|---|---|---|
| 1 | PDF de la OC con el formato de Millet | §7.7 p2 | 86e3ukuc3 (FMT-2) y 86e3tferp | M |
| 7 | **Transmitir la OC liberada a A+W** | §7.11; [[F1-COM-09]] | **SIN TAREA** (86e3jvu83 no la incluye) | M |
| 8 | **RQ: impedir que el capturista se autorice** | §7.1 p4/p6 | **SIN TAREA** | S |

## 4. Contradicciones

| Tema | Plano 1.7.1 | Código | Qué hacer |
|---|---|---|---|
| **Dos firmas en la OC** | Siempre N1 y N2. | N2 solo sobre umbral. | Confirmar con Eliam. |

## 5. Referencia SAP
`;
const PREGUNTAS = `# Preguntas
| ID | Estado | Para | Bloquea | Tarea | Pregunta | Contexto | Enviada | Respuesta | Respondida | Fuente | Módulo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P-001 | por enviar | Eliam | sí | 86e3jvu83 | ¿Transmitir la OC? | c | | | | f | MOD-COM, MOD-MP |
| P-002 | enviada | Jorge | no | 86e3jvu83 | ¿Contrato A+W? | c | 2026-10-22 | | | f | MOD-COM |
| P-003 | respondida | Eliam | sí | x | cerrada | c | | r | 2026-10-23 | f | MOD-COM |
| P-004 | por enviar | Eliam | sí | x | otro módulo | c | | | | f | MOD-ALM |
`;
const EXPEDIENTE = `---
tarea: "F1-COM-07 · Entregas parciales"
clickup: https://app.clickup.com/t/86e3jvu77
rama: feature/oc-incidencias-86e3jvu77
pr: https://github.com/x/y/pull/175
estado: terminada
---
# Expediente
## 8. Historial
| Fecha | Agente | Qué cambió |
|---|---|---|
| 2026-10-21 | Claude Code | Cierre |
| 2026-10-20 | Claude Code | Creación |
`;

const bóveda = () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'planos-'));
  const nota = (rel, texto) => { fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true }); fs.writeFileSync(path.join(raiz, rel), texto); };
  nota('14 Estado por módulo/Compras · estado y brechas 2026-10-25.md', COMPRAS);
  nota('14 Estado por módulo/Almacén · estado.md', '---\ntipo: estado-modulo\nmodulo: ALM\nfecha: 2026-10-25\n---\n# Almacén\nsin tablas');
  nota('12 Implementación de tareas/86e3jvu77 · Implementación.md', EXPEDIENTE);
  nota('preguntas.md', PREGUNTAS);
  nota('brechas-abiertas.md', '| Tarea | Brecha | Estado | Notas | Módulo |\n|---|---|---|---|---|\n| 86e3x | uno | abierta | n | MOD-COM |\n| 86e3y | dos | cerrada (abc) | n | MOD-COM |\n| 86e3z | tres | abierta | n | MOD-ALM |\n');
  nota('Otra/ref.md', '---\nmodulo: MOD-COM\n---\n# Referencia\n');
  return { raiz, preguntas: path.join(raiz, 'preguntas.md') };
};

test('estados de §2 se normalizan por prefijo', () => {
  assert.equal(normalizarEstado('**Parcial · solo en rama local**'), 'parcial');
  assert.equal(normalizarEstado('Construido*'), 'construido');
  assert.equal(normalizarEstado('Construido (sólo monto)'), 'construido');
  assert.equal(normalizarEstado('**No construido**'), 'no construido');
  assert.equal(normalizarEstado('quién sabe'), null);
});

test('parsea fichas de §2 (solo la primera tabla), brechas de §3 y contradicciones de §4', () => {
  const d = parsearNota(COMPRAS);
  assert.deepEqual(d.fichas.map((f) => [f.ficha, f.estado]), [['F1-COM-01 Requisiciones', 'parcial'], ['F1-COM-03 OC desde RQ', 'construido'],
    ['F1-COM-09 MP → A+W', 'no construido'], ['F1-COM-05 Autorizar OC', 'construido']]);
  assert.deepEqual(d.falta.map((f) => [f.n, f.sinTarea, f.tamano, f.tareas]), [['1', false, 'M', ['86e3ukuc3', '86e3tferp']], ['7', true, 'M', []], ['8', true, 'S', []]]);
  assert.deepEqual(d.contradicciones, [{ tema: 'Dos firmas en la OC', queHacer: 'Confirmar con Eliam.' }]);
});

test('tablero y detalle de Compras: pct, sinTarea, dudas, auditoría y para saber más', () => {
  const { raiz, preguntas } = bóveda();
  const worktrees = [{ id: 'x', nombre: 'x', ruta: '/r/x', rama: 'feature/oc-incidencias-86e3jvu77', repo: 'erp', sin_commit: 0, sin_subir: 2 },
    { id: 'y', nombre: 'y', ruta: '/r/y', rama: 'otra', repo: 'erp', sin_commit: 0, sin_subir: 0 }];
  const t = tablero({ raiz, preguntas, worktrees, hoy: new Date(2026, 9, 26) });
  assert.equal(t.modulos.length, 7);
  const com = t.modulos.find((m) => m.id === 'MOD-COM');
  // (parcial 1 + construido 2 + no 0 + construido 2) / (4 fichas × 2) = 62.5 → 63
  assert.deepEqual([com.pct, com.sinTarea, com.brechas, com.bloquean, com.dudas, com.sinSubir, com.alertas], [63, 2, 3, 1, 2, 1, 1]);
  const d = detalle('COM', { raiz, preguntas, worktrees });
  assert.equal(d.aviso, undefined);
  assert.deepEqual(d.dudas.abiertas.map((f) => f.id), ['P-001', 'P-002']); // P-003 respondida, P-004 es de Almacén
  assert.deepEqual(d.dudas.bloquean.map((f) => f.id), ['P-001']);
  assert.deepEqual([d.brechas.abiertas.length, d.brechas.cerradas], [1, 1]);
  assert.equal(d.auditoria.hechoPorAgentes[0].ultimo.fecha, '2026-10-21'); // manda la fecha, no el orden
  assert.match(d.auditoria.alertas[0], /86e3jvu77 está terminada/);
  assert.deepEqual(d.paraSaberMas.map((n) => n.ruta), [path.join('Otra', 'ref.md')]);
});

test('nota sin formato o módulo sin nota: aviso y sin excepción; id desconocido es null', () => {
  const { raiz, preguntas } = bóveda();
  assert.equal(detalle('MOD-ALM', { raiz, preguntas }).aviso, 'nota sin formato esperado');
  assert.equal(detalle('MOD-PT', { raiz, preguntas }).aviso, 'nota sin formato esperado');
  assert.equal(detalle('MOD-XYZ', { raiz, preguntas }), null);
  const roto = tablero({ raiz: path.join(raiz, 'no-existe'), preguntas: path.join(raiz, 'no-existe.md') });
  assert.ok(roto.modulos.every((m) => m.aviso === 'nota sin formato esperado'));
});

test('porcentaje pondera por tamaño de brecha cuando §3 trae columna Ficha', () => {
  const fichas = [{ ficha: 'F1-X-01 · 7.1 A', estado: 'construido' }, { ficha: 'F1-X-02 · 7.2 B', estado: 'parcial' }, { ficha: 'F1-X-03', estado: 'no construido' }];
  // hecho 2 + 1 + 0 = 3; pendiente: X-02 con una L (3), X-03 sin brechas (2), transversal S (1) → 3 / (3 + 6) = 33 %
  const falta = [{ fichas: ['F1-X-02'], fichaTexto: 'F1-X-02', tamano: 'L' }, { fichas: [], fichaTexto: '—', tamano: 'S' }];
  assert.deepEqual(porcentaje(fichas, falta).pct, 33);
  assert.match(porcentaje(fichas, falta).base, /^ponderado/);
  // sin columna Ficha: respaldo (2 + 1 + 0) / 6 = 50 %
  assert.deepEqual(porcentaje(fichas, [{ tamano: 'L' }]), { pct: 50, base: porcentaje(fichas, []).base });
});

test('ligar una rama a un módulo: valida, la saca de sinLigar y cuenta en sinSubir del módulo', async () => {
  const { abrir } = await import('../server/db.js');
  const { leerLigas, ligarRama } = await import('../server/planos.js');
  const { autorizar } = await import('../server/guardia.js');
  const db = abrir(':memory:');
  const { raiz, preguntas } = bóveda();
  const worktrees = [{ id: 'z', nombre: 'z', ruta: '/r/z', rama: 'feature/suelta', repo: 'erp', sin_commit: 1, sin_subir: 0 }];
  const antes = tablero({ raiz, preguntas, worktrees, ligas: leerLigas(db) });
  assert.deepEqual(antes.sinLigar.map((w) => w.rama), ['feature/suelta']);
  assert.equal(antes.modulos.find((m) => m.id === 'MOD-ALM').sinSubir, 0);

  assert.deepEqual(ligarRama(db, 'feature/suelta', 'MOD-ALM'), { rama: 'feature/suelta', modulo: 'MOD-ALM' });
  const ligas = leerLigas(db);
  const t = tablero({ raiz, preguntas, worktrees, ligas });
  assert.deepEqual(t.sinLigar, []);
  assert.equal(t.modulos.find((m) => m.id === 'MOD-ALM').sinSubir, 1);
  assert.equal(detalle('MOD-ALM', { raiz, preguntas, worktrees, ligas }).auditoria.sinSubir[0].rama, 'feature/suelta');
  ligarRama(db, 'feature/suelta', 'MOD-TES'); // volver a ligar cambia el módulo
  assert.deepEqual([...leerLigas(db)], [['feature/suelta', 'MOD-TES']]);
  for (const falso of ['constructor', '__proto__', 'toString', ['MOD-ALM']]) assert.throws(() => ligarRama(db, 'x', falso), /módulo/);
  assert.equal(tablero({ raiz, preguntas, worktrees: [{ ...worktrees[0], rama: 'constructor' }], ligas: leerLigas(db) }).sinLigar.length, 1);
  ligarRama(db, 'feature/suelta', null); // desligar
  assert.equal(leerLigas(db).size, 0);

  assert.throws(() => ligarRama(db, 'x', 'MOD-XYZ'), /módulo/);
  for (const mala of ['', '  ', 'a'.repeat(201), 'a\nb', 7, null]) assert.throws(() => ligarRama(db, mala, 'MOD-ALM'), /rama/);

  // la guardia lo trata como cualquier POST que actúa en tu nombre: sin cookie no pasa
  const req = { method: 'POST', url: '/api/planos/ligar', headers: { host: 'localhost:1', 'content-type': 'application/json' } };
  assert.equal(autorizar(req, { hosts: new Set(['localhost:1']), token: 't'.repeat(64) }).status, 401);
});
