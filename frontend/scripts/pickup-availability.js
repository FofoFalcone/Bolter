/**
 * Ritiro in negozio — custom element <pickup-availability> (snippets/product-pickup.liquid).
 * Metodo indicato da Shopify: la section si richiede all'URL della variante; se nessuna sede ha il ritiro attivo non
 * arriva contenuto e il componente resta vuoto (nascosto). Importato da product-page.js solo se il blocco è in pagina.
 * Dialog nativo: focus, Esc e sfondo inerte dal browser; blocco dello scroll con data-scroll-lock (scroll-lock.css).
 */

class PickupAvailability extends HTMLElement {
  connectedCallback() {
    this.onClick = this.onClick.bind(this);
    this.addEventListener('click', this.onClick);
    this.load();
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.onClick);
    this.request?.abort();
  }

  async load() {
    this.request = new AbortController();
    const root = (this.dataset.rootUrl || '/').replace(/\/?$/, '/');
    try {
      const response = await fetch(`${root}variants/${this.dataset.variantId}/?section_id=pickup-availability`, {
        signal: this.request.signal,
      });
      if (!response.ok) return;
      const html = new DOMParser().parseFromString(await response.text(), 'text/html');
      const content = html.querySelector('[data-pickup-content]');
      if (!content) return;
      this.replaceChildren(document.importNode(content, true));
      const title = this.querySelector('[data-pickup-title]');
      if (title) title.textContent = this.dataset.productTitle ?? '';
    } catch (error) {
      // Informazione facoltativa: se la richiesta fallisce il resto della pagina prodotto non ne risente
      if (error.name !== 'AbortError') this.replaceChildren();
    }
  }

  onClick(event) {
    const dialog = this.querySelector('dialog');
    if (!dialog) return;
    if (event.target.closest('[data-pickup-open]')) {
      dialog.showModal();
    } else if (event.target.closest('[data-pickup-close]')) {
      dialog.close();
    }
  }
}

if (!customElements.get('pickup-availability')) {
  customElements.define('pickup-availability', PickupAvailability);
}
