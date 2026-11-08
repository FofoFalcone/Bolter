/**
 * Plugin Vite (solo nel watch): dopo ogni build elimina da assets/ i file che la build non ha prodotto.
 *
 * Problema: nel watch assets/ non viene svuotata (emptyOutDir: false, per non far cancellare e ricaricare tutto
 * a `shopify theme dev` a ogni salvataggio), quindi ogni build lascia i file con l'hash precedente. Dopo qualche
 * giorno erano 283 file (14,7 MB, 39 versioni di theme.js): theme dev li carica tutti sul tema remoto, rallentando
 * l'avvio e riempiendo il tema di file inutili.
 *
 * Soluzione: si tengono solo i file del bundle appena scritto (chunk, CSS, asset, manifest) e quelli copiati da
 * frontend/public; tutto il resto in assets/ è generato e obsoleto. theme dev, già attivo, rimuove gli stessi
 * file dal tema remoto. La build di produzione non usa il plugin (svuota assets/ con emptyOutDir).
 */

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

export default function pruneStaleAssets({ publicDir }) {
  let outDir;
  let publicFiles = new Set();

  return {
    name: 'bolt:prune-stale-assets',
    apply: 'build',

    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      const publicPath = resolve(config.root, publicDir);
      publicFiles = new Set(existsSync(publicPath) ? readdirSync(publicPath) : []);
    },

    // Dopo i writeBundle degli altri plugin: i file nuovi sono già scritti
    writeBundle: {
      order: 'post',
      sequential: true,
      handler(_options, bundle) {
        const keep = new Set(Object.keys(bundle));
        let removed = 0;
        for (const entry of readdirSync(outDir, { withFileTypes: true })) {
          // Solo file al primo livello (assets/ su Shopify è piatta); .vite/ contiene il manifest corrente
          if (!entry.isFile() || keep.has(entry.name) || publicFiles.has(entry.name)) continue;
          rmSync(join(outDir, entry.name));
          removed++;
        }
        if (removed) this.info(`${removed} file obsoleti rimossi da ${outDir}`);
      },
    },
  };
}
