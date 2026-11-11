/**
 * Confronto dei file JS che il browser scarica, prima e dopo una modifica (build di verifica in .build-check/).
 *
 *   npm run chunks:save      build di verifica + copia in .build-check-baseline/ (il "prima")
 *   … modifica …
 *   npm run chunks:compare   build di verifica + confronto con il "prima"
 *
 * Per ogni entrypoint e ogni import dinamico (es. animations.js caricato da theme.js) conta i file che si porta
 * dietro con gli import statici, cioè le richieste che partono insieme, e il loro peso gzip. Stampa solo ciò che
 * cambia, più il totale di tutto il JS: se il totale cresce molto senza motivo, il bundler sta duplicando moduli
 * (successo il 2026-11-11 con la cartella aperta come "c:\", vedi vite.config.js).
 *
 * Perché serve: con Vite un modulo condiviso finisce in un chunk a sé. Spostare una riga in un file comune può
 * aggiungere una richiesta a un entrypoint (il 2026-11-11, prefersReducedMotion: 4 entrypoint su 5 peggioravano).
 */

import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const current = join(root, '.build-check');
const baseline = join(root, '.build-check-baseline');

const kib = (bytes) => (bytes / 1024).toFixed(2);

function readBuild(dir) {
  const manifestPath = join(dir, '.vite', 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(`Manifest non trovato in ${dir}: esegui prima npm run build:check.`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const gzip = new Map();
  const sizeOf = (file) => {
    if (!gzip.has(file)) gzip.set(file, gzipSync(readFileSync(join(dir, file))).length);
    return gzip.get(file);
  };

  const loads = {};
  for (const [key, entry] of Object.entries(manifest)) {
    if (!(entry.isEntry || entry.isDynamicEntry) || !entry.file.endsWith('.js')) continue;
    const seen = new Set();
    const stack = [key];
    while (stack.length) {
      const next = stack.pop();
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...(manifest[next].imports ?? []));
    }
    const name = key.replace(/^frontend\/(entrypoints\/)?/, '');
    loads[entry.isEntry ? name : `(dinamico) ${name}`] = {
      files: seen.size,
      bytes: [...seen].reduce((sum, k) => sum + sizeOf(manifest[k].file), 0),
    };
  }

  const jsFiles = readdirSync(dir).filter((file) => file.endsWith('.js'));
  const total = { files: jsFiles.length, bytes: jsFiles.reduce((sum, file) => sum + sizeOf(file), 0) };
  return { loads, total };
}

if (process.argv[2] === 'save') {
  readBuild(current); // controlla che la build ci sia
  rmSync(baseline, { recursive: true, force: true });
  cpSync(current, baseline, { recursive: true });
  console.log('Build salvata come riferimento in .build-check-baseline/. Dopo la modifica: npm run chunks:compare');
  process.exit(0);
}

if (!existsSync(baseline)) {
  console.error('Nessun riferimento salvato: esegui npm run chunks:save prima della modifica.');
  process.exit(1);
}

const before = readBuild(baseline);
const after = readBuild(current);
const rows = [];
for (const name of new Set([...Object.keys(before.loads), ...Object.keys(after.loads)])) {
  const a = before.loads[name];
  const b = after.loads[name];
  if (!a || !b) {
    rows.push(`${name}: ${a ? 'non esiste più' : 'nuovo'}`);
    continue;
  }
  if (a.files === b.files && Math.abs(a.bytes - b.bytes) < 10) continue;
  const flag = b.files > a.files ? '  ← una richiesta in più' : '';
  rows.push(
    `${name.padEnd(44)} ${String(a.files).padStart(2)} → ${String(b.files).padStart(2)} file   ` +
      `${kib(a.bytes)} → ${kib(b.bytes)} KiB gz${flag}`,
  );
}

console.log(rows.length ? rows.sort().join('\n') : 'Nessuna differenza nei file scaricati.');
console.log(
  `\nTotale JS: ${before.total.files} → ${after.total.files} file, ` +
    `${kib(before.total.bytes)} → ${kib(after.total.bytes)} KiB gz`,
);
