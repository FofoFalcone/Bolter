/**
 * Barra annunci — custom element <announcement-bar> (sections/announcement-bar.liquid).
 * Caricato solo con più di un messaggio.
 *
 * - Rotazione "ticker": il messaggio corrente esce verso l'alto (data-state="before"), il nuovo entra dal
 *   basso (parte da "after"); con la freccia indietro la direzione si inverte. Transizioni CSS nel markup.
 * - Autoplay (data-autoplay = ms): fermo al passaggio del mouse, con il focus dentro, con la scheda in
 *   background e con prefers-reduced-motion; pulsante pausa/riproduzione (WCAG 2.2.2).
 * - Lettori di schermo: aria-live "off" mentre ruota da solo, "polite" quando l'utente lo controlla.
 * - Theme editor: selezionando un messaggio la barra lo mostra e si ferma.
 */

const MOTION_QUERY = '(prefers-reduced-motion: reduce)';

class AnnouncementBar extends HTMLElement {
  connectedCallback() {
    this.slides = Array.from(this.querySelectorAll('[data-announcement]'));
    this.track = this.querySelector('[data-announcement-track]');
    this.toggle = this.querySelector('[data-announcement-toggle]');
    if (this.slides.length < 2) return;

    this.index = Math.max(0, this.slides.findIndex((slide) => slide.dataset.state === 'active'));
    this.delay = Number(this.dataset.autoplay) || 0;
    this.reducedMotion = window.matchMedia(MOTION_QUERY);
    this.userPaused = this.reducedMotion.matches;
    this.hovered = false;
    this.focused = false;

    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.querySelector('[data-announcement-prev]')?.addEventListener('click', () => this.go(-1), { signal });
    this.querySelector('[data-announcement-next]')?.addEventListener('click', () => this.go(1), { signal });
    this.toggle?.addEventListener('click', () => {
      this.userPaused = !this.userPaused;
      this.update();
    }, { signal });
    this.addEventListener('pointerenter', () => ((this.hovered = true), this.update()), { signal });
    this.addEventListener('pointerleave', () => ((this.hovered = false), this.update()), { signal });
    this.addEventListener('focusin', () => ((this.focused = true), this.update()), { signal });
    this.addEventListener('focusout', (event) => {
      if (this.contains(event.relatedTarget)) return;
      this.focused = false;
      this.update();
    }, { signal });
    document.addEventListener('visibilitychange', () => this.update(), { signal });
    this.reducedMotion.addEventListener('change', () => this.update(), { signal });
    document.addEventListener('shopify:block:select', (event) => {
      const index = this.slides.indexOf(event.target);
      if (index < 0) return;
      this.userPaused = true;
      this.show(index, index < this.index ? -1 : 1);
      this.update();
    }, { signal });

    this.update();
  }

  disconnectedCallback() {
    this.abort?.abort();
    clearTimeout(this.timer);
  }

  get playing() {
    return Boolean(this.delay) && !this.userPaused && !this.hovered && !this.focused && !document.hidden && !this.reducedMotion.matches;
  }

  /** Avvia o ferma il timer e allinea pulsante pausa e aria-live allo stato. */
  update() {
    clearTimeout(this.timer);
    const playing = this.playing;
    if (playing) this.timer = setTimeout(() => this.go(1), this.delay);

    if (this.delay) this.toggleAttribute('data-paused', this.userPaused);
    if (this.toggle) {
      this.toggle.setAttribute('aria-label', this.userPaused ? this.toggle.dataset.labelPlay : this.toggle.dataset.labelPause);
    }
    // Messaggi annunciati solo quando cambiano per un'azione dell'utente
    this.track?.setAttribute('aria-live', playing ? 'off' : 'polite');
  }

  go(step) {
    this.show((this.index + step + this.slides.length) % this.slides.length, step);
    this.update();
  }

  show(index, direction) {
    if (index === this.index) return;
    const current = this.slides[this.index];
    const next = this.slides[index];

    // Il nuovo messaggio parte dal lato opposto all'uscita, senza transizione
    next.style.transition = 'none';
    next.dataset.state = direction > 0 ? 'after' : 'before';
    void next.offsetHeight;
    next.style.removeProperty('transition');

    current.dataset.state = direction > 0 ? 'before' : 'after';
    next.dataset.state = 'active';
    this.setHidden(current, true);
    this.setHidden(next, false);
    this.index = index;
  }

  setHidden(slide, hidden) {
    // aria-hidden vuoto non vale "true": valore esplicito
    if (hidden) slide.setAttribute('aria-hidden', 'true');
    else slide.removeAttribute('aria-hidden');
    slide.querySelectorAll('a, button').forEach((control) => {
      if (hidden) control.setAttribute('tabindex', '-1');
      else control.removeAttribute('tabindex');
    });
  }
}

if (!customElements.get('announcement-bar')) {
  customElements.define('announcement-bar', AnnouncementBar);
}
