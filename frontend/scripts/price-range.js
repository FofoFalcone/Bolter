/**
 * Slider del prezzo a due maniglie — custom element <price-range> (snippets/facets-panel.liquid).
 *
 * Componente del tema, senza librerie, secondo il pattern WAI-ARIA "Multi-Thumb Slider"
 * (https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/):
 * - due maniglie role="slider" con aria-valuenow / aria-valuetext (importo nella valuta del negozio); i limiti
 *   di ciascuna seguono l'altra (aria-valuemax del minimo = valore del massimo e viceversa), così non si incrociano;
 * - tastiera: frecce ±1, Pagina su/giù ±10% dell'intervallo, Home/Fine agli estremi consentiti;
 * - puntatore (mouse, tocco, penna): si trascina una maniglia oppure si tocca la barra, che sposta la maniglia
 *   più vicina e la lascia trascinare; pointer capture, nessuno scroll della pagina mentre si trascina;
 * - posizioni nelle variabili CSS --range-min / --range-max (in %), calcolate anche dal Liquid: nessun salto
 *   all'avvio. Lo stile è tutto nelle utility Tailwind del markup;
 * - importo in un'etichetta sopra la maniglia (hover, focus da tastiera, trascinamento anche col tocco), aria-hidden:
 *   ai lettori di schermo lo dice già aria-valuetext.
 *
 * Eventi (bubbling) per chi lo usa (frontend/entrypoints/collection.js):
 * - input: a ogni spostamento (trascinamento, tasto);
 * - change: a fine spostamento (rilascio della maniglia, tasto), quando conviene aggiornare i risultati.
 * Valori: element.values → { min, max } in unità intere; element.setValues(min, max) senza eventi (sincronizzazione
 * dai campi Da/A). L'attributo data-dragging resta durante il trascinamento.
 */

const formatters = new Map();

/** Importo intero nella valuta `currency` (es. "40 €"), per aria-valuetext. */
function formatPrice(value, currency) {
  if (!formatters.has(currency)) {
    let formatter = null;
    try {
      formatter = new Intl.NumberFormat(document.documentElement.lang || undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      });
    } catch {
      // Valuta non riconosciuta da Intl: solo il numero
    }
    formatters.set(currency, formatter);
  }
  return formatters.get(currency)?.format(value) ?? String(value);
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

