/**
 * Eseguito da "prelint" (npm run lint).
 *
 * 1. Se snippets/vite-tag.liquid non esiste (es. clone appena fatto) esegue `npm run build`,
 *    così Theme Check trova lo snippet. Se esiste non tocca assets/: una build svuoterebbe la cartella
 *    e, con `shopify theme dev` attivo, cancellerebbe e ricaricherebbe gli asset sul tema remoto.
 * 2. Controlla che ogni file in frontend/entrypoints/ sia presente in vite-tag.liquid. Se ne manca uno,
 *    la section che lo richiama resta senza JS/CSS in silenzio (successo con cart.js: "Rimuovi" ricaricava
 *    la pagina). Causa tipica: watch avviato prima della creazione del file → riavviare il watch.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viteTag = join(root, 'snippets', 'vite-tag.liquid');

if (!existsSync(viteTag)) {
  console.log('vite-tag.liquid mancante: eseguo la build.');
  execSync('npm run build', { cwd: root, stdio: 'inherit' });
}

const snippet = readFileSync(viteTag, 'utf8');
const missing = readdirSync(join(root, 'frontend', 'entrypoints')).filter(
  (file) => !snippet.includes(`/frontend/entrypoints/${file}"`),
);

if (missing.length) {
  console.warn(
    `\n⚠️  Entrypoint non presenti in snippets/vite-tag.liquid: ${missing.join(', ')}\n` +
      '   Le section che li usano non caricano il loro JS/CSS. Riavvia `npm run start:watch` (o esegui `npm run build`).\n',
  );
} else {
  console.log('vite-tag.liquid: tutti gli entrypoint presenti.');
}
