/**
 * Galleria animata, disposizione "Pila": carte impilate, quella passata esce verso sinistra ruotando.
 * Importata da frontend/entrypoints/gallery.js; base comune in frontend/scripts/gallery-arrangements.js.
 */

import { X_AXIS, clamp, track } from '@/scripts/gallery-arrangements.js';

export default track({
  direction: () => X_AXIS,
  spacing: (ctx) => ctx.width,
  // Con il ciclo, solo la carta appena passata resta "davanti": le altre tornano in fondo alla pila
  // (con una sola carta l'intervallo [-1, 0) la nasconderebbe sempre)
  wrapStart: (ctx) => (ctx.count > 1 ? -1 : -0.5),
  place(d, ctx) {
    const o = ctx.options;
    if (d < 0) {
      // Carta già passata: esce verso sinistra ruotando
      return { x: d * ctx.width * 1.1, z: 1, rz: d * 10, opacity: clamp(1 + d, 0, 1) };
    }
    // -d px: con profondità 0 la carta in cima resta comunque davanti alle altre
    return { y: -o.peek * d, z: -o.depth * d - d, opacity: clamp(o.visible + 1 - d, 0, 1) };
  },
});
