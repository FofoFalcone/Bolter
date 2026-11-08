/**
 * Galleria animata, disposizione "Spirale": elementi su un'elica che avanza di un passo a ogni giro.
 * Importata da frontend/entrypoints/gallery.js; base comune in frontend/scripts/gallery-arrangements.js.
 */

import { DEG, TAU, X_AXIS, autoOr, clamp, track } from '@/scripts/gallery-arrangements.js';

export default track({
  loops: () => false,
  direction: () => X_AXIS,
  prepare(ctx) {
    const o = ctx.options;
    const vertical = o.axis !== 'x';
    const around = (vertical ? ctx.width : ctx.height) + ctx.gap;
    const along = (vertical ? ctx.height : ctx.width) + ctx.gap;
    return {
      step: TAU / o.perTurn,
      radius: autoOr(o.radius, (o.perTurn * around) / TAU),
      // Automatico: in un giro la spirale avanza di un elemento, così i giri non si sovrappongono
      pitch: autoOr(o.pitch, along / o.perTurn),
    };
  },
  spacing: (ctx) => ctx.layout.radius * ctx.layout.step,
  place(d, ctx) {
    const { radius, step, pitch } = ctx.layout;
    const angle = d * step;
    const around = radius * Math.sin(angle);
    const z = radius * Math.cos(angle) - radius;
    // Oltre un giro e mezzo dall'elemento in primo piano gli elementi svaniscono
    const opacity = clamp(1.5 - Math.abs(d) / ctx.options.perTurn, 0, 1);
    return ctx.options.axis === 'x'
      ? { x: d * pitch, y: around, z, rx: -angle * DEG, opacity }
      : { x: around, y: d * pitch, z, ry: angle * DEG, opacity };
  },
});