class PriceRange extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector('[data-price-range-track]');
    this.thumbs = {
      min: this.querySelector('[data-thumb="min"]'),
      max: this.querySelector('[data-thumb="max"]'),
    };
    if (!this.track || !this.thumbs.min || !this.thumbs.max) return;

    this.limit = Number(this.dataset.max) || 0;
    this.current = {
      min: Number(this.thumbs.min.getAttribute('aria-valuenow')) || 0,
      max: Number(this.thumbs.max.getAttribute('aria-valuenow')) || this.limit,
    };

    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.addEventListener('pointerdown', this.onPointerDown, { signal });
    this.addEventListener('pointermove', this.onPointerMove, { signal });
    this.addEventListener('pointerup', this.onPointerEnd, { signal });
    this.addEventListener('pointercancel', this.onPointerEnd, { signal });
    this.addEventListener('keydown', this.onKeyDown, { signal });
    this.render();
  }

  disconnectedCallback() {
    this.abort?.abort();
  }

  get values() {
    return { ...this.current };
  }

  /** Imposta i valori senza emettere eventi (es. importi digitati nei campi Da/A). */
  setValues(min, max) {
    this.current.max = clamp(Math.ceil(max), 0, this.limit);
    this.current.min = clamp(Math.floor(min), 0, this.current.max);
    this.render();
  }

  /* ------------------------------------------------------------ Valori */

  /** Sposta la maniglia `name` a `value`, entro i limiti dati dall'altra maniglia. */
  move(name, value) {
    const next =
      name === 'min'
        ? clamp(Math.round(value), 0, this.current.max)
        : clamp(Math.round(value), this.current.min, this.limit);
    if (next === this.current[name]) return false;
    this.current[name] = next;
    this.render();
    this.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  render() {
    const { min, max } = this.current;
    const percent = (value) => (this.limit ? (value / this.limit) * 100 : 0);
    this.style.setProperty('--range-min', `${percent(min)}%`);
    this.style.setProperty('--range-max', `${percent(max)}%`);

    const currency = this.dataset.currency;
    const { min: minThumb, max: maxThumb } = this.thumbs;
    minThumb.setAttribute('aria-valuenow', min);
    minThumb.setAttribute('aria-valuemax', max);
    minThumb.setAttribute('aria-valuetext', formatPrice(min, currency));
    maxThumb.setAttribute('aria-valuenow', max);
    maxThumb.setAttribute('aria-valuemin', min);
    maxThumb.setAttribute('aria-valuetext', formatPrice(max, currency));

    // Etichetta sopra la maniglia: segue subito il valore (niente cifre animate, resterebbero indietro rispetto al dito)
    minThumb.querySelector('[data-thumb-value]').textContent = minThumb.getAttribute('aria-valuetext');
    maxThumb.querySelector('[data-thumb-value]').textContent = maxThumb.getAttribute('aria-valuetext');
  }

  /** Valore corrispondente alla coordinata orizzontale `clientX` sulla barra. */
  valueAt(clientX) {
    const rect = this.track.getBoundingClientRect();
    const ratio = rect.width ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0;
    return ratio * this.limit;
  }

  /** Maniglia più vicina a `value`; a parità (maniglie sovrapposte) quella nella direzione del movimento. */
  nearest(value) {
    const { min, max } = this.current;
    if (min === max) return value > max ? 'max' : 'min';
    return Math.abs(value - min) <= Math.abs(value - max) ? 'min' : 'max';
  }

  /** La maniglia usata per ultima resta sopra: se si sovrappongono si può sempre riprenderla. */
  bringToFront(name) {
    this.thumbs.min.toggleAttribute('data-front', name === 'min');
    this.thumbs.max.toggleAttribute('data-front', name === 'max');
  }

  /* ------------------------------------------------------------ Puntatore */

  onPointerDown = (event) => {
    if (event.button !== 0 || !this.limit) return;
    const value = this.valueAt(event.clientX);
    const thumb = event.target.closest('[data-thumb]');
    const name = thumb?.dataset.thumb ?? this.nearest(value);

    event.preventDefault(); // niente selezione di testo né scroll
    this.drag = { name, pointerId: event.pointerId, moved: false };
    this.setPointerCapture(event.pointerId);
    this.toggleAttribute('data-dragging', true);
    this.bringToFront(name);
    // focusVisible: false: niente anello né etichetta fissa dopo il rilascio per chi usa il puntatore
    this.thumbs[name].focus({ preventScroll: true, focusVisible: false });
    // Tocco sulla barra: la maniglia raggiunge subito il punto (con la transizione CSS)
    if (!thumb) this.drag.moved = this.move(name, value);
  };

  onPointerMove = (event) => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    if (this.move(this.drag.name, this.valueAt(event.clientX))) this.drag.moved = true;
  };

  onPointerEnd = (event) => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const { moved } = this.drag;
    this.drag = null;
    this.removeAttribute('data-dragging');
    if (moved) this.dispatchEvent(new Event('change', { bubbles: true }));
  };

  /* ------------------------------------------------------------ Tastiera */

  onKeyDown = (event) => {
    const thumb = event.target.closest('[data-thumb]');
    if (!thumb) return;
    const name = thumb.dataset.thumb;
    const value = this.current[name];
    const page = Math.max(1, Math.round(this.limit / 10));
    const targets = {
      ArrowLeft: value - 1,
      ArrowDown: value - 1,
      ArrowRight: value + 1,
      ArrowUp: value + 1,
      PageDown: value - page,
      PageUp: value + page,
      Home: name === 'min' ? 0 : this.current.min,
      End: name === 'min' ? this.current.max : this.limit,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    this.bringToFront(name);
    if (this.move(name, targets[event.key])) this.dispatchEvent(new Event('change', { bubbles: true }));
  };
}

if (!customElements.get('price-range')) {
  customElements.define('price-range', PriceRange);
}
