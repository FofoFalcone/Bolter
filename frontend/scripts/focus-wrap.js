/**
 * Tab che gira dentro un contenitore (cassetti e pannelli a tutto schermo che non sono <dialog> modali).
 *
 * Popover e <details> funzionano senza JS ma non trattengono il focus: con Tab si finirebbe sui contenuti coperti
 * dal pannello o dal velo (WCAG 2.4.11, focus nascosto). Chiamata da un listener keydown quando il pannello è
 * aperto: dall'ultimo elemento si torna al primo e viceversa; se il focus è fuori, rientra nel contenitore.
 * I <dialog> aperti con showModal() (carrello, anteprima rapida) lo fanno già da soli.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Elementi raggiungibili con Tab dentro `container`, nell'ordine del documento (solo quelli visibili). */
function tabbables(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter(
    (element) => element.getClientRects().length > 0 && !element.closest('[inert]'),
  );
}

/** Da chiamare su keydown: se è un Tab, lo tiene dentro `container`. */
export function wrapFocus(event, container) {
  if (event.key !== 'Tab' || !container) return;
  const items = tabbables(container);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;

  if (!container.contains(active)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
