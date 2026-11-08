/**
 * Galleria animata, disposizione "Anello": elementi lungo un arco (fino al cerchio completo) nel piano della pagina.
 * Importata da frontend/entrypoints/gallery.js; base comune in frontend/scripts/gallery-arrangements.js.
 */

import { DEG, X_AXIS, autoOr, track } from '@/scripts/gallery-arrangements.js';

export default track({
  loops: (ctx) => ctx.options.arc >= 360,
  direction: () => X_AXIS,
  prepare(ctx) {
    const o = ctx.options;
    const arc = o.arc / DEG;
    const step = arc / (o.arc >= 360 ? ctx.count : Math.max(ctx.count - 1, 1));
    return { step, radius: autoOr(o.radius, (ctx.width + ctx.gap) / step) };
  },
  spacing: (ctx) => ctx.layout.radius * ctx.layout.step,
  plane: (ctx) => ({ rx: ctx.options.tilt }),
  place(d, ctx) {
    const { radius, step } = ctx.layout;
    const angle = d * step;
    // Centro dell'anello sopra l'elemento in primo piano (curva verso l'alto) o sotto (flip)
    const side = ctx.options.flip ? 1 : -1;
    return {
      x: radius * Math.sin(angle),
      y: side * radius * (1 - Math.cos(angle)),
      rz: ctx.options.upright ? 0 : side * angle * DEG,
    };
  },
});
