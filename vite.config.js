import { defineConfig } from 'vite';
import shopify from 'vite-plugin-shopify';
import tailwindcss from '@tailwindcss/vite';
import pruneStaleAssets from './tools/prune-stale-assets.mjs';

const PUBLIC_DIR = 'frontend/public';

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
        ? { exclude: ['assets/**', 'snippets/vite-tag.liquid', '.build-check/**', 'node_modules/**'] }
        : null,

      rollupOptions: {
        output: {
          assetFileNames: '[name].[hash][extname]',
          chunkFileNames: '[name].[hash].js',
          entryFileNames: '[name].[hash].js',
        },
      },
    },
  };
});
