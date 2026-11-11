/**
 * Modulo di contatto — custom element <contact-form> (sections/contact-form.liquid, sections/newsletter.liquid e
 * blocco "Newsletter" di sections/footer.liquid, form in snippets/newsletter-form.liquid).
 *
 * Il form resta quello nativo di Shopify (invio con ricaricamento: serve anche al controllo hCaptcha, che può
 * reindirizzare a /challenge). Il componente aggiunge solo lo stato di invio: pulsante "Invio in corso…" con
 * aria-busy e niente doppi invii. Al ritorno con "indietro" (bfcache) il pulsante torna utilizzabile.
 */

class ContactForm extends HTMLElement {
  connectedCallback() {
    this.form = this.querySelector('form');
    this.button = this.querySelector('[data-contact-submit]');
    this.label = this.querySelector('[data-contact-label]');
    if (!this.form || !this.button || !this.label) return;

    this.idleLabel = this.label.textContent;
    this.abort = new AbortController();
    const { signal } = this.abort;
    this.form.addEventListener('submit', this.onSubmit, { signal });
    window.addEventListener('pageshow', this.reset, { signal });
  }

  disconnectedCallback() {
    this.abort?.abort();
  }

  onSubmit = (event) => {
    // Già in invio: il secondo clic non manda un altro messaggio
    if (this.button.getAttribute('aria-busy') === 'true') {
      event.preventDefault();
      return;
    }
    this.button.setAttribute('aria-busy', 'true');
    this.label.textContent = this.dataset.sendingLabel || this.idleLabel;
  };

  reset = () => {
    this.button.removeAttribute('aria-busy');
    this.label.textContent = this.idleLabel;
  };
}

if (!customElements.get('contact-form')) {
  customElements.define('contact-form', ContactForm);
}
