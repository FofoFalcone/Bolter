/**
 * Plugin Vite: avvisi di licenza nei file compilati (LICENSE, THIRD_PARTY_NOTICES.md).
 *
 * La minificazione toglie tutti i commenti e Motion/Lenis non hanno commenti di licenza nei loro dist: senza
 * questo plugin i bundle sul CDN di Shopify non dicono di chi sono, né che contengono codice MIT di terzi.
 * - theme.js e theme.css (sempre caricati): titolarità del tema; theme.css anche Tailwind (Preflight e utility).
 * - Ogni chunk JS con codice di una libreria MIT: il suo avviso di copyright, breve (pochi byte compressi).
 * Testo completo delle licenze: snippets/license.liquid (npm run license), che viaggia con il tema.
 * I CSS inlinati nel Liquid restano senza: finirebbero in ogni pagina HTML e sono solo codice del tema.
 *
 * Gira alla fine di generateBundle, dopo la minificazione e dopo che Vite ha riscritto theme.js (mappa dei
 * preload, __vite__mapDeps): un'intestazione aggiunta prima andrebbe persa. Gli hash dei nomi non la includono:
 * cambiarne solo il testo non cambia il nome del file (sul CDN Shopify vale comunque il parametro ?v= di asset_url).
 */

const GLOBAL_ENTRY = 'theme';
const OWNER = 'Bolter Theme (c) 2026 Alfonso Falcone. Tutti i diritti riservati. Licenze: snippets/license.liquid';

// Pacchetti MIT che finiscono nei bundle JS (stesso elenco di THIRD_PARTY_NOTICES.md)
const LIBRARIES = [
  { match: /node_modules[\\/](motion|motion-dom|motion-utils)[\\/]/, notice: 'Motion (c) 2024 Motion B.V., MIT License' },
  { match: /node_modules[\\/]framer-motion[\\/]/, notice: 'Framer Motion (c) 2018 Framer B.V., MIT License' },
  { match: /node_modules[\\/]lenis[\\/]/, notice: 'Lenis (c) 2024 darkroom.engineering, MIT License' },
];
const TAILWIND = 'Tailwind CSS (c) Tailwind Labs, Inc., MIT License';

const comment = (lines) => `/*! ${lines.join(' | ')} */\n`;

function addBanners(_options, bundle) {
  for (const file of Object.values(bundle)) {
    if (file.type === 'chunk') {
      const lines = [];
      if (file.isEntry && file.name === GLOBAL_ENTRY) lines.push(OWNER);
      for (const { match, notice } of LIBRARIES) {
        if (file.moduleIds.some((id) => match.test(id))) lines.push(notice);
      }
      if (lines.length) file.code = comment(lines) + file.code;
    } else if (file.fileName.startsWith(`${GLOBAL_ENTRY}.`) && file.fileName.endsWith('.css')) {
      file.source = comment([OWNER, TAILWIND]) + String(file.source);
    }
  }
}

export default function licenseBanner() {
  return {
    name: 'bolter:license-banner',
    apply: 'build',
    enforce: 'post',
    generateBundle: { order: 'post', handler: addBanners },
  };
}
