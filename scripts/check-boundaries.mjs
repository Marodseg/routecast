// Comprueba que las reglas de frontera de biome.json siguen funcionando: cada caso escribe un fichero
// temporal en el paquete, lo pasa por `biome lint` y verifica que la regla salta (o no) según lo esperado.
// Evita que una actualización de Biome desactive las fronteras en silencio.
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cases = [
  { pkg: 'core', code: "import x from '@routecast/providers';", rule: 'noRestrictedImports', blocked: true },
  { pkg: 'core', code: "import x from '../../providers/src/index';", rule: 'noRestrictedImports', blocked: true },
  { pkg: 'core', code: "import x from '../../../apps/web/src/main';", rule: 'noRestrictedImports', blocked: true },
  { pkg: 'core', code: "import x from 'zod';", rule: 'noRestrictedImports', blocked: true },
  { pkg: 'core', code: "import x from './geo';", rule: 'noRestrictedImports', blocked: false },
  { pkg: 'core', code: "import x from '@routecast/shared';", rule: 'noRestrictedImports', blocked: false },
  { pkg: 'core', code: 'const x = fetch;', rule: 'noRestrictedGlobals', blocked: true },
  { pkg: 'core', code: 'const x = Date.now();', rule: 'noRestrictedGlobals', blocked: true },
  { pkg: 'core', code: 'const x = globalThis;', rule: 'noRestrictedGlobals', blocked: true },
  { pkg: 'shared', code: "import x from '@routecast/core';", rule: 'noRestrictedImports', blocked: true },
  { pkg: 'shared', code: "import x from '../../core/src/index';", rule: 'noRestrictedImports', blocked: true },
  { pkg: 'shared', code: "import x from 'zod';", rule: 'noRestrictedImports', blocked: false },
  { pkg: 'providers', code: "import x from '@routecast/core';", rule: 'noRestrictedImports', blocked: true },
  { pkg: 'providers', code: "import x from '../../core/src/index';", rule: 'noRestrictedImports', blocked: true },
  { pkg: 'providers', code: "import x from '@routecast/shared';", rule: 'noRestrictedImports', blocked: false },
];

const BIOME = fileURLToPath(import.meta.resolve('@biomejs/biome/bin/biome'));
const files = cases.map((c, i) => `packages/${c.pkg}/src/__boundary_probe_${i}.ts`);

let report;
try {
  for (const [i, c] of cases.entries()) writeFileSync(files[i], `${c.code}\nexport const probe = x;\n`);
  let out;
  try {
    out = execFileSync(process.execPath, [BIOME, 'lint', '--reporter=json', ...files], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    out = err.stdout; // biome sale con código 1 cuando hay diagnósticos
  }
  report = JSON.parse(out.slice(out.indexOf('{')));
} finally {
  for (const f of files) rmSync(f, { force: true });
}

const norm = (p) => p.replaceAll('\\', '/');
let failures = 0;
cases.forEach((c, i) => {
  const hit = report.diagnostics.some(
    (d) => norm(d.location?.path?.file ?? d.location?.path ?? '').endsWith(files[i]) && d.category?.endsWith(c.rule),
  );
  if (hit !== c.blocked) {
    failures++;
    console.error(`✗ ${c.pkg}: \`${c.code}\` debería ${c.blocked ? 'bloquearse' : 'permitirse'} (${c.rule})`);
  }
});

if (failures) {
  console.error(`\n${failures} caso(s) de frontera fallan. Revisa biome.json → overrides.`);
  process.exit(1);
}
console.warn(`✓ Fronteras de paquetes OK (${cases.length} casos)`);
