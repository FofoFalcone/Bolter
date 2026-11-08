/**
 * Galleria animata, disposizione "Griglia": piano trascinabile in due direzioni, limitato o ripetuto all'infinito.
 * Importata da frontend/entrypoints/gallery.js; base comune in frontend/scripts/gallery-arrangements.js.
 */

import {
  HORIZONTAL_KEYS,
  PROJECTION,
  autoOr,
  clamp,
  rubberBand,
  wrapCentered,
} from '@/scripts/gallery-arrangements.js';

/** Posizione della cella `element` rispetto al centro della scena. */
function cellPosition(element, state, layout) {
  const cell = layout.cells[element];
  let x = cell.x - state.u;
  let y = cell.y - state.v;
  if (layout.periodX) {
    x = wrapCentered(x, layout.periodX);
    y = wrapCentered(y, layout.periodY);
  }
  return { x, y };
}

function nearestCell(state, layout, item = null) {
  let best = 0;
  let bestDistance = Infinity;
  layout.cells.forEach((cell, element) => {
    if (item !== null && cell.item !== item) return;
    const { x, y } = cellPosition(element, state, layout);
    const distance = x * x + y * y;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = element;
    }
  });
  return best;
}

function clampPlane(state, layout) {
  if (layout.periodX) return state;
  return { u: clamp(state.u, -layout.limitX, layout.limitX), v: clamp(state.v, -layout.limitY, layout.limitY) };
}

const grid = {
  loops: (ctx) => ctx.options.fill !== 'none',
  touchAction: () => 'none',
  keys: (ctx) => ({ ...HORIZONTAL_KEYS, ArrowDown: ctx.layout.columns, ArrowUp: -ctx.layout.columns }),
  initial: () => ({ u: 0, v: 0 }),
  plane: (ctx) => ({ rx: ctx.options.rotateX, ry: ctx.options.rotateY, rz: ctx.options.rotateZ }),

  /**
   * Celle della griglia. "none": solo gli elementi, centrati, con spostamento limitato.
   * "sequence"/"offset": un blocco di `columns` colonne (le celle vuote dell'ultima riga riprendono
   * la sequenza dall'inizio) ripetuto finché copre la scena: il piano è infinito e ogni cella
   * oltre la prima copia diventa un clone in gallery.js.
   */
  prepare(ctx) {
    const { count, width, height, gap, stageWidth, stageHeight, options: o } = ctx;
    const cellW = width + gap;
    const cellH = height + gap;
    const repeat = o.fill !== 'none';
    const autoColumns = repeat ? Math.ceil(Math.sqrt(count)) : Math.floor((stageWidth + gap) / cellW);
    const columns = clamp(autoOr(o.columns, autoColumns), 1, repeat ? 8 : count);
    let rows = Math.ceil(count / columns);

    if (!repeat) {
      const cells = Array.from({ length: count }, (_, k) => ({
        item: k,
        x: (k % columns) * cellW - ((columns - 1) * cellW) / 2,
        y: Math.floor(k / columns) * cellH - ((rows - 1) * cellH) / 2,
      }));
      return {
        cells,
        columns,
        limitX: Math.max(0, (columns * cellW - stageWidth) / 2),
        limitY: Math.max(0, (rows * cellH - stageHeight) / 2),
      };
    }

    // Lo sfalsamento si ripete correttamente solo con un numero pari di righe nel blocco
    if (o.fill === 'offset' && rows % 2) rows *= 2;
    const blockW = columns * cellW;
    const blockH = rows * cellH;
    const copiesX = Math.max(1, Math.ceil((stageWidth + 2 * cellW) / blockW));
    const copiesY = Math.max(1, Math.ceil((stageHeight + 2 * cellH) / blockH));
    const cells = [];
    for (let cy = 0; cy < copiesY; cy++) {
      for (let cx = 0; cx < copiesX; cx++) {
        for (let j = 0; j < columns * rows; j++) {
          const row = Math.floor(j / columns);
          const shift = o.fill === 'offset' && row % 2 ? cellW / 2 : 0;
          cells.push({ item: j % count, x: cx * blockW + (j % columns) * cellW + shift, y: cy * blockH + row * cellH });
        }
      }
    }
    return { cells, columns, periodX: copiesX * blockW, periodY: copiesY * blockH };
  },

  itemOf: (element, ctx) => ctx.layout.cells[element].item,

  place(element, state, ctx) {
    const { x, y } = cellPosition(element, state, ctx.layout);
    let z = 0;
    if (ctx.options.bulge) {
      // Rigonfiamento: gli elementi vicini al centro della scena si avvicinano a chi guarda
      const reach = Math.max(ctx.stageWidth, ctx.stageHeight) * 0.6;
      const falloff = 1 - (x * x + y * y) / (reach * reach);
      if (falloff > 0) z = ctx.options.bulge * falloff * falloff;
    }
    return { x, y, z };
  },

  focusOf: (state, ctx) => ctx.layout.cells[nearestCell(state, ctx.layout)].item,
  nearestElement: (index, state, ctx) => nearestCell(state, ctx.layout, index),

  stateFor(index, state, ctx, element) {
    const layout = ctx.layout;
    const target = element != null && layout.cells[element]?.item === index ? element : nearestCell(state, layout, index);
    const { x, y } = cellPosition(target, state, layout);
    return clampPlane({ u: state.u + x, v: state.v + y }, layout);
  },

  drag(start, dx, dy, ctx) {
    const { layout } = ctx;
    const u = start.u - dx;
    const v = start.v - dy;
    if (layout.periodX) return { u, v };
    return { u: rubberBand(u, -layout.limitX, layout.limitX), v: rubberBand(v, -layout.limitY, layout.limitY) };
  },

  release(state, velocity, ctx) {
    const projected = clampPlane(
      { u: state.u + velocity.u * PROJECTION, v: state.v + velocity.v * PROJECTION },
      ctx.layout,
    );
    return grid.stateFor(grid.focusOf(projected, ctx), projected, ctx);
  },
};

export default grid;
