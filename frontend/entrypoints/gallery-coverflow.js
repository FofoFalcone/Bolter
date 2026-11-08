/**
 * Galleria animata, disposizione "Coverflow": elemento centrale frontale, laterali ruotati e affiancati.
 * Importata da frontend/entrypoints/gallery.js; base comune in frontend/scripts/gallery-arrangements.js.
 */

import { X_AXIS, clamp, track } from '@/scripts/gallery-arrangements.js';

export default track({
  direction: () => X_AXIS,
  spacing: (ctx) => ctx.width * ctx.options.center,
  reach(ctx) {
    const o = ctx.options;
    // Oltre il primo elemento laterale ogni passo sposta di spread × larghezza
    const beyondFirst = ctx.stageWidth / 2 + ctx.width - o.center * ctx.width;
    return 1 + Math.ceil(Math.max(0, beyondFirst) / (Math.max(o.spread, 0.05) * ctx.width)) + 1;
  },
  place(d, ctx) {
    const o = ctx.options;
    const near = clamp(d, -1, 1); // tratto tra l'elemento centrale e i primi laterali
    const side = d - near; // oltre: elementi laterali affiancati
    return {
      x: (near * o.center + side * o.spread) * ctx.width,
      // -|side| px: tra elementi laterali sovrapposti, il più vicino al centro resta davanti
      z: -Math.abs(near) * o.depth * ctx.width - Math.abs(side),
      ry: -near * o.turn,
    };
  },
});
