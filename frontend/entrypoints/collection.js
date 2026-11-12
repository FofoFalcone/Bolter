/**
 * Filtri e ordinamento di collezione e ricerca — custom element <product-facets> (sections/main-collection.liquid,
 * sections/main-search.liquid con data-results-type="search").
 *
 * Standard events: shopify:collection:update nella collezione; nella ricerca shopify:search:update, sia a ogni
 * modifica di filtri e ordinamento sia all'arrivo sulla pagina con una ricerca appena inviata (form della pagina
 * o dell'header: la ricerca si invia con una navigazione normale). Non all'arrivo da "indietro", ricaricamento,
 * cambio di pagina dei risultati o theme editor: non sono nuove ricerche.
 *
 * Miglioramento progressivo di filtri e ordinamento, che senza JS funzionano con form GET e link:
 * - ogni modifica (casella, prezzo, ordinamento, chip dei filtri attivi, "Cancella tutto") richiede la section
 *   con la Section Rendering API (stesso URL + section_id) e sostituisce le parti [data-facets-part];
 *   id stabili → focus, gruppi aperti e scroll del cassetto restano dove erano;
 * - URL aggiornato con history.replaceState (link condivisibile): i filtri non aggiungono voci alla cronologia,
 *   "indietro" porta alla pagina precedente invece di annullarli uno a uno (scelta dell'utente del 2026-11-06,
 *   Horizon usa pushState);
 * - standard event shopify:collection:update dal form dei filtri, con promise risolta col numero di prodotti;
 * - richieste superate da una modifica successiva interrotte (AbortController); se una richiesta fallisce si
 *   apre l'URL in modo classico;
 * - prezzo: aggiornamento dopo una pausa nella digitazione; slider a due maniglie <price-range>
 *   (frontend/scripts/price-range.js) sincronizzato con i campi Da/A, aggiornamento al rilascio della maniglia;
 * - da 990px, barra orizzontale: una tendina aperta alla volta (details[name]), chiusa da clic fuori ed Esc;
 * - anteprima rapida: clic sulla card → <quick-view> della section (frontend/entrypoints/quick-view.js).
 *
 * Caricato dalla section con {% render 'vite-tag', entry: 'collection.js' %}.
 */

import { withCollectionUpdateEvent, withSearchUpdateEvent } from '@/scripts/standard-events.js';
import '@/scripts/price-range.js';
import { wrapFocus } from '@/scripts/focus-wrap.js';
import { initDeferredMedia } from '@/scripts/deferred-scripts.js';

const PRICE_DELAY = 600; // ms dopo l'ultima cifra digitata
const desktop = window.matchMedia('(min-width: 990px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const SORT_KEYS = {
  manual: 'MANUAL',
  'best-selling': 'BEST_SELLING',
  'title-ascending': 'TITLE',
  'title-descending': 'TITLE',
  'price-ascending': 'PRICE',
  'price-descending': 'PRICE',
  'created-ascending': 'CREATED',
  'created-descending': 'CREATED',
};

// Ricerca: chiavi ammesse da shopify:search:update (ordinamento predefinito = pertinenza)
const SEARCH_SORT_KEYS = {
  relevance: 'RELEVANCE',
  'price-ascending': 'PRICE',
  'price-descending': 'PRICE',
};

/** Pagina aperta con una ricerca nuova: navigazione normale (non indietro/ricarica) sulla prima pagina dei risultati. */
function isNewSearchNavigation() {
  const navigation = performance.getEntriesByType?.('navigation')[0];
  const page = Number(new URLSearchParams(window.location.search).get('page') ?? 1);
  return navigation?.type === 'navigate' && page <= 1 && !window.Shopify?.designMode;
}

/** Parametri dell'URL attuale, senza la pagina (un nuovo filtro riparte dalla prima). */
function currentParams() {
  const params = new URLSearchParams(window.location.search);
  params.delete('page');
  return params;
}

/** Confronto tra insiemi di parametri indipendente dall'ordine. */
function sortedQuery(params) {
  const copy = new URLSearchParams(params);
  copy.sort();
  return copy.toString();
}

/** Slider spostato → campi Da/A. A un estremo il campo resta vuoto: nessun limite su quel lato. */
function syncFromPriceRange(range) {
  const fieldset = range.closest('[data-facets-price]');
  const { min, max } = range.values;
  const minField = fieldset?.querySelector('[data-price-input="min"]');
  const maxField = fieldset?.querySelector('[data-price-input="max"]');
  if (minField) minField.value = min > 0 ? String(min) : '';
  if (maxField) maxField.value = max < Number(range.dataset.max) ? String(max) : '';
}

