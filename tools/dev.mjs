/**
 * Avvio dello sviluppo in sequenza: prima la build in watch (tools/watch.mjs), poi `shopify theme dev`.
 *
 * Problema (avvio in parallelo): all'avvio theme dev carica sul tema di sviluppo i file locali così come
 * sono in quel momento, mentre Vite sta ancora rigenerando assets/ e snippets/vite-tag.liquid. Le scritture
 * fatte durante il caricamento iniziale andavano perse: sul tema remoto restavano asset vecchi o mancanti
 * (tema senza CSS; carrello senza cart.js).
 *
 * Soluzione: si avvia il watch, si attende la prima build completa, poi si avvia theme dev.
 * Le build successive generano eventi che theme dev, ormai attivo, carica normalmente.
 *
 * Sincronizzazione con il theme editor (--sync): di base theme dev va in una sola direzione (locale → tema
 * di sviluppo) e all'avvio sostituisce il tema remoto con i file locali, quindi le modifiche fatte nel theme
 * editor restano solo sul tema remoto e vanno perse al riavvio. Con --sync si passa --theme-editor-sync:
 * la CLI riporta nei file locali i JSON modificati dall'editor (templates/*.json, sections/*-group.json,
 * config/settings_data.json). Se all'avvio un JSON locale e quello remoto sono diversi, la CLI chiede quale
 * tenere (o usa --reconciliation-strategy, passabile dopo `--`).
 *
 * Uso:
 *   node tools/dev.mjs            → watch + theme dev                                  (npm run start:watch)
 *   node tools/dev.mjs --events   → come sopra, con l'inspector degli standard events  (npm run start:events)
 *   node tools/dev.mjs --sync     → come start:watch, con le modifiche dell'editor
 *                                   salvate nei file locali                            (npm run start:sync)
 *   node tools/dev.mjs --measure  → come start:watch, ma con output da produzione (minificato, senza
 *                                   sourcemap) per una prima misura con Lighthouse     (npm run start:measure)
 *   Le opzioni si combinano (npm run start:sync -- --events). Gli argomenti dopo `--` vanno a theme dev,
 *   es. npm run start:sync -- -- --reconciliation-strategy keep-remote
 * Variabili opzionali (test): DEV_THEME_COMMAND (eseguibile al posto di `shopify theme dev`, a cui
 * vengono passati gli stessi flag), DEV_WATCH_ARGS (argomenti extra per tools/watch.mjs).
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Opzioni di questo script prima di `--`, argomenti per theme dev dopo
const args = process.argv.slice(2);
const separator = args.indexOf('--');
const options = separator === -1 ? args : args.slice(0, separator);
const themeDevArgs = separator === -1 ? [] : args.slice(separator + 1);
const unknown = options.filter((option) => !['--events', '--sync', '--measure'].includes(option));
if (unknown.length) {
  console.error(
    `[dev] Opzioni sconosciute: ${unknown.join(' ')} (valide: --events, --sync, --measure; per theme dev usa \`-- …\`)`,
  );
  process.exit(1);
}

const watchCommand = [
  join(root, 'tools', 'watch.mjs'),
  ...(options.includes('--measure') ? ['--measure'] : []),
  ...(process.env.DEV_WATCH_ARGS?.split(' ').filter(Boolean) ?? []),
];
if (options.includes('--measure')) {
  console.log(
    '[dev] Modalità misura: build minificata e senza sourcemap, come in produzione. Per i numeri ufficiali\n' +
      '      usa PageSpeed Insights sul tema caricato con `npm run shopify:push:dev`.\n',
  );
}

// Segnale di "pronto": fine della prima build
const READY = /built in/;

const children = [];
let themeDevStarted = false;

function shutdown(code = 0) {
  children.forEach((child) => child.kill());
  process.exit(code);
}

const vite = spawn(process.execPath, watchCommand, { cwd: root, stdio: ['inherit', 'pipe', 'pipe'] });
children.push(vite);

const forward = (stream, target) =>
  stream.on('data', (chunk) => {
    target.write(chunk);
    if (!themeDevStarted && READY.test(chunk.toString())) startThemeDev();
  });
forward(vite.stdout, process.stdout);
forward(vite.stderr, process.stderr);
vite.on('exit', (code) => shutdown(code ?? 0));

function startThemeDev() {
  themeDevStarted = true;
  console.log('\n[dev] Prima build di Vite completata: avvio shopify theme dev…\n');
  // Sempre sull'ambiente `local` (tema development personale), mai sul tema condiviso
  const flags = ['--environment local', '--live-reload hot-reload'];
  if (options.includes('--events')) flags.push('--standard-events-inspector');
  if (options.includes('--sync')) {
    flags.push('--theme-editor-sync');
    console.log(
      '[dev] Sincronizzazione con il theme editor attiva: le modifiche fatte nell\'editor del tema di sviluppo\n' +
        '      vengono salvate nei file JSON locali (templates, section group, config/settings_data.json).\n',
    );
  }
  flags.push(...themeDevArgs);
  const command = `${process.env.DEV_THEME_COMMAND ?? 'shopify theme dev'} ${flags.join(' ')}`;
  const themeDev = spawn(command, { cwd: root, stdio: 'inherit', shell: true });
  children.push(themeDev);
  themeDev.on('exit', (code) => shutdown(code ?? 0));
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown(0));
