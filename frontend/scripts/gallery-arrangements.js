/**
 * Base comune delle disposizioni della galleria animata (sections/gallery.liquid, frontend/entrypoints/gallery.js).
 *
 * Ogni disposizione è un entrypoint a sé (frontend/entrypoints/gallery-<nome>.js, export default) che
 * gallery.js importa in modo dinamico: la pagina scarica solo quella scelta nella section.
 *
 * Implementazione originale del tema: riprende le idee del componente Gallery di Motion+
 * (lista, griglia, cilindro, coverflow, spirale, anello, sfera, pila) senza usarne il codice.
 * Funzioni pure, senza accesso al DOM: ogni disposizione calcola la posa 3D di ogni elemento
 * a partire dallo stato di scorrimento.
 *
 * Contesto `ctx` (misurato da gallery.js): count, width e height dell'elemento (px), gap, room,
 * loop, stageWidth, stageHeight, options (impostazioni della disposizione), layout (da prepare()),
 * open ({ element, progress, scale } mentre un elemento è aperto).
 *
 * Stato `{ u, v }`:
 * - disposizioni lineari: u = posizione in elementi (0 = primo elemento al centro), v inutilizzato;
 * - griglia: u, v = spostamento del piano in px;
 * - sfera: u, v = rotazione in radianti attorno agli assi y e x.
 *
 * Posa: { x, y, z } in px, { rx, ry, rz } in gradi, scale, opacity.
 *
 * Interfaccia di una disposizione (usata da gallery.js): loops, prepare?, plane?, touchAction, keys,
 * initial, itemOf, place, focusOf, stateFor, nearestElement, drag, release.
 */

export const TAU = Math.PI * 2;
export const DEG = 180 / Math.PI;
export const PROJECTION = 0.18; // secondi di inerzia: al rilascio lo stato prosegue per velocità × PROJECTION
const RUBBER_BAND = 0.3; // resistenza oltre i limiti nelle disposizioni senza ciclo
export const X_AXIS = { x: 1, y: 0 };
export const Y_AXIS = { x: 0, y: 1 };
export const HORIZONTAL_KEYS = { ArrowRight: 1, ArrowLeft: -1 };
const ALL_KEYS = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 };

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mod = (value, n) => ((value % n) + n) % n;
/** Riporta `value` nell'intervallo [-period/2, period/2]. */
export const wrapCentered = (value, period) => value - period * Math.round(value / period);
export const rubberBand = (value, min, max) => {
  if (value < min) return min + (value - min) * RUBBER_BAND;
  if (value > max) return max + (value - max) * RUBBER_BAND;
  return value;
};
/** Le impostazioni "0 = automatico" usano il valore calcolato. */
export const autoOr = (value, fallback) => (value > 0 ? value : fallback);

/** Indice valido dopo uno spostamento: circolare nelle disposizioni con ciclo, altrimenti limitato. */
export function normalizeIndex(index, count, loops) {
  return loops ? mod(index, count) : clamp(index, 0, count - 1);
}

/**
 * Disposizione lineare: gli elementi seguono un percorso e `place(d)` riceve la distanza `d`
 * (in elementi, anche frazionaria) da quello in primo piano.
 *
 * Ciclo: un elemento che supera metà del percorso ricompare dal lato opposto. Se tutti gli elementi
 * stanno nella scena, quel salto sarebbe visibile e la fila sbilanciata (con 6 elementi: 3 a sinistra,
 * 2 a destra). Le disposizioni con `reach(ctx)` (quanti passi dal centro si vedono) ripetono quindi
 * gli elementi finché il punto di salto cade fuori dalla scena: le copie diventano cloni in gallery.js
 * (layout.cells, come nella griglia ripetuta). Elemento = copia × count + indice; lo stato `u` resta
 * misurato sugli indici. A ogni fotogramma l'originale prende la posizione della sua card più vicina
 * al centro e le copie le altre: lo scambio tra nodi identici non si vede, e focus da tastiera, video
 * e colori della card prodotto restano sempre sulla card in primo piano.
 */
