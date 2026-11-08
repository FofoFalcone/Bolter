/**
 * Pulsante di condivisione — custom element <share-button> (sections/main-article.liquid; riusabile).
 *
 * Con la Web Share API (mobile e alcuni desktop) apre il pannello di condivisione del dispositivo; altrimenti copia
 * il link negli appunti e lo conferma nella regione [data-share-status] (role="status"), che si svuota dopo 3 s.
 * Annullare la condivisione nativa non è un errore. Attributi: data-url, data-title, data-copied (testo di conferma).
 */

const MESSAGE_MS = 3000;

class ShareButton extends HTMLElement {
  connectedCallback() {
    this.trigger = this.querySelector('[data-share-trigger]');
    this.status = this.querySelector('[data-share-status]');
    this.onClick = this.onClick.bind(this);
    this.trigger?.addEventListener('click', this.onClick);
  }

  disconnectedCallback() {
    this.trigger?.removeEventListener('click', this.onClick);
    clearTimeout(this.timer);
  }

  async onClick() {
    const data = { title: this.dataset.title, url: this.dataset.url };
    if (navigator.share && navigator.canShare?.(data) !== false) {
      try {
        await navigator.share(data);
        return;
      } catch (error) {
        if (error.name === 'AbortError') return; // condivisione annullata dall'utente
      }
    }
    try {
      await navigator.clipboard.writeText(data.url);
      this.showStatus(this.dataset.copied);
    } catch {
      // Appunti non disponibili (contesto non sicuro): si mostra il link, selezionabile a mano
      this.showStatus(data.url);
    }
  }

  showStatus(text) {
    if (!this.status) return;
    this.status.textContent = text;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.status.textContent = ''), MESSAGE_MS);
  }
}

if (!customElements.get('share-button')) {
  customElements.define('share-button', ShareButton);
}