/** Campi Da/A digitati → slider (campo vuoto = estremo). */
function syncToPriceRange(field) {
  const fieldset = field.closest('[data-facets-price]');
  const range = fieldset?.querySelector('price-range');
  if (typeof range?.setValues !== 'function') return;
  const read = (name, fallback) => {
    const input = fieldset.querySelector(`[data-price-input="${name}"]`);
    const value = input?.value === '' ? NaN : Number(input?.value);
    return Number.isFinite(value) ? value : fallback;
  };
  range.setValues(read('min', 0), read('max', Number(range.dataset.max)));
}

/** Parametro dell'URL dei filtri → ProductFilter degli standard events (stessi campi della Storefront API). */
function toProductFilter(name, value, input) {
  if (name === 'filter.v.availability') return { available: value === '1' };
  if (name.startsWith('filter.v.option.')) {
    return { variantOption: { name: input?.dataset.filterLabel ?? name.slice(16), value: input?.dataset.valueLabel ?? value } };
  }
  if (name === 'filter.p.vendor') return { productVendor: value };
  if (name === 'filter.p.product_type') return { productType: value };
  if (name === 'filter.p.tag') return { tag: value };
  if (name === 'filter.p.t.category') return { category: { id: value } };
  const metafield = name.match(/^filter\.([pv])\.m\.([^.]+)\.(.+)$/);
  if (metafield) {
    const [, scope, namespace, key] = metafield;
    return { [scope === 'p' ? 'productMetafield' : 'variantMetafield']: { namespace, key, value } };
  }
  const taxonomy = name.match(/^filter\.[pv]\.t\.(.+)$/);
  if (taxonomy) return { taxonomyMetafield: { key: taxonomy[1], value } };
  return null;
}

class ProductFacets extends HTMLElement {
  connectedCallback() {
    this.sectionId = this.dataset.sectionId;
    this.abort = new AbortController();
    const signal = this.abort.signal;

    this.addEventListener('change', this.onChange, { signal });
    this.addEventListener('input', this.onInput, { signal });
    this.addEventListener('submit', this.onSubmit, { signal });
    this.addEventListener('click', this.onClick, { signal });
    this.addEventListener('pointerover', this.onIntent, { signal });
    this.addEventListener('focusin', this.onIntent, { signal });
    this.addEventListener('keydown', this.onKeyDown, { signal });
    document.addEventListener('click', this.onDocumentClick, { signal });
    window.addEventListener('popstate', this.onPopState, { signal });
    // Cassetto aperto e finestra allargata oltre i 990px: il popover diventerebbe la barra laterale
    desktop.addEventListener('change', () => this.closeDrawer(), { signal });

    // Ricerca appena inviata (anche dall'header): l'evento parte all'arrivo, una sola volta per caricamento
    if (this.isSearch && !ProductFacets.searchAnnounced && isNewSearchNavigation()) {
      ProductFacets.searchAnnounced = true;
      const results = this.querySelector('[data-facets-results]');
      withSearchUpdateEvent({
        // Il form della ricerca è nell'intestazione della section, fuori da <product-facets>
        target: this.closest('.shopify-section')?.querySelector('[data-search-form]') ?? this.form ?? this,
        payload: this.eventPayload(new URLSearchParams(window.location.search)),
        run: async () => Number(results?.dataset.productsCount ?? 0),
      }).catch(() => {});
    }
  }

  get isSearch() {
    return this.dataset.resultsType === 'search';
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.request?.abort();
    clearTimeout(this.priceTimer);
  }

  get form() {
    return this.querySelector('[data-facets-form]');
  }

  get sortSelect() {
    return this.querySelector('[data-facets-sort]');
  }

  get panel() {
    return this.querySelector('[data-facets-panel]');
  }

  /* ------------------------------------------------------------ Parametri */

