/**
 * Accordion — custom element <accordion-group> (FAQ, pannelli della pagina prodotto, …).
 * Markup: snippets/accordion-item.liquid dentro un <accordion-group>.
 *
 * Adattato dall'esempio Motion "Accordion" (https://motion.dev/examples/js-accordion):
 * - markup nativo <details>/<summary>: funziona e resta accessibile anche senza JS,
 *   e la ricerca nella pagina del browser apre automaticamente la risposta trovata;
 * - Motion (versione mini, WAAPI) anima solo l'apertura/chiusura, misurando l'altezza
 *   invece di usare `height: "auto"` dell'animate completo (bundle molto più leggero);
 * - con prefers-reduced-motion l'apertura è istantanea.
 *
 * Attributi: allow-multiple → più elementi aperti insieme (altrimenti aprirne uno chiude gli altri).
 * Caricato dalle section con {% render 'vite-tag', entry: 'accordion.js' %}.
 */

import { animate } from 'motion/mini';

const TRANSITION = { duration: 0.3, ease: [0.22, 1, 0.36, 1] };

// Copia locale, non import da reduced-motion.js: l'import aggiungeva un file all'entrypoint (4 → 5), cioè una
// richiesta in più per una riga (misurato il 2026-11-11).
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class AccordionGroup extends HTMLElement {
  connectedCallback() {
    this.handleClick = this.handleClick.bind(this);
    this.handleBlockSelect = this.handleBlockSelect.bind(this);

    this.addEventListener('click', this.handleClick);
    // Theme editor: selezionando un blocco nel pannello, apri il relativo elemento.
    document.addEventListener('shopify:block:select', this.handleBlockSelect);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.handleClick);
    document.removeEventListener('shopify:block:select', this.handleBlockSelect);
  }

  get allowMultiple() {
    return this.hasAttribute('allow-multiple');
  }

  /** Elementi di questo gruppo (esclusi quelli di eventuali accordion annidati). */
  get items() {
    return Array.from(this.querySelectorAll('details.accordion__item')).filter(
      (item) => item.closest('accordion-group') === this,
    );
  }

  handleClick(event) {
    const summary = event.target.closest('summary');
    const details = summary?.parentElement;
    if (!details?.matches('details.accordion__item') || details.closest('accordion-group') !== this) return;

    event.preventDefault();

    const isOpen = details.open && details.dataset.state !== 'closing';
    if (isOpen) {
      this.close(details);
    } else {
      if (!this.allowMultiple) {
        this.items.filter((item) => item !== details && item.open).forEach((item) => this.close(item));
      }
      this.open(details);
    }
  }

  handleBlockSelect(event) {
    const details = event.target.closest?.('details.accordion__item');
    if (!details || details.closest('accordion-group') !== this) return;
    this.open(details, { instant: true });
  }

  open(details, { instant = false } = {}) {
    const content = details.querySelector('.accordion__content');
    const inner = content.firstElementChild;
    const wasOpen = details.open; // true se stiamo interrompendo una chiusura in corso

    // Altezza di partenza: 0 se era chiuso, altrimenti quella attuale della chiusura interrotta.
    const from = wasOpen ? content.getBoundingClientRect().height : 0;

    details.dataset.state = 'open';

    if (instant || prefersReducedMotion()) {
      details.open = true;
      content.style.height = '';
      content.style.overflow = '';
      inner.style.opacity = '';
      return;
    }

    content.style.overflow = 'hidden';
    content.style.height = `${from}px`; // evita un frame a piena altezza prima dell'animazione
    details.open = true;
    const to = content.scrollHeight;

    animate(content, { height: [`${from}px`, `${to}px`] }, TRANSITION).then(() => {
      if (details.dataset.state !== 'open') return;
      content.style.height = ''; // torna ad altezza automatica (responsive)
      content.style.overflow = '';
    });
    // Solo dissolvenza: una traslazione verso l'alto verrebbe tagliata da overflow: hidden
    animate(inner, { opacity: [0, 1] }, TRANSITION);
  }

  close(details) {
    const content = details.querySelector('.accordion__content');
    details.dataset.state = 'closing';

    if (prefersReducedMotion()) {
      details.open = false;
      details.dataset.state = 'closed';
      content.style.height = '';
      content.style.overflow = '';
      return;
    }

    const from = content.getBoundingClientRect().height;
    content.style.overflow = 'hidden';

    animate(content.firstElementChild, { opacity: 0 }, { ...TRANSITION, duration: 0.15 });
    animate(content, { height: [`${from}px`, '0px'] }, TRANSITION).then(() => {
      if (details.dataset.state !== 'closing') return; // riaperto durante l'animazione
      details.open = false;
      details.dataset.state = 'closed';
      content.style.height = '';
      content.style.overflow = '';
    });
  }
}

if (!customElements.get('accordion-group')) {
  customElements.define('accordion-group', AccordionGroup);
}
