/* =========================================================
   Valida referências: imports dos módulos e IDs usados no JS
   Uso: node tools/validate-refs.mjs
   ========================================================= */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let errors = 0;

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// 1) imports relativos existem?
const jsFiles = walk(join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
for (const file of jsFiles) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
    const target = join(dirname(file), m[1]);
    if (!existsSync(target)) {
      console.error(`❌ import ausente em ${file.replace(ROOT, '')}: ${m[1]}`);
      errors++;
    }
  }
}

// 2) getElementById existe no index.html?
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
for (const file of jsFiles) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/getElementById\('([^']+)'\)/g)) {
    const id = m[1];
    // ids gerados dinamicamente (power-shield/power-x2) são permitidos
    if (!ids.has(id) && !id.startsWith('power-')) {
      console.error(`❌ id "${id}" usado em ${file.replace(ROOT, '')} mas ausente no index.html`);
      errors++;
    }
  }
}

// 3) assets referenciados no HTML existem?
for (const m of html.matchAll(/(?:href|src)="((?!http|#)[^"]+)"/g)) {
  const path = m[1];
  if (!path.includes('.') && !path.endsWith('/')) continue;
  if (!existsSync(join(ROOT, path))) {
    console.error(`❌ asset ausente: ${path}`);
    errors++;
  }
}

// 4) manifest e service worker: arquivos do precache existem?
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
for (const m of sw.matchAll(/'\.\/([^']+)'/g)) {
  const p = m[1];
  if (!p || p.endsWith('/')) continue;
  if (!existsSync(join(ROOT, p))) {
    console.error(`❌ sw.js precache aponta para arquivo ausente: ${p}`);
    errors++;
  }
}

console.log(errors === 0 ? '✅ todas as referências OK' : `❌ ${errors} problema(s)`);
process.exit(errors ? 1 : 0);
