/**
 * Galleria animata, disposizione "Lista": elementi su una retta inclinabile, con curvatura, onda e profondità.
 * Importata da frontend/entrypoints/gallery.js; base comune in frontend/scripts/gallery-arrangements.js.
 */

import { DEG, clamp, track } from '@/scripts/gallery-arrangements.js';

const listAngle = (ctx) => (ctx.options.angle + (ctx.options.axis === 'y' ? 90 : 0)) / DEG;
const listSize = (ctx) => (ctx.options.axis === 'y' ? ctx.height : ctx.width);

export default track({
  direction(ctx) {
    const angle = listAngle(ctx);
    return { x: Math.cos(angle), y: Math.sin(angle) };
  },
  spacing: (ctx) => listSize(ctx) + ctx.gap,
  /** Passi dal centro entro cui un elemento può essere visibile (+1 per curvatura, onda e profondità). */
  reach(ctx) {
    const angle = listAngle(ctx);
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    // Distanza lungo il percorso oltre la quale l'elemento è uscito dalla scena (che taglia i bordi)
    const limits = [];
    if (cos > 0.01) limits.push((ctx.stageWidth / 2 + ctx.width) / cos);
    if (sin > 0.01) limits.push((ctx.stageHeight / 2 + ctx.height) / sin);
    return Math.ceil(Math.min(...limits) / (listSize(ctx) + ctx.gap)) + 1;
  },
  place(d, ctx, open) {
    const o = ctx.options;
    const angle = listAngle(ctx);
    const size = listSize(ctx);
    let along = d * (size + ctx.gap);
    // Elemento aperto: i vicini si spostano per lasciargli spazio (più il margine "room")
    if (open) {
      const push = Math.max(0, (size * (open.scale - 1)) / 2 + ctx.room - ctx.gap);
      along += Math.sign(d - open.d) * push * open.progress;
    }
    const wave = o.wave * Math.sin((d * Math.PI) / 2);
    const curl = clamp(o.curl * d, -90, 90);
    const vertical = o.axis === 'y';
    return {
      x: Math.cos(angle) * along - Math.sin(angle) * wave,
      y: Math.sin(angle) * along + Math.cos(angle) * wave,
      z: -o.depth * Math.abs(d) - o.recede * d,
      rx: vertical ? curl : 0,
      ry: vertical ? o.turn : o.turn - curl,
    };
  },
});
