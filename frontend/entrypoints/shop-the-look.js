/**
 * Punti sull'immagine — custom element <shop-the-look> (sections/shop-the-look.liquid).
 *
 * Punti e righe sono link alla pagina prodotto; qui si aggiungono:
 * - clic: anteprima rapida (<quick-view> della section), partendo dalla miniatura se è visibile;
 *   se quick-view.js non è ancora caricato, o con Ctrl/Cmd, resta la navigazione del link;
 * - passaggio del puntatore o focus: punto e riga dello stesso prodotto si evidenziano insieme (data-active)
 *   e il contenuto dell'anteprima parte in anticipo;
 * - theme editor: il blocco selezionato evidenzia il suo punto;
 * - ingresso nello schermo: tre impulsi per far notare i punti (meno di 5 secondi, WCAG 2.2.2), una volta sola.
 */

import { animate } from 'motion/mini';
import { inView, stagger } from 'motion';

const PULSE = { scale: [1, 2.2], opacity: [0.6, 0] };

class ShopTheLook extends HTMLElement {
  connectedCallback() {
    this.abort = new AbortController();
    const { signal } = this.abort;
    this.addEventListener('click', this.onClick, { signal });
    for (const type of ['pointerover', 'focusin']) this.addEventListener(type, this.onIntent, { signal });
    for (const type of ['pointerout', 'focusout']) this.addEventListener(type, this.onLeave, { signal });
    document.addEventListener('shopify:block:select', this.onBlockSelect, { signal });
    document.addEventListener('shopify:block:deselect', this.onLeave, { signal });

    const pins = this.querySelector('[data-hotspot-pins]');
    if (pins && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.stopInView = inView(pins, () => this.pulse(pins), { amount: 0.4 });
    }
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.stopInView?.();
  }

  pulse(pins) {
    const rings = pins.querySelectorAll('[data-hotspot-ring]');
    if (rings.length === 0) return;
    animate(rings, PULSE, { duration: 1.2, repeat: 2, ease: 'easeOut', delay: stagger(0.1, { startDelay: 0.6 }) });
  }

  setActive(id) {
    for (const element of this.querySelectorAll('[data-hotspot]')) {
      element.toggleAttribute('data-active', element.dataset.hotspot === id);
    }
  }

  onClick = (event) => {
    const trigger = event.target.closest('[data-quick-view-url]');
    const { quickView } = this;
    if (!trigger || !quickView || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    quickView.show({
      url: trigger.dataset.quickViewUrl,
      origin: trigger.querySelector('[data-hotspot-media]'),
      label: trigger.dataset.productTitle,
    });
  };

  onIntent = (event) => {
    const element = event.target.closest?.('[data-hotspot]');
    if (!element) return;
    this.setActive(element.dataset.hotspot);
    if (element.dataset.quickViewUrl) this.quickView?.prefetch(element.dataset.quickViewUrl);
  };

  onLeave = () => this.setActive(null);

  onBlockSelect = (event) => {
    if (this.querySelector(`[data-hotspot="${event.detail.blockId}"]`)) this.setActive(event.detail.blockId);
  };

  /** <quick-view> della section, quando definito (quick-view.js si carica a parte). */
  get quickView() {
    const element = this.dataset.quickView && document.getElementById(this.dataset.quickView);
    return element && typeof element.show === 'function' ? element : null;
  }
}

if (!customElements.get('shop-the-look')) {
  customElements.define('shop-the-look', ShopTheLook);
}
