/**
 * Ticker, presentazione "elenco" — custom element <ticker-rows> (sections/ticker.liquid).
 * Al passaggio del mouse o con il focus da tastiera l'etichetta di una riga lascia il posto a una striscia con lo
 * stesso testo, che scorre finché la riga resta attiva. Il testo vero resta nel link; la striscia è aria-hidden.
 * Al tocco e con prefers-reduced-motion: reduce le righe restano normali link.
 */

import { animate } from 'motion/mini';

const EXIT_DURATION = 300; // ms: la striscia si ferma dopo che è uscita (durata della transizione nel Liquid)

class TickerRows extends HTMLElement {
  connectedCallback() {
    this.speed = Number(this.dataset.speed) || 80;
    this.reverse = this.dataset.direction === 'reverse';
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: no-preference)');
    this.states = new Map();
    this.abort = new AbortController();
    const { signal } = this.abort;

    for (const row of this.querySelectorAll('[data-ticker-row]')) {
      row.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'mouse') this.activate(row);
      }, { signal });
      row.addEventListener('pointerleave', () => this.deactivate(row), { signal });
      row.addEventListener('focusin', (event) => {
        if (event.target.matches(':focus-visible')) this.activate(row);
      }, { signal });
      row.addEventListener('focusout', () => this.deactivate(row), { signal });
    }
  }

  disconnectedCallback() {
    this.abort?.abort();
    for (const state of this.states.values()) {
      clearTimeout(state.timer);
      state.controls?.cancel();
    }
  }

  activate(row) {
    if (!this.motionQuery.matches) return;
    const state = this.states.get(row) ?? {};
    this.states.set(row, state);
    clearTimeout(state.timer);
    row.toggleAttribute('data-active', true);
    if (!state.controls) state.controls = this.run(row);
    state.controls?.play();
  }

  deactivate(row) {
    if (!row.hasAttribute('data-active')) return;
    row.removeAttribute('data-active');
    const state = this.states.get(row);
    state.timer = setTimeout(() => state.controls?.pause(), EXIT_DURATION);
  }

  /** Riempie la striscia quanto basta per un giro senza stacchi e la anima di una ripetizione alla volta. */
  run(row) {
    const strip = row.querySelector('[data-ticker-strip]');
    const unit = strip?.firstElementChild;
    if (!unit) return null;

    const size = unit.getBoundingClientRect().width;
    if (!size) return null;
    const copies = Math.ceil(row.getBoundingClientRect().width / size) + 1;
    while (strip.childElementCount < copies) strip.append(unit.cloneNode(true));

    const sign = getComputedStyle(row).direction === 'rtl' ? 1 : -1;
    const from = 'translate3d(0, 0, 0)';
    const to = `translate3d(${sign * size}px, 0, 0)`;
    return animate(
      strip,
      { transform: this.reverse ? [to, from] : [from, to] },
      { duration: size / this.speed, ease: 'linear', repeat: Infinity },
    );
  }
}

if (!customElements.get('ticker-rows')) {
  customElements.define('ticker-rows', TickerRows);
}
