// Contraste de los temas (D5 del plan): lee los bloques :root y :root[data-tema=…] de web/src/oficina.css, resuelve
// light-dark() y var(), y comprueba WCAG 2.2: texto 4.5:1, controles y anillos de foco 3:1. Sin dependencias.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../web/src/oficina.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// Tokens por bloque: base (:root) y cada tema. Los bloques repetidos de un mismo tema se juntan.
const bloques = { base: {} }
for (const m of css.matchAll(/:root(?:\[data-tema=(\w+)\])?\s*\{([^}]*)\}/g)) {
  const b = (bloques[m[1] ?? 'base'] ??= {})
  for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) b[d[1]] = d[2].trim()
}

// Modo de cada tema (lib/tema.ts): los de juego lo fijan; auto prueba los dos.
const TEMAS = { auto: ['claro', 'oscuro'], claro: ['claro'], oscuro: ['oscuro'], halo: ['oscuro'], cyberpunk: ['oscuro'], doom: ['oscuro'], minecraft: ['claro'] }

function partir(args) { // coma de primer nivel
  const out = []; let d = 0, ini = 0
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '(') d++; else if (args[i] === ')') d--
    else if (args[i] === ',' && d === 0) { out.push(args.slice(ini, i).trim()); ini = i + 1 }
  }
  out.push(args.slice(ini).trim()); return out
}
function resolver(valor, tokens, modo, prof = 0) {
  if (prof > 20) throw new Error(`var() circular: ${valor}`)
  let v = valor
  for (let m; (m = /var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/.exec(v));) {
    const t = tokens[m[1]]; if (t === undefined) throw new Error(`falta ${m[1]}`)
    v = v.slice(0, m.index) + resolver(t, tokens, modo, prof + 1) + v.slice(m.index + m[0].length)
  }
  for (let i; (i = v.indexOf('light-dark(')) >= 0;) {
    let d = 0, j = i + 10
    for (; j < v.length; j++) { if (v[j] === '(') d++; else if (v[j] === ')' && --d === 0) break }
    const [claro, oscuro] = partir(v.slice(i + 11, j))
    v = v.slice(0, i) + (modo === 'claro' ? claro : oscuro) + v.slice(j + 1)
  }
  return v.trim()
}
function color(s) { // → [r, g, b, a]
  let m = /^#([0-9a-f]{3,8})$/i.exec(s)
  if (m) {
    let h = m[1]; if (h.length <= 4) h = [...h].map((c) => c + c).join('')
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1)
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s)
  if (m) { const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1] }
  throw new Error(`color no reconocido: ${s}`)
}
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const sobre = (c, f) => c.slice(0, 3).map((v, i) => v * c[3] + f[i] * (1 - c[3]))
// Un fondo translúcido (velo de la escena) se pesa sobre blanco y sobre negro: vale el peor caso.
const peor = (fg, bg) => (bg[3] < 1 ? [[255, 255, 255], [0, 0, 0]] : [[0, 0, 0]]).map((f) => ratio(fg, bg[3] < 1 ? sobre(bg, f) : bg)).reduce((a, b) => Math.min(a, b))

const TEXTO = 4.5, CONTROL = 3
const FONDOS = ['--fondo', '--panel', '--hundido']
const BURBUJAS = ['--esc-papel', '--esc-alerta', '--esc-aviso', '--esc-amarillo', '--esc-gris', '--esc-info']
const pares = [
  ...['--texto', '--suave'].flatMap((f) => FONDOS.map((b) => [f, b, TEXTO])),
  ['--acento-texto', '--acento', TEXTO], ['--sobre-solido', '--verde-solido', TEXTO], ['--sobre-solido', '--rojo-solido', TEXTO],
  ...['--esc-insignia', '--esc-insignia-bien', '--esc-insignia-neutra'].map((b) => ['--sobre-solido', b, TEXTO]),
  ...BURBUJAS.map((b) => ['--esc-tinta', b, TEXTO]),
  ['--cuarto-texto', '--cuarto-fondo', TEXTO], ['--cuarto-lleno-texto', '--cuarto-lleno-fondo', TEXTO],
  ['--boton-texto', '--boton-fondo', TEXTO],
  ['--borde-control', '--panel', CONTROL], ['--foco', '--fondo', CONTROL], ['--foco', '--panel', CONTROL], ['--esc-resalte', '--escenario', CONTROL],
]

for (const [tema, modos] of Object.entries(TEMAS)) for (const modo of modos) {
  test(`contraste: ${tema} (${modo})`, () => {
    const tokens = { ...bloques.base, ...(bloques[tema] ?? {}) }
    const fallos = []
    for (const [f, b, min] of pares) {
      const r = peor(color(resolver(tokens[f] ?? `var(${f})`, tokens, modo)), color(resolver(tokens[b] ?? `var(${b})`, tokens, modo)))
      if (r < min) fallos.push(`${f} sobre ${b}: ${r.toFixed(2)}:1 < ${min}:1`)
    }
    assert.deepEqual(fallos, [])
  })
}
