/**
 * `vite build --watch` che si riavvia da solo quando cambiano gli entrypoint.
 *
 * Problema: vite-plugin-shopify calcola l'elenco degli entrypoint (frontend/entrypoints/*) all'avvio.
 * Un file aggiunto dopo non viene compilato e non finisce in snippets/vite-tag.liquid: la section che lo
 * richiama resta senza JS/CSS in silenzio (es. carrello senza cart.js → "Rimuovi" ricarica la pagina e
 * ogni rimozione aggiunge una voce alla cronologia del browser).
 *
 * Soluzione: si osserva la cartella degli entrypoint e, se l'elenco dei file cambia, si riavvia Vite.
 *
 * Uso: npm run watch   (argomenti extra dopo `--` passati a Vite, es. `-- --outDir .build-check`)
 *      --measure: output da produzione (minificato, senza sourcemap; mode "measure" in vite.config.js),
 *      usato da `npm run start:measure`
 */

import { spawn } from 'node:child_process';
import { readdirSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entrypointsDir = join(root, 'frontend', 'entrypoints');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const measure = process.argv.includes('--measure');
const extraArgs = process.argv.slice(2).filter((arg) => arg !== '--measure');
const mode = measure ? 'measure' : 'development';

const listEntries = () => readdirSync(entrypointsDir).sort().join('|');

let child;
let entries = listEntries();
let restartTimer;
let stopping = false;

function start() {
  child = spawn(process.execPath, [viteBin, 'build', '--watch', '--mode', mode, ...extraArgs], {
    cwd: root,
    stdio: 'inherit',
  });
  child.on('exit', (code) => {
    if (!stopping && !child.restarting) process.exit(code ?? 0);
  });
}

function restart(reason) {
  console.log(`\n[watch] ${reason}: riavvio di Vite per includere gli entrypoint aggiornati…\n`);
  const previous = child;
  previous.restarting = true;
  previous.once('exit', start);
  previous.kill();
}

watch(entrypointsDir, () => {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    const current = listEntries();
    if (current === entries) return; // modifica a un file esistente: ci pensa già Vite
    entries = current;
    restart('entrypoint aggiunto o rimosso');
  }, 300);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    child?.kill();
    process.exit(0);
  });
}

start();
