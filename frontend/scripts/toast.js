/**
 * Toast: riscontro breve di un'azione che non ha un punto proprio dove mostrarlo. Markup in snippets/toast.liquid.
 * Gli errori di un campo o di una riga restano accanto al campo o alla riga: qui solo ciò che non ha un posto vicino.
 *
 * - Uno alla volta: uno nuovo sostituisce il precedente.
 * - popover="manual" (top layer, nessuna chiusura con un clic fuori). Dentro un <dialog> modale va inserito nel dialog:
 *   fuori sarebbe inerte, quindi non cliccabile e non annunciato. Lì sta in alto, per non coprire i pulsanti d'azione.
 * - Conferme: spariscono dopo 5 s, con il timer fermo sotto il puntatore o col focus dentro. Errori: restano finché non
 *   vengono chiusi (WCAG 2.2.1).
 * - Lettori di schermo: regione sr-only riempita dopo l'inserimento (una regione live nata già piena spesso non viene
 *   letta); il testo visibile è aria-hidden e non viene letto due volte.
 */

import { animate } from 'motion/mini';
import { spring } from 'motion';
import { prefersReducedMotion } from './reduced-motion.js';

const AUTO_HIDE_MS = 5000;
const ANNOUNCE_DELAY_MS = 100;
const ENTER_SPRING = { type: spring, visualDuration: 0.35, bounce: 0.15 };

const getTemplate = () => document.getElementById('ToastTemplate');

let active = null;

function hide(toast) {
  clearTimeout(toast.hideTimer);
  if (active === toast) active = null;
  if (prefersReducedMotion()) {
    toast.remove();
    return;
  }
  animate(toast, { opacity: [1, 0] }, { duration: 0.15, ease: 'easeOut' }).then(() => toast.remove());
}

/**
 * @param {string} message
 * @param {{ tone?: 'success' | 'error', action?: { label: string, href: string, onSelect?: () => void } }} [options]
 *   `action.onSelect`: al posto della navigazione (es. aprire il cassetto). Ctrl/Cmd/Maiusc+clic seguono comunque il link.
 */
export function showToast(message, { tone = 'success', action = null } = {}) {
  const template = getTemplate();
  if (!template || !message) return;

  if (active) {
    clearTimeout(active.hideTimer);
    active.remove();
  }

  const toast = template.content.firstElementChild.cloneNode(true);
  const host = [...document.querySelectorAll('dialog:modal')].pop() ?? document.body;
  const fromTop = host !== document.body;
  toast.dataset.tone = tone;
  toast.dataset.placement = fromTop ? 'top' : 'bottom';
  toast.querySelector('[data-toast-message]').textContent = message;

  if (action) {
    const link = toast.querySelector('[data-toast-action]');
    link.href = action.href;
    link.textContent = action.label;
    if (action.onSelect) {
      link.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        hide(toast);
        action.onSelect();
      });
    }
  }

  toast.querySelector('[data-toast-close]').addEventListener('click', () => hide(toast));

  if (tone !== 'error') {
    const startTimer = () => {
      clearTimeout(toast.hideTimer);
      toast.hideTimer = setTimeout(() => hide(toast), AUTO_HIDE_MS);
    };
    const stopTimer = () => clearTimeout(toast.hideTimer);
    toast.addEventListener('pointerenter', stopTimer);
    toast.addEventListener('pointerleave', startTimer);
    toast.addEventListener('focusin', stopTimer);
    toast.addEventListener('focusout', startTimer);
    startTimer();
  }

  host.append(toast);
  toast.showPopover();
  active = toast;

  const status = toast.querySelector('[data-toast-status]');
  status.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  setTimeout(() => (status.textContent = message), ANNOUNCE_DELAY_MS);

  animate(toast, { opacity: [0, 1] }, { duration: 0.2 });
  if (!prefersReducedMotion()) {
    animate(toast, { translate: [fromTop ? '0 -1.5rem' : '0 1.5rem', '0 0'] }, ENTER_SPRING);
  }
}

/** Prodotto aggiunto quando non c'è un cassetto che lo mostri (carrello "Pagina"): conferma con il link al carrello. */
export function showCartAddedToast() {
  const data = getTemplate()?.dataset;
  if (!data) return;
  showToast(data.cartAdded, { action: { label: data.cartView, href: data.cartUrl } });
}

/**
 * Carrello cambiato da un agente o da un'app (Shopify.actions.updateCart) mentre il carrello non è in vista: il
 * cliente vede cosa è successo nella sua scheda. "Vai al carrello" apre il cassetto se c'è, altrimenti la pagina.
 * @param {{ open: () => void } | null} [drawer] il <cart-drawer>, se il carrello è a cassetto
 */
export function showCartUpdatedToast(drawer = null) {
  const data = getTemplate()?.dataset;
  if (!data) return;
  const onSelect = drawer ? () => drawer.open() : undefined;
  showToast(data.cartUpdated, { action: { label: data.cartView, href: data.cartUrl, onSelect } });
}
