/**
 * Card prodotto — custom element <product-card> (snippets/product-card.liquid).
 *
 * Senza JS la card è un link alla pagina prodotto e il selettore colore non compare.
 * Con JS, scegliendo un colore:
 * - la card si ricarica con la Section Rendering API (sections/product-card.liquid) sull'URL della
 *   variante corrispondente (`product_option_value.variant`) o, nei combined listings, sull'URL del
 *   prodotto collegato (`product_option_value.product_url`);
 * - si sostituiscono solo le parti [data-card-part] (immagini e badge, prezzo) e si aggiornano i link
 *   e l'anteprima rapida: prezzi e immagini restano renderizzati in Liquid;
 * - parte lo standard event shopify:product:select, risolto con la variante del server.
 * Le risposte restano in cache per URL e vengono richieste in anticipo al passaggio del puntatore
 * o del focus su un colore.
 *
 * Caricato da frontend/entrypoints/theme.js (import dinamico) solo se la pagina ha card con il selettore.
 */

import { withProductSelectEvent } from './standard-events.js';

const SECTION_ID = 'product-card';
const cache = new Map();

function load(url) {
  let request = cache.get(url);
  if (!request) {
    request = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });
    request.catch(() => cache.delete(url));
    cache.set(url, request);
  }
  return request;
}

class ProductCard extends HTMLElement {
  connectedCallback() {
    this.abort = new AbortController();
    const { signal } = this.abort;
    this.addEventListener('change', this.onChange, { signal });
    this.addEventListener('pointerover', this.onIntent, { signal });
    this.addEventListener('focusin', this.onIntent, { signal });
  }

  disconnectedCallback() {
    this.abort?.abort();
  }

  /** URL della card per il colore `input`: variante del prodotto o prodotto collegato (combined listing). */
  sourceUrl(input) {
    const { productUrl, variantId, optionValueId } = input.dataset;
    const url = new URL(productUrl || this.dataset.productUrl, window.location.origin);
    if (!productUrl) {
      if (variantId) url.searchParams.set('variant', variantId);
      else url.searchParams.set('option_values', optionValueId);
    }
    url.searchParams.set('section_id', SECTION_ID);
    return url.toString();
  }

  onIntent = (event) => {
    const input = event.target.closest('label')?.control ?? event.target.closest('input[data-option-value-id]');
    if (input?.matches('[data-option-value-id]') && !input.disabled) load(this.sourceUrl(input)).catch(() => {});
  };

  onChange = (event) => {
    const input = event.target.closest('input[data-option-value-id]');
    if (input) this.select(input);
  };

  async select(input) {
    const request = (this.request = Symbol());
    this.setAttribute('aria-busy', 'true');
    try {
      // shopify:product:select (standard event): parte subito, si risolve con la variante calcolata dal server
      await withProductSelectEvent({
        target: this,
        product: { id: this.dataset.productGid, title: this.dataset.productTitle, handle: this.dataset.productHandle },
        selectedOptions: [{ name: input.dataset.optionName, value: input.value }],
        resolveVariant: async () => {
          const html = new DOMParser().parseFromString(await load(this.sourceUrl(input)), 'text/html');
          const next = html.querySelector('product-card');
          // Una scelta più recente vince: l'evento si risolve comunque, la card non cambia
          if (next && request === this.request) this.update(next);
          const payload = html.querySelector('s-view-event[view-event-payload]')?.getAttribute('view-event-payload');
          return payload ? JSON.parse(payload).product?.selectedVariant ?? null : null;
        },
      });
    } catch (error) {
      console.error('[product-card] aggiornamento della card non riuscito', error);
    } finally {
      if (request === this.request) this.removeAttribute('aria-busy');
    }
  }

  /** Sostituisce il contenuto delle parti e aggiorna link e anteprima rapida. */
  update(next) {
    this.querySelectorAll('[data-card-part]').forEach((part) => {
      const replacement = next.querySelector(`[data-card-part="${part.dataset.cardPart}"]`);
      if (!replacement) return;
      // Le immagini mantengono `sizes` e priorità del contesto (griglia, galleria): il server non li conosce
      const current = part.querySelector('img[sizes]');
      if (current) {
        replacement.querySelectorAll('img[sizes]').forEach((image) => {
          image.sizes = current.sizes;
          image.loading = 'eager';
        });
      }
      // Si sostituisce il contenuto, non l'elemento: le classi del contesto (es. layout 'fill') restano
      part.replaceChildren(...replacement.childNodes);
    });

    const href = next.querySelector('[data-card-link]')?.getAttribute('href');
    if (!href) return;
    this.querySelectorAll('[data-card-link]').forEach((link) => link.setAttribute('href', href));
    this.querySelectorAll('[data-quick-view-url]').forEach((trigger) => (trigger.dataset.quickViewUrl = href));
  }
}

if (!customElements.get('product-card')) {
  customElements.define('product-card', ProductCard);
}