  /**
   * Parametri attuali di filtri e ordinamento (pagina esclusa: un nuovo filtro riparte dalla prima). Nella ricerca
   * partono dai parametri di base (data-base-params: termini e opzioni), anche quando i filtri sono disattivati.
   */
  formParams() {
    const params = new URLSearchParams(this.dataset.baseParams ?? '');
    const baseNames = new Set(params.keys());
    if (this.form) {
      for (const [name, value] of new FormData(this.form)) {
        // L'ordinamento si legge dalla select (il campo nascosto serve solo senza JS); termini e opzioni della
        // ricerca sono già nei parametri di base
        if (name !== 'sort_by' && value !== '' && !baseNames.has(name)) params.append(name, value);
      }
    }
    const sort = this.sortSelect;
    if (sort && sort.value && sort.value !== sort.dataset.default) params.set('sort_by', sort.value);
    else if (!sort) {
      const current = new URLSearchParams(window.location.search).get('sort_by');
      if (current) params.set('sort_by', current);
    }
    return params;
  }

  /** Payload di shopify:collection:update o shopify:search:update per i parametri `params`. */
  eventPayload(params) {
    const productFilters = this.productFilters(params);
    if (this.isSearch) {
      return {
        search: {
          query: params.get('q') ?? '',
          ...(productFilters.length && { productFilters }),
          sortKey: SEARCH_SORT_KEYS[params.get('sort_by')] ?? 'RELEVANCE',
        },
      };
    }

    const sortKey = SORT_KEYS[params.get('sort_by')];
    return {
      collection: {
        id: this.dataset.collectionGid ?? null,
        handle: this.dataset.collectionHandle,
        productsCount: Number(this.dataset.collectionCount),
      },
      ...(productFilters.length && { productFilters }),
      ...(sortKey && { sortKey }),
    };
  }

  /** Parametri filter.* → ProductFilter[] degli standard events (prezzo riunito in un solo filtro). */
  productFilters(params) {
    const productFilters = [];
    const price = {};
    for (const [name, value] of params) {
      if (name === 'filter.v.price.gte') price.min = Number(value);
      else if (name === 'filter.v.price.lte') price.max = Number(value);
      else if (name.startsWith('filter.')) {
        const input = this.form?.querySelector(`input[name="${CSS.escape(name)}"][value="${CSS.escape(value)}"]`);
        const filter = toProductFilter(name, value, input);
        if (filter) productFilters.push(filter);
      }
    }
    if (Object.keys(price).length) productFilters.push({ price });
    return productFilters;
  }

  /* ------------------------------------------------------------ Aggiornamento */

  /** Applica i parametri: evento standard, richiesta della section, sostituzione delle parti, URL. */
  update(params) {
    const query = params.toString();
    // Nessuna modifica reale (es. change all'uscita dal prezzo già applicato dopo la pausa): niente richiesta
    if (sortedQuery(params) === sortedQuery(currentParams())) return Promise.resolve();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    history.replaceState({}, '', url);

    const withUpdateEvent = this.isSearch ? withSearchUpdateEvent : withCollectionUpdateEvent;
    return withUpdateEvent({
      target: this.form ?? this,
      payload: this.eventPayload(params),
      run: () => this.render(url),
    }).catch((error) => {
      // Interrotta da una modifica successiva: ci pensa quella. Altrimenti navigazione classica, senza nuova voce.
      if (error?.name !== 'AbortError') window.location.replace(url);
    });
  }

