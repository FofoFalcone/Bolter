/**
 * Trascinamenti col tocco gestiti in JS su un'area con touch-action (galleria, ticker, prima/dopo): niente inerzia
 * nativa fantasma alla fine dello swipe.
 *
 * Chrome su Android: uno swipe veloce fa partire l'inerzia dello scroll nativo (fling) anche nella direzione che
 * touch-action blocca, dove non scorre nulla. Per il browser quell'inerzia resta in corso, e il tocco successivo
 * serve solo a fermarla: pointerdown e pointerup arrivano, il click no. Nella galleria la prima card toccata dopo uno
 * swipe non apriva l'anteprima (segnalato dall'utente, riprodotto il 2026-11-11 in Chrome mobile con tocchi via
 * DevTools Protocol: clic perso fino a ~250 ms dopo uno swipe di 240px in 180ms, più a lungo con swipe più veloci;
 * succede con pan-y e con none).
 * Annullare i touchmove del trascinamento evita il fling. Solo quelli nella direzione che il browser non scorre
 * comunque: il trascinamento JS parte da pochi pixel, prima che il browser decida, e annullare anche l'inizio di uno
 * scroll verticale bloccherebbe la pagina (provato). Solo durante un trascinamento: un touchmove annullato entro la
 * soglia del tap cancellerebbe il tap stesso.
 *
 * Il listener di touchmove non è passivo, quindi il primo touchmove partito sull'area aspetta il main thread prima
 * che la pagina scorra: è limitato all'area trascinabile, come già il lavoro dei suoi gestori di pointermove.
 *
 * @param {HTMLElement} element  area con touch-action (pan-x, pan-y o none) che riceve il trascinamento
 * @param {() => boolean} isDragging  true mentre il componente sta trascinando (soglia superata)
 * @param {AbortSignal} signal
 */
export function preventTouchFling(element, isDragging, signal) {
  let start = null;
  let blocked = null; // asse che il browser non scorre: 'x', 'y' o 'both'

  element.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.touches.length === 1 ? event.touches[0] : null;
      start = touch && { x: touch.clientX, y: touch.clientY };
      const action = getComputedStyle(element).touchAction;
      if (action.includes('none')) blocked = 'both';
      else if (action.includes('pan-y') && !action.includes('pan-x')) blocked = 'x';
      else if (action.includes('pan-x') && !action.includes('pan-y')) blocked = 'y';
      else blocked = null;
    },
    { passive: true, signal },
  );

  element.addEventListener(
    'touchmove',
    (event) => {
      if (!start || !blocked || !event.cancelable || event.touches.length !== 1 || !isDragging()) return;
      const dx = Math.abs(event.touches[0].clientX - start.x);
      const dy = Math.abs(event.touches[0].clientY - start.y);
      if (blocked === 'both' || (blocked === 'x' ? dx > dy : dy > dx)) event.preventDefault();
    },
    { passive: false, signal },
  );
}