const MAX_COPIES = 8;

export function track(def) {
  const loops = (ctx) => (def.loops ? def.loops(ctx) : Boolean(ctx.loop));

  /** Distanza dell'indice `index` da quello in primo piano (nel ciclo: in [start, start + count)). */
  const offset = (index, u, ctx) => {
    const d = index - u;
    if (!loops(ctx)) return d;
    const start = def.wrapStart?.(ctx) ?? -ctx.count / 2;
    return start + mod(d - start, ctx.count);
  };

  /** Distanza di un elemento qualsiasi, copie comprese. */
  const position = (element, u, ctx) => {
    const { count } = ctx;
    const d = offset(element % count, u, ctx);
    const copy = Math.floor(element / count);
    if (copy === 0) return d;
    // Posizioni della stessa card: d + m × count dentro [-metà, metà) del percorso, con m consecutivi
    // (0 = originale). La copia c prende l'm ≡ c (mod copie): cambia posto solo quando un m esce dalla
    // finestra, cioè vicino al punto di salto, fuori dalla scena.
    const copies = ctx.layout.copies;
    const first = Math.ceil((-(copies * count) / 2 - d) / count);
    return d + (first + mod(copy - first, copies)) * count;
  };

  return {
    loops,
    prepare(ctx) {
      const layout = def.prepare?.(ctx) ?? {};
      if (!def.reach || !loops(ctx) || ctx.count < 2) return layout;
      // Il salto avviene a ±(count × copie)/2: deve stare oltre l'ultimo passo visibile su entrambi i lati
      const reach = def.reach({ ...ctx, layout });
      const copies = clamp(Math.ceil((2 * reach + 2) / ctx.count), 1, MAX_COPIES);
      if (copies === 1) return layout;
      const total = ctx.count * copies;
      return { ...layout, copies, cells: Array.from({ length: total }, (_, element) => ({ item: element % ctx.count })) };
    },
    plane: def.plane,
    touchAction(ctx) {
      const dir = def.direction(ctx);
      return Math.abs(dir.x) >= Math.abs(dir.y) ? 'pan-y' : 'pan-x';
    },
    keys: (ctx) => (Math.abs(def.direction(ctx).y) > Math.abs(def.direction(ctx).x) ? ALL_KEYS : HORIZONTAL_KEYS),
    initial: () => ({ u: 0, v: 0 }),
    itemOf: (element, ctx) => element % ctx.count,
    place(element, state, ctx) {
      const open = ctx.open && { ...ctx.open, d: position(ctx.open.element, state.u, ctx) };
      return def.place(position(element, state.u, ctx), ctx, open);
    },
    focusOf: (state, ctx) => normalizeIndex(Math.round(state.u), ctx.count, loops(ctx)),
    stateFor(index, state, ctx, element) {
      if (!loops(ctx)) return { u: clamp(index, 0, ctx.count - 1) };
      // Clic su una copia lontana: porta in primo piano proprio quella card, nella direzione in cui si trova
      if (element != null && element % ctx.count === index) return { u: state.u + position(element, state.u, ctx) };
      return { u: state.u + offset(index, state.u, ctx) };
    },
    // L'originale è sempre la card più vicina al centro
    nearestElement: (index) => index,
    drag(start, dx, dy, ctx) {
      const dir = def.direction(ctx);
      const u = start.u - (dx * dir.x + dy * dir.y) / def.spacing(ctx);
      return { u: loops(ctx) ? u : rubberBand(u, 0, ctx.count - 1) };
    },
    release(state, velocity, ctx) {
      const u = Math.round(state.u + velocity.u * PROJECTION);
      return { u: loops(ctx) ? u : clamp(u, 0, ctx.count - 1) };
    },
  };
}
