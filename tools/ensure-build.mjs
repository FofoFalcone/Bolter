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

// 3. CSS inlinati con inline_asset_content (tutti gli entrypoint CSS tranne theme.css, vite.config.js):
//    snippets/page-transitions.liquid e snippets/inline-css.liquid. Shopify li inlina solo sotto i 15 KB, e solo
//    se il file senza hash esiste: un watch avviato prima di una modifica a vite.config.js produce ancora i nomi
//    con hash e la section resta senza stili. Controllo sull'ultima build disponibile, con margine a 14 KB.
const INLINE_LIMIT = 14 * 1024;
const inlineCss = readdirSync(join(root, 'frontend', 'entrypoints')).filter(
  (file) => file.endsWith('.css') && file !== 'theme.css',
);
for (const dir of ['assets', '.build-check']) {
  if (!existsSync(join(root, dir))) continue;
  for (const name of inlineCss) {
    const file = join(root, dir, name);
    if (!existsSync(file)) {
      if (dir === 'assets') {
        console.warn(
          `\n⚠️  assets/${name} mancante: inline_asset_content non trova il file e la section resta senza stili. ` +
            'Riavvia `npm run start:watch` (o esegui `npm run build`).\n',
        );
      }
      continue;
    }
    const size = readFileSync(file).length;
    if (size > INLINE_LIMIT) {
      console.warn(
        `\n⚠️  ${dir}/${name} pesa ${(size / 1024).toFixed(1)} KB: oltre i 15 KB Shopify non lo inlina più ` +
          '(inline_asset_content) e la parte che lo usa resta senza stili. Alleggeriscilo.\n',
      );
    }
  }
}

if (missing.length) {
  console.warn(
    `\n⚠️  Entrypoint non presenti in snippets/vite-tag.liquid: ${missing.join(', ')}\n` +
      '   Le section che li usano non caricano il loro JS/CSS. Riavvia `npm run start:watch` (o esegui `npm run build`).\n',
  );
} else {
  console.log('vite-tag.liquid: tutti gli entrypoint presenti.');
}

// 4. Icone (tools/build-icons.mjs): la misura va nel parametro size, che sceglie anche il disegno Heroicons nitido
//    per quella misura. Una size-* di base nella classe ridimensiona il disegno da 20px e lo fa uscire sgranato.
const iconIssues = [];
for (const dir of ['sections', 'snippets', 'blocks', 'layout', 'templates']) {
  if (!existsSync(join(root, dir))) continue;
  for (const file of readdirSync(join(root, dir))) {
    if (!file.endsWith('.liquid') || file === 'icon.liquid') continue;
    const source = readFileSync(join(root, dir, file), 'utf8');
    for (const match of source.matchAll(/render 'icon'[\s\S]*?%\}/g)) {
      const classes = match[0].match(/class:\s*'([^']*)'/)?.[1] ?? '';
      if (/(^|\s)size-/.test(classes)) {
        const line = source.slice(0, match.index).split('\n').length;
        iconIssues.push(`${dir}/${file}:${line}`);
      }
    }
  }
}
if (iconIssues.length) {
  console.warn(
    `\n⚠️  Icone con la misura nella classe (usa il parametro size: 16, 20, 24, 32, 48 o 'full'):\n   ${iconIssues.join('\n   ')}\n`,
  );
}