  /** Richiede la section per `url` e la applica. Restituisce il numero di prodotti trovati. */
  async render(url) {
    this.request?.abort();
    const request = new AbortController();
    this.request = request;

    const results = this.querySelector('[data-facets-results]');
    results?.setAttribute('aria-busy', 'true');
    try {
      const sectionUrl = new URL(url, window.location.origin);
      sectionUrl.searchParams.set('section_id', this.sectionId);
      const response = await fetch(sectionUrl, { signal: request.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (request.signal.aborted) throw new DOMException('Superata', 'AbortError');
      this.replaceParts(html);
      return Number(html.querySelector('[data-facets-results]')?.dataset.productsCount ?? 0);
    } finally {
      if (this.request === request) {
        this.request = null;
        this.querySelector('[data-facets-results]')?.removeAttribute('aria-busy');
      }
    }
  }

  /** Sostituisce le parti [data-facets-part] mantenendo focus, gruppi aperti e scroll del cassetto. */
  replaceParts(html) {
    const focusedId = document.activeElement?.id;
    const openGroups = new Map(
      [...this.querySelectorAll('details[id]')].map((details) => [details.id, details.open]),
    );
    const scroller = this.querySelector('[data-facets-scroll]');
    const scrollTop = scroller?.scrollTop ?? 0;

    // Maniglia del prezzo trascinata in questo momento: i filtri si aggiornano al rilascio successivo,
    // sostituirli ora interromperebbe il trascinamento
    const dragging = this.querySelector('price-range[data-dragging]');
    for (const next of html.querySelectorAll('[data-facets-part]')) {
      const current = this.querySelector(`[data-facets-part="${next.dataset.facetsPart}"]`);
      if (!current || (dragging && current.contains(dragging))) continue;
      current.replaceWith(document.importNode(next, true));
    }

    // Gruppi: lo stato scelto dall'utente vince su quello predefinito del server
    for (const [id, open] of openGroups) {
      const details = document.getElementById(id);
      if (details) details.open = open;
    }
    const newScroller = this.querySelector('[data-facets-scroll]');
    if (newScroller) newScroller.scrollTop = scrollTop;
    if (focusedId && this.contains(document.getElementById(focusedId))) {
      document.getElementById(focusedId).focus({ preventScroll: true });
    }

    const results = this.querySelector('[data-facets-results]');
    if (results && !reducedMotion.matches) {
      results.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
    // Immagini delle card differite (data-deferred-root): la Section Rendering le manda nel <noscript>
    if (results) initDeferredMedia(results);
    // Card dei nuovi risultati: quelle in vista restano ferme, le altre compaiono allo scroll (animations.js)
    if (results?.querySelector('[data-animate-scroll]')) {
      import('@/scripts/animations.js').then(({ initAnimations }) => initAnimations(results));
    }
    // Card con il selettore colore arrivate con i nuovi risultati: il JS si scarica solo se servono
    if (results?.querySelector('product-card [data-card-swatches]')) import('@/scripts/product-card.js');

    const status = this.parentElement?.querySelector('[data-facets-status]');
    const count = this.querySelector('[data-facets-part="count"]');
    if (status && count) status.textContent = count.textContent.trim();
    // Il link usato (chip, "Cancella tutto", "Rimuovi" di un gruppo) non esiste più: il focus va al titolo del
    // gruppo o al conteggio dei risultati
    if (this.focusAfterUpdate) {
      const target = this.focusAfterUpdate === 'count' ? count : document.getElementById(this.focusAfterUpdate);
      this.focusAfterUpdate = null;
      (target ?? count)?.focus({ preventScroll: true });
    }
  }

  /**
   * Campo prezzo: se l'importo non è valido mostra il messaggio del gruppo, collegato con aria-describedby, e
   * imposta aria-invalid. Restituisce true se il campo è valido.
   */
  validatePrice(field) {
    const fieldset = field.closest('[data-facets-price]');
    const error = fieldset?.querySelector('[data-price-error]');
    let anyInvalid = false;
    for (const input of fieldset?.querySelectorAll('[data-price-input]') ?? []) {
      const invalid = !input.checkValidity();
      anyInvalid ||= invalid;
      if (invalid) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      if (error) {
        if (invalid) input.setAttribute('aria-describedby', error.id);
        else input.removeAttribute('aria-describedby');
      }
    }
    if (error) error.hidden = !anyInvalid;
    return field.checkValidity();
  }

  closeDrawer() {
    const panel = this.panel;
    if (panel?.matches(':popover-open')) panel.hidePopover();
  }

  /* ------------------------------------------------------------ Eventi */

  onChange = (event) => {
    const target = event.target;
    if (target.matches('[data-facets-sort]')) {
      this.update(this.formParams());
      return;
    }
    if (!target.closest('[data-facets-form]')) return;
    if (target.matches('price-range')) {
      // Rilascio della maniglia (o tasto): risultati aggiornati subito
      clearTimeout(this.priceTimer);
      syncFromPriceRange(target);
    } else if (target.type === 'number') {
      clearTimeout(this.priceTimer);
      if (!this.validatePrice(target)) return;
    }
    this.update(this.formParams());
  };

  /**
   * Prezzo: lo slider segue i campi e viceversa mentre si trascina o si digita; i risultati si aggiornano al
   * rilascio della maniglia (change) o dopo una pausa nella digitazione (change dei campi arriva solo uscendo).
   */
  onInput = (event) => {
    const target = event.target;
    if (!target.closest('[data-facets-form]')) return;
    if (target.matches('price-range')) {
      syncFromPriceRange(target);
      return;
    }
    if (target.type !== 'number') return;
    syncToPriceRange(target);
    clearTimeout(this.priceTimer);
    this.priceTimer = setTimeout(() => {
      if (this.validatePrice(target)) this.update(this.formParams());
    }, PRICE_DELAY);
  };

  /** "Mostra N prodotti" del cassetto (e "Applica" senza JS): i risultati sono già aggiornati, si chiude. */
  onSubmit = (event) => {
    event.preventDefault();
    clearTimeout(this.priceTimer);
    if (event.target.matches('[data-facets-sort-form]')) {
      this.update(this.formParams());
      return;
    }
    this.update(this.formParams());
    // Cassetto (sotto i 990px): si chiude e si torna ai risultati, già aggiornati mentre si sceglieva
    if (this.panel?.matches(':popover-open')) {
      this.closeDrawer();
      this.querySelector('[data-facets-results]')?.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    }
  };

  onClick = (event) => {
    const link = event.target.closest('a[data-facets-link]');
    if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
      event.preventDefault();
      const params = new URL(link.href, window.location.origin).searchParams;
      params.delete('page');
      // Il link sparisce con l'aggiornamento: "Rimuovi" di un gruppo → titolo del gruppo; chip e stato vuoto →
      // conteggio dei risultati; "Cancella tutto" nel cassetto → "Mostra N prodotti", così si resta nel pannello
      const group = link.closest('details[data-facet-group]');
      if (group) this.focusAfterUpdate = `${group.id}-summary`;
      else if (link.closest('[data-facets-part="active"], [data-facets-results]')) this.focusAfterUpdate = 'count';
      else if (link.closest('[data-facets-part="clear"]')) this.focusAfterUpdate = this.querySelector('[data-facets-submit]')?.id;
      this.update(params);
      return;
    }

    const trigger = event.target.closest('[data-quick-view-url]');
    if (!trigger) return;
    // quick-view.js arriva a pagina caricata (snippets/quick-view.liquid, when: 'idle'): prima si apre la pagina
    // prodotto, come senza JS, invece di un clic che non fa nulla
    if (!this.quickView) {
      window.location.assign(trigger.dataset.quickViewUrl);
      return;
    }
    this.quickView.show({
      url: trigger.dataset.quickViewUrl,
      origin: trigger.closest('product-card')?.querySelector('[data-card-media]'),
      label: trigger.getAttribute('aria-label'),
    });
  };

  /** Puntatore o focus su una card: il contenuto dell'anteprima rapida parte in anticipo. */
  onIntent = (event) => {
    const trigger = event.target.closest?.('[data-quick-view-url]');
    if (trigger) this.quickView?.prefetch(trigger.dataset.quickViewUrl);
  };

  /** Barra orizzontale (da 990px): Esc chiude la tendina aperta e riporta il focus sul suo titolo. */
  onKeyDown = (event) => {
    // Cassetto dei filtri aperto (sotto i 990px): Tab gira dentro il pannello invece di finire sotto il velo
    if (event.key === 'Tab' && this.panel?.matches(':popover-open')) {
      wrapFocus(event, this.panel);
      return;
    }
    if (event.key !== 'Escape' || !this.isToolbar) return;
    const details = event.target.closest('details[data-facet-group][open]');
    if (!details) return;
    details.open = false;
    details.querySelector('summary')?.focus();
  };

  /** Barra orizzontale (da 990px): il clic fuori chiude la tendina aperta. */
  onDocumentClick = (event) => {
    if (!this.isToolbar) return;
    for (const details of this.querySelectorAll('details[data-facet-group][open]')) {
      if (!details.contains(event.target)) details.open = false;
    }
  };

  onPopState = () => {
    // Indietro/avanti dentro la pagina (i filtri non creano voci, un'ancora sì): risultati come nell'URL, senza evento
    this.render(window.location.href).catch((error) => {
      if (error?.name !== 'AbortError') window.location.reload();
    });
  };

  get isToolbar() {
    return this.dataset.layout === 'toolbar' && desktop.matches;
  }

  /** <quick-view> della section, quando definito (quick-view.js si carica a parte). */
  get quickView() {
    const element = this.dataset.quickView && document.getElementById(this.dataset.quickView);
    return element && typeof element.show === 'function' ? element : null;
  }
}

if (!customElements.get('product-facets')) {
  customElements.define('product-facets', ProductFacets);
}
