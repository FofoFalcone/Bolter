/**
 * Ricerca predittiva — custom element <predictive-search> (snippet header-search).
 * Caricato da frontend/scripts/header.js con import dinamico all'intenzione di cercare (passaggio del mouse,
 * focus o clic sull'icona, apertura del pannello): nessun costo sulle pagine in cui non si cerca.
 *
 * - Predictive Search API + Section Rendering API: /search/suggest?q=…&section_id=predictive-search
 *   (URL localizzato da routes.predictive_search_url). Richieste con ritardo (debounce), annullate quando
 *   si continua a digitare, risultati in cache per termine. Errori e limite di richieste (429): restano i
 *   risultati precedenti, Invio porta comunque alla pagina di ricerca.
 * - Lingua non supportata dall'API (#shopify-features → predictiveSearch: false): resta la ricerca classica.
 * - Accessibilità (pattern combobox + listbox): frecce su/giù tra i risultati (aria-activedescendant),
 *   Invio apre il risultato attivo, stato annunciato (numero di risultati) in una regione live.
 * - Nessun evento standard qui: shopify:search:update va emesso quando la ricerca viene inviata
 *   (pagina di ricerca), non a ogni lettera digitata.
 */

const DEBOUNCE = 200; // ms dopo l'ultima lettera
const ANNOUNCE_DELAY = 500; // ms: annuncia solo lo stato finale, non ogni risultato intermedio
const LIMIT = 6; // risultati per tipo (resources[limit_scope]=each): 6 prodotti = una riga da 1280px

function predictiveSearchSupported() {
  try {
    const features = JSON.parse(document.getElementById('shopify-features')?.textContent || '{}');
    return features.predictiveSearch !== false;
  } catch {
    return true;
  }
}

class PredictiveSearch extends HTMLElement {
  connectedCallback() {
    this.input = this.querySelector('input[type="search"]');
    this.form = this.querySelector('form');
    this.container = this.querySelector('[data-predictive-results-container]');
    this.status = this.querySelector('[data-predictive-status]');
    this.panel = this.closest('[popover]');
    if (!this.input || !this.container || !this.dataset.url || !predictiveSearchSupported()) return;

    this.cache = new Map();
    this.active = null;
    this.abort = new AbortController();
    const signal = this.abort.signal;

    this.input.addEventListener('input', () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.search(), DEBOUNCE);
    }, { signal });
    this.input.addEventListener('keydown', (event) => this.onKeydown(event), { signal });
    this.form?.addEventListener('submit', (event) => this.onSubmit(event), { signal });
    this.panel?.addEventListener('toggle', (event) => {
      if (event.newState === 'open' && this.input.value.trim() && !this.hasAttribute('data-results')) this.search();
      if (event.newState === 'closed') this.setActive(null);
    }, { signal });

    // Campo già compilato (pagina di ricerca) o testo digitato prima del caricamento di questo modulo
    if (this.input.value.trim()) this.search();
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.request?.abort();
    clearTimeout(this.timer);
    clearTimeout(this.announceTimer);
  }

  async search() {
    const terms = this.input.value.trim();
    this.request?.abort();
    if (!terms) {
      this.render('', '');
      return;
    }
    if (this.cache.has(terms)) {
      this.render(this.cache.get(terms), terms);
      return;
    }

    const request = (this.request = new AbortController());
    this.setAttribute('data-loading', '');
    try {
      const params = new URLSearchParams({
        q: terms,
        section_id: this.dataset.sectionId,
        'resources[limit]': LIMIT,
        'resources[limit_scope]': 'each',
      });
      const response = await fetch(`${this.dataset.url}?${params}`, { signal: request.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html =
        new DOMParser().parseFromString(await response.text(), 'text/html').querySelector('[data-predictive-results]')
          ?.outerHTML ?? '';
      this.cache.set(terms, html);
      // Solo se nel frattempo il testo non è cambiato
      if (this.input.value.trim() === terms) this.render(html, terms);
    } catch (error) {
      if (error.name === 'AbortError') return;
    } finally {
      if (this.request === request) this.removeAttribute('data-loading');
    }
  }

  render(html, terms) {
    this.removeAttribute('data-loading');
    this.setActive(null);
    this.container.innerHTML = html;
    const results = this.container.querySelector('[data-predictive-results]');
    this.toggleAttribute('data-results', Boolean(results));
    this.input.setAttribute('aria-expanded', String(this.options.length > 0));

    clearTimeout(this.announceTimer);
    const message = terms ? (results?.querySelector('[data-predictive-announcement]')?.textContent.trim() ?? '') : '';
    this.announceTimer = setTimeout(() => {
      if (this.status) this.status.textContent = message;
    }, ANNOUNCE_DELAY);
  }

  get options() {
    return Array.from(this.container.querySelectorAll('[role="option"]'));
  }

  onKeydown(event) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const options = this.options;
    if (!options.length) return;
    event.preventDefault();
    const index = options.indexOf(this.active);
    const next =
      event.key === 'ArrowDown' ? (index + 1) % options.length : index <= 0 ? options.length - 1 : index - 1;
    this.setActive(options[next]);
  }

  /** Invio con un risultato attivo: apre quello; altrimenti il form porta alla pagina di ricerca. */
  onSubmit(event) {
    if (!this.active) return;
    event.preventDefault();
    // L'opzione è il link stesso (role="option" sull'<a>: niente elementi interattivi annidati)
    this.active.click();
  }

  setActive(option) {
    this.active?.setAttribute('aria-selected', 'false');
    this.active = option ?? null;
    if (this.active) {
      this.active.setAttribute('aria-selected', 'true');
      this.input.setAttribute('aria-activedescendant', this.active.id);
      this.active.scrollIntoView({ block: 'nearest' });
    } else {
      this.input.removeAttribute('aria-activedescendant');
    }
  }
}

if (!customElements.get('predictive-search')) {
  customElements.define('predictive-search', PredictiveSearch);
}
