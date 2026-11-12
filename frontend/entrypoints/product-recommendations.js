/**
 * Prodotti consigliati — custom element <product-recommendations> (sections/product-recommendations.liquid).
 *
 * Product Recommendations API: quando la section sta per entrare nello schermo (IntersectionObserver, 400px
 * prima) richiede data-url (la stessa section renderizzata con l'oggetto `recommendations`) e sostituisce lo
 * scheletro. Senza consigli, o se la richiesta fallisce, la section sparisce (fuori dal theme editor).
 * Le card entrano con data-animate-scroll (frontend/scripts/animations.js): quelle già nello schermo all'arrivo dei
 * consigli subito, in sequenza, le altre quando ci si arriva (es. elenco più lungo dello schermo, o caricato in
 * anticipo di 400px); con movimento ridotto compaiono subito.
 * Il JS del selettore colore delle card si scarica solo se tra i consigli ci sono card che lo usano.
 */

import { initScrollRegions } from '@/scripts/scroll-regions.js';

class ProductRecommendations extends HTMLElement {
  connectedCallback() {
    if (!this.dataset.url || this.dataset.loaded) return;
    this.observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this.observer.disconnect();
        this.load();
      },
      { rootMargin: '0px 0px 400px 0px' },
    );
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    this.request?.abort();
  }

  async load() {
    this.request = new AbortController();
    // Modulo delle animazioni in parallelo alla richiesta (stesso file che theme.js importa in modo dinamico: un
    // import statico lo fondeva in questo entrypoint, 7 → 9 file e +5 KiB il 2026-11-12). Il contenuto si inserisce
    // a modulo pronto, così le card da animare non compaiono per un fotogramma prima di essere nascoste.
    const animations = import('@/scripts/animations.js').catch(() => null);
    try {
      const response = await fetch(this.dataset.url, { signal: this.request.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = new DOMParser().parseFromString(await response.text(), 'text/html');
      const next = html.querySelector('product-recommendations [data-recommendations-content]');
      const current = this.querySelector('[data-recommendations-content]');
      if (!next || !current || !next.children.length) {
        this.hide();
        return;
      }
      const { initAnimations } = (await animations) ?? {};
      this.dataset.loaded = 'true';
      current.replaceWith(document.importNode(next, true));
      // Elenco scorrevole sotto i 750px: focusabile da tastiera solo quando scorre (data-scroll-region)
      initScrollRegions(this);

      initAnimations?.(this, { animateInView: true });
      if (this.querySelector('product-card [data-card-swatches]')) import('@/scripts/product-card.js');
    } catch (error) {
      if (error.name !== 'AbortError') this.hide();
    }
  }

  /** Nessun consiglio: la section non occupa spazio (nel theme editor resta l'avviso renderizzato dal server). */
  hide() {
    if (window.Shopify?.designMode) return;
    this.closest('.shopify-section')?.setAttribute('hidden', '');
  }
}

if (!customElements.get('product-recommendations')) {
  customElements.define('product-recommendations', ProductRecommendations);
}
