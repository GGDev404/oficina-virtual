#!/usr/bin/env node
// Copia los subagentes por rol (agentes/*.md) a ~/.claude/agents/ sin pisar los que ya existen (como `cp -n`).
// --quitar borra solo los que siguen idénticos a los del repo: uno que editaste se queda.
// --forzar reemplaza los que difieren y deja el anterior como <rol>.md.<ts>.bak (para pasar a una versión nueva de los roles).
// Uso: node scripts/instalar-agentes.js [--quitar | --forzar]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ORIGEN = path.resolve(import.meta.dirname, '..', 'agentes');
const DESTINO = path.join(os.homedir(), '.claude', 'agents');
const quitar = process.argv.includes('--quitar');
const forzar = process.argv.includes('--forzar');

if (!quitar) fs.mkdirSync(DESTINO, { recursive: true });
for (const f of fs.readdirSync(ORIGEN).filter((n) => n.endsWith('.md')).sort()) {
  const destino = path.join(DESTINO, f);
  const existe = fs.existsSync(destino);
  const igual = existe && fs.readFileSync(destino, 'utf8') === fs.readFileSync(path.join(ORIGEN, f), 'utf8');
  if (quitar) {
    if (!existe) continue;
    if (igual) { fs.unlinkSync(destino); console.log(`quitado ${f}`); } else console.log(`se queda ${f} (lo editaste)`);
  } else if (existe && igual) console.log(`ya existe ${f}, ya está al día`);
  else if (existe && forzar) { const bak = `${destino}.${Date.now()}.bak`; fs.copyFileSync(destino, bak); fs.copyFileSync(path.join(ORIGEN, f), destino); console.log(`actualizado ${f} (anterior en ${path.basename(bak)})`); }
  else if (existe) console.log(`ya existe ${f}, no lo piso (usa --forzar para reemplazarlo con respaldo)`);
  else { fs.copyFileSync(path.join(ORIGEN, f), destino, fs.constants.COPYFILE_EXCL); console.log(`instalado ${f}`); }
}
