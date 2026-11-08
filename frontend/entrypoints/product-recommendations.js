/**
 * Prodotti consigliati — custom element <product-recommendations> (sections/product-recommendations.liquid).
 *
 * Product Recommendations API: quando la section sta per entrare nello schermo (IntersectionObserver, 400px
 * prima) richiede data-url (la stessa section renderizzata con l'oggetto `recommendations`) e sostituisce lo
 * scheletro. Senza consigli, o se la richiesta fallisce, la section sparisce (fuori dal theme editor).
 * Le card entrano a cascata (Motion, stessa curva del tema); con movimento ridotto compaiono subito.
 * Il JS del selettore colore delle card si scarica solo se tra i consigli ci sono card che lo usano.
 */

import { animate } from 'motion/mini';
import { stagger } from 'motion';
import { initScrollRegions } from '@/scripts/scroll-regions.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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
      this.dataset.loaded = 'true';
      current.replaceWith(document.importNode(next, true));
      // Elenco scorrevole sotto i 750px: focusabile da tastiera solo quando scorre (data-scroll-region)
      initScrollRegions(this);

      const items = this.querySelectorAll('[data-recommendation-item]');
      if (items.length && !reducedMotion.matches) {
        animate(items, { opacity: [0, 1], translate: ['0 1.5rem', '0 0'] }, { duration: 0.5, delay: stagger(0.06), ease: [0.22, 1, 0.36, 1] });
      }
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
