// Bóveda de Obsidian (OFICINA_BOVEDA), solo lectura: índice de notas .md con frontmatter, título y wikilinks.
// El caché va por mtimeMs: cada barrido solo relee los archivos que cambiaron y suelta los borrados.
import fs from 'node:fs';
import path from 'node:path';

const EXCLUIDAS = /^(\.obsidian|_respaldos.*|videos-flujos|evidencias|Datos y scripts)$/;
const cache = new Map(); // ruta absoluta → {mtimeMs, nota}

const sinComillas = (v) => v.replace(/^(["'])(.*)\1$/, '$2');

// YAML simple: `clave: valor`, listas en línea `[a, b]` y listas en bloque `- x`. Lo demás se ignora.
export function leerFrontmatter(texto) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto);
  const fm = {};
  if (!m) return fm;
  let clave = null; // última clave vacía: si la siguen `- x` se vuelve lista
  for (const linea of m[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(linea);
    if (item && clave) { if (!Array.isArray(fm[clave])) fm[clave] = []; fm[clave].push(sinComillas(item[1].trim())); continue; }
    const kv = /^([\w-]+):\s*(.*)$/.exec(linea);
    clave = null;
    if (!kv) continue;
    const v = kv[2].trim();
    if (v === '') { fm[kv[1]] = ''; clave = kv[1]; }
    else if (v.startsWith('[') && v.endsWith(']')) fm[kv[1]] = v.slice(1, -1).split(',').map((x) => sinComillas(x.trim())).filter(Boolean);
    else fm[kv[1]] = sinComillas(v);
  }
  return fm;
}

const leerNota = (abs, rel, mtimeMs) => {
  const texto = fs.readFileSync(abs, 'utf8');
  const enlaces = [...new Set([...texto.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)].map((x) => x[1].trim()))];
  return {
    ruta: rel, titulo: /^#\s+(.+)$/m.exec(texto.replace(/^---[\s\S]*?\n---/, ''))?.[1].trim() ?? path.basename(rel, '.md'),
    frontmatter: leerFrontmatter(texto), mtime: mtimeMs, enlaces,
  };
};

export function indice(raiz) {
  const vistas = new Set();
  const lista = [];
  const recorrer = (dir) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (EXCLUIDAS.test(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { recorrer(abs); continue; } // los symlinks no se siguen
      if (!e.isFile() || !e.name.endsWith('.md')) continue;
      try {
        const { mtimeMs } = fs.statSync(abs);
        vistas.add(abs);
        let c = cache.get(abs);
        if (!c || c.mtimeMs !== mtimeMs) cache.set(abs, c = { mtimeMs, nota: leerNota(abs, path.relative(raiz, abs), mtimeMs) });
        lista.push(c.nota);
      } catch { /* borrado o ilegible entre el listado y la lectura */ }
    }
  };
  recorrer(raiz);
  for (const k of cache.keys()) if (k.startsWith(raiz) && !vistas.has(k)) cache.delete(k);
  return lista;
}

// `MOD-ALM` y `ALM` → `MOD-ALM`; Maestros/administración (`ADM`) es `MOD-MAE`. Otro valor → null.
export function moduloDe(valor) {
  const m = /^(?:MOD-)?([A-Z]{2,3})$/.exec(String(valor ?? '').trim().toUpperCase());
  return m ? `MOD-${m[1] === 'ADM' ? 'MAE' : m[1]}` : null;
}
