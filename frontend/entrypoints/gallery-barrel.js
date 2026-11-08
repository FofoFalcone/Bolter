/**
 * Galleria animata, disposizione "Cilindro": elementi sulla superficie di un cilindro orizzontale o verticale.
 * Importata da frontend/entrypoints/gallery.js; base comune in frontend/scripts/gallery-arrangements.js.
 */

import { DEG, TAU, X_AXIS, Y_AXIS, autoOr, track } from '@/scripts/gallery-arrangements.js';

export default track({
  loops: () => true,
  direction: (ctx) => (ctx.options.axis === 'y' ? Y_AXIS : X_AXIS),
  prepare(ctx) {
    const size = (ctx.options.axis === 'y' ? ctx.height : ctx.width) + ctx.gap;
    return { radius: autoOr(ctx.options.radius, (ctx.count * size) / TAU), step: TAU / ctx.count };
  },
  spacing: (ctx) => ctx.layout.radius * ctx.layout.step,
  // Inclinazione della camera attorno all'asse del cilindro (pivot = raggio)
  plane: (ctx) =>
    ctx.options.axis === 'y'
      ? { ry: ctx.options.tilt, pivot: ctx.layout.radius }
      : { rx: ctx.options.tilt, pivot: ctx.layout.radius },
  place(d, ctx) {
    const { radius, step } = ctx.layout;
    const angle = d * step;
    const along = radius * Math.sin(angle);
    const z = radius * Math.cos(angle) - radius;
    return ctx.options.axis === 'y' ? { y: along, z, rx: -angle * DEG } : { x: along, z, ry: angle * DEG };
  },
});
