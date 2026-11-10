/**
 * Conto alla rovescia — custom element <countdown-timer> (sections/countdown.liquid).
 *
 * - data-end: istante di fine in ISO 8601 con l'offset del negozio. Le cifre si aggiornano una volta al secondo,
 *   allineate al cambio di secondo, e solo quelle cambiate (aria-hidden: i lettori di schermo leggono la frase fissa).
 * - Pausa (WCAG 2.2.2): ferma l'aggiornamento finché il cliente non lo riprende; data-paused sceglie l'icona.
 * - Scheda nascosta: niente aggiornamenti, al ritorno si ricalcola da Date.now().
 * - Scadenza (anche su una pagina servita dalla cache): data-expired="hide" nasconde la section, "message" mostra
 *   il messaggio al posto di testi, cifre e pulsante. Nel theme editor la section resta, per poterla modificare.
 */

const UNITS = [
  ['days', 86400],
  ['hours', 3600],
  ['minutes', 60],
  ['seconds', 1],
];

class CountdownTimer extends HTMLElement {
  connectedCallback() {
    this.end = Date.parse(this.dataset.end);
    if (Number.isNaN(this.end)) return;
    this.units = Object.fromEntries(
      Array.from(this.querySelectorAll('[data-countdown-unit]'), (element) => [element.dataset.countdownUnit, element]),
    );
    this.toggle = this.querySelector('[data-countdown-toggle]');
    this.paused = false;

    this.abort = new AbortController();
    const { signal } = this.abort;
    this.toggle?.addEventListener('click', () => this.setPaused(!this.paused), { signal });
    document.addEventListener('visibilitychange', () => this.schedule(), { signal });

    this.tick();
  }

  disconnectedCallback() {
    this.abort?.abort();
    clearTimeout(this.timer);
  }

  setPaused(paused) {
    this.paused = paused;
    this.toggleAttribute('data-paused', paused);
    this.toggle?.setAttribute('aria-label', paused ? this.toggle.dataset.labelPlay : this.toggle.dataset.labelPause);
    this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    if (this.paused || document.hidden) return;
    // Al prossimo cambio di secondo, così le cifre non restano indietro
    this.timer = setTimeout(() => this.tick(), 1000 - (Date.now() % 1000) + 20);
  }

  tick() {
    const remaining = Math.max(0, Math.floor((this.end - Date.now()) / 1000));
    if (remaining === 0) {
      this.expire();
      return;
    }
    let rest = remaining;
    for (const [name, size] of UNITS) {
      const value = Math.floor(rest / size);
      rest -= value * size;
      const element = this.units[name];
      const text = name === 'days' ? String(value) : String(value).padStart(2, '0');
      if (element && element.textContent !== text) element.textContent = text;
    }
    this.schedule();
  }

  expire() {
    clearTimeout(this.timer);
    for (const element of Object.values(this.units)) element.textContent = '00';
    if (this.hasAttribute('data-design-mode')) return;

    const message = this.querySelector('[data-countdown-message]');
    if (this.dataset.expired === 'message' && message) {
      this.querySelectorAll('[data-countdown-running]').forEach((element) => {
        element.hidden = true;
      });
      message.hidden = false;
    } else {
      (this.closest('.shopify-section') ?? this).hidden = true;
    }
  }
}

if (!customElements.get('countdown-timer')) {
  customElements.define('countdown-timer', CountdownTimer);
}
