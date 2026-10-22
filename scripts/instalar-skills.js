#!/usr/bin/env node
// Copia las skills del ERP Millet (skills/<nombre>/) a la carpeta de skills de un proyecto, sin pisar las que ya
// existen (como `cp -rn`). Van al proyecto y no a ~/.claude para que solo carguen en las sesiones de ese repo.
// --quitar borra solo las que siguen idénticas a las del repo.
// Uso: node scripts/instalar-skills.js <repo>/.claude/skills [--quitar]
import fs from 'node:fs';
import path from 'node:path';

const ORIGEN = path.resolve(import.meta.dirname, '..', 'skills');
const destinoBase = process.argv.slice(2).find((a) => !a.startsWith('--'));
const quitar = process.argv.includes('--quitar');
if (!destinoBase) { console.error('Uso: node scripts/instalar-skills.js <repo>/.claude/skills [--quitar]'); process.exit(2); }

const leer = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
for (const nombre of fs.readdirSync(ORIGEN).filter((n) => fs.existsSync(path.join(ORIGEN, n, 'SKILL.md'))).sort()) {
  const origen = path.join(ORIGEN, nombre, 'SKILL.md'), destino = path.join(destinoBase, nombre, 'SKILL.md');
  const actual = leer(destino), nuevo = leer(origen);
  if (quitar) {
    if (actual === null) continue;
    if (actual === nuevo) { fs.rmSync(path.join(destinoBase, nombre), { recursive: true }); console.log(`quitada ${nombre}`); }
    else console.log(`se queda ${nombre} (la editaste)`);
  } else if (actual !== null) console.log(`ya existe ${nombre}, no la piso`);
  else { fs.mkdirSync(path.dirname(destino), { recursive: true }); fs.writeFileSync(destino, nuevo); console.log(`instalada ${nombre}`); }
}
