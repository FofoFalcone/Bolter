/**
 * Galleria animata, disposizione "Sfera": elementi distribuiti uniformemente su una sfera ruotabile in due direzioni.
 * Importata da frontend/entrypoints/gallery.js; base comune in frontend/scripts/gallery-arrangements.js.
 */

import { DEG, HORIZONTAL_KEYS, PROJECTION, TAU, autoOr, clamp } from '@/scripts/gallery-arrangements.js';

const MAX_PITCH = Math.PI / 2;

/** Rotazione attorno a y (u) e poi a x (v), con le stesse convenzioni di rotateY()/rotateX() in CSS. */
function rotatePoint(point, state) {
  const cosY = Math.cos(state.u);
  const sinY = Math.sin(state.u);
  const cosX = Math.cos(state.v);
  const sinX = Math.sin(state.v);
  const x = point.x * cosY + point.z * sinY;
  const z = -point.x * sinY + point.z * cosY;
  return { x, y: point.y * cosX - z * sinX, z: point.y * sinX + z * cosX };
}

function frontmost(state, ctx) {
  let best = 0;
  let bestZ = -Infinity;
  ctx.layout.points.forEach((point, k) => {
    const { z } = rotatePoint(point, state);
    if (z > bestZ) {
      bestZ = z;
      best = k;
    }
  });
  return best;
}

const sphere = {
  loops: () => true,
  touchAction: () => 'none',
  keys: () => HORIZONTAL_KEYS,
  initial: (ctx) => sphere.stateFor(0, { u: 0, v: 0 }, ctx),

  prepare(ctx) {
    const { count, width, height, options: o } = ctx;
    const area = count * (width + o.gap) * (height + o.gap);
    // Distribuzione uniforme sulla superficie (spirale di Fibonacci)
    const golden = Math.PI * (3 - Math.sqrt(5));
    const points = Array.from({ length: count }, (_, k) => {
      const y = count === 1 ? 0 : 1 - (2 * (k + 0.5)) / count;
      const radius = Math.sqrt(1 - y * y);
      return { x: radius * Math.sin(k * golden), y, z: radius * Math.cos(k * golden) };
    });
    return { points, radius: autoOr(o.radius, 1.15 * Math.sqrt(area / (4 * Math.PI))) };
  },

  itemOf: (element) => element,

  place(element, state, ctx) {
    const { radius, points } = ctx.layout;
    const p = rotatePoint(points[element], state);
    const pose = { x: radius * p.x, y: radius * p.y, z: radius * p.z - radius };
    if (ctx.options.face === 'outward') {
      pose.ry = Math.atan2(p.x, p.z) * DEG;
      pose.rx = -Math.asin(clamp(p.y, -1, 1)) * DEG;
    } else {
      // Rivolti verso chi guarda: quelli sul retro si attenuano per non coprire il fronte
      pose.opacity = 0.25 + 0.75 * ((p.z + 1) / 2);
    }
    return pose;
  },

  focusOf: frontmost,
  nearestElement: (index) => index,

  /** Rotazione che porta l'elemento `index` davanti, scegliendo il giro più vicino allo stato attuale. */
  stateFor(index, state, ctx) {
    const p = ctx.layout.points[index];
    let u = Math.atan2(-p.x, p.z);
    u += TAU * Math.round((state.u - u) / TAU);
    return { u, v: Math.atan2(p.y, Math.hypot(p.x, p.z)) };
  },

  drag(start, dx, dy, ctx) {
    const { radius } = ctx.layout;
    return { u: start.u + dx / radius, v: clamp(start.v - dy / radius, -MAX_PITCH, MAX_PITCH) };
  },

  release(state, velocity, ctx) {
    const projected = {
      u: state.u + velocity.u * PROJECTION,
      v: clamp(state.v + velocity.v * PROJECTION, -MAX_PITCH, MAX_PITCH),
    };
    return sphere.stateFor(frontmost(projected, ctx), projected, ctx);
  },
};

export default sphere;
