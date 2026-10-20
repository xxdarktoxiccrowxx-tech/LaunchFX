import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

async function walk(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) result.push(...await walk(file));
    else result.push(file);
  }
  return result;
}
let failures = 0;
for (const directory of ['src', 'scripts', 'tests']) {
  for (const file of await walk(directory)) {
    if (/\.(?:js|cjs|mjs)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', resolve(file)], { encoding: 'utf8' });
      if (result.status !== 0) { console.error(file, result.stderr); failures++; }
    }
    if (file.endsWith('.json')) {
      try { JSON.parse(await readFile(file, 'utf8')); }
      catch (error) { console.error(file, error.message); failures++; }
    }
  }
}
const catalog = JSON.parse(await readFile('src/shared/catalog.json', 'utf8'));
if (catalog.length < 10 || new Set(catalog.map(effect => effect.id)).size !== catalog.length) {
  console.error('Catalog must contain at least 10 distinct effects.'); failures++;
}
if (failures) process.exitCode = 1;
else console.log(`Syntax and catalog checks passed (${catalog.length} effects).`);
