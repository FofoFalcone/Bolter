import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import shopify from 'vite-plugin-shopify';
import tailwindcss from '@tailwindcss/vite';
import pruneStaleAssets from './tools/prune-stale-assets.mjs';

// Cartella del progetto con la lettera del disco nella forma reale ("C:\"), non come l'ha scritta il terminale.
// Aperta come "c:\" (VS Code, Git Bash), lo stesso file arrivava al bundler con due id (radice e alias "@/" di
// vite-plugin-shopify da process.cwd(), import risolti in "C:\"): moduli duplicati in più chunk, misurato il
// 2026-11-11 (55 file JS e 86,8 KiB gzip contro 54 e 78,5 KiB). Radice e alias usano quindi questo percorso.
const ROOT = fs.realpathSync.native(process.cwd());
const SOURCE_DIR = path.join(ROOT, 'frontend');

const PUBLIC_DIR = 'frontend/public';
// CSS inlinato nel Liquid con inline_asset_content: nome stabile (vedi assetFileNames). Tutti i CSS degli
// entrypoint tranne theme.css (page-transitions.css nel <head>, quelli delle section con snippets/inline-css.liquid).
const GLOBAL_CSS = 'theme.css';
const isInlineCss = (name) => name.endsWith('.css') && name !== GLOBAL_CSS;

export default defineConfig(({ mode }) => {
  // Modalità:
  // - production (npm run build, build:check): minificata, senza sourcemap, assets/ svuotata a ogni build;
  // - development (npm run watch / start:watch): watch non minificato con sourcemap inline, per il debug;
  // - measure (npm run start:measure): watch con output da produzione (minificato, senza sourcemap), per una
  //   prima misura con Lighthouse da DevTools. I numeri ufficiali restano quelli del tema caricato con
  //   `npm run shopify:push:dev` (PageSpeed Insights non raggiunge l'anteprima locale di theme dev).
  // Nel watch assets/ non viene svuotata (Vite lo farebbe a ogni salvataggio, causando cancellazioni e
  // ricaricamenti continui su `shopify theme dev`): i file obsoleti li toglie pruneStaleAssets.
  const isWatch = mode === 'development' || mode === 'measure';
  const isDebug = mode === 'development';

  return {
    root: ROOT,
    // Stessi alias di vite-plugin-shopify (che li unisce ai suoi dando la precedenza a questi), sul percorso normalizzato
    resolve: {
      alias: { '@': SOURCE_DIR, '~': SOURCE_DIR },
    },

    // File copiati così come sono in assets/ (es. favicon, immagini richiamate con asset_url dal Liquid).
    // Il plugin lo disattiva di default: lo riattiviamo puntando a frontend/public.
    publicDir: PUBLIC_DIR,

    plugins: [
      // Tailwind CSS v4: configurazione CSS-first in frontend/entrypoints/theme.css (@theme, @source).
      tailwindcss(),
      shopify({
        sourceCodeDir: 'frontend',
        entrypointsDir: 'frontend/entrypoints',
      }),
      // Watch: dopo ogni build elimina da assets/ i file con hash non più prodotti (tools/prune-stale-assets.mjs)
      isWatch && pruneStaleAssets({ publicDir: PUBLIC_DIR }),
    ],

    build: {
      // assets/ è interamente generata: la build di deploy la svuota per eliminare i file con hash obsoleti.
      emptyOutDir: !isWatch,
      // Inline: funzionano anche dal CDN Shopify (file .map separati non verrebbero caricati sul tema).
      sourcemap: isDebug ? 'inline' : false,
      minify: !isDebug,
      assetsInlineLimit: 0,

      // Watch: non osservare i file che la build stessa produce, altrimenti ogni build
      // ne avvia un'altra (assets/ non viene svuotata in watch, quindi Vite non la esclude da solo).
      watch: isWatch
        ? { exclude: ['assets/**', 'snippets/vite-tag.liquid', '.build-check/**', '.build-check-baseline/**', 'node_modules/**'] }
        : null,

      rollupOptions: {
        output: {
          // CSS inlinati senza hash: inline_asset_content vuole il nome esatto (massimo 15 KB, controllato da
          // tools/ensure-build.mjs). Come <link> ognuno era una richiesta in più che bloccava il rendering:
          // page-transitions.css nel <head> (~560 ms stimati da Lighthouse mobile), quelli delle section (sotto
          // 1 KB ciascuno) nel <body>, dove un foglio blocca il disegno di tutto ciò che lo segue.
          assetFileNames: ({ names = [] }) =>
            names.some(isInlineCss) ? '[name][extname]' : '[name].[hash][extname]',
          chunkFileNames: '[name].[hash].js',
          entryFileNames: '[name].[hash].js',
        },
      },
    },
  };
});
