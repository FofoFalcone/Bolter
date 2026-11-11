/**
 * Carosello — custom element <carousel-slider> (sections/carousel.liquid).
 *
 * Codice originale con API native: dagli esempi "Carousel" di Motion+ solo le idee.
 * Lo scorrimento resta quello del browser (scroll-snap): tocco, rotella, trackpad e tastiera funzionano anche senza
 * questo script. Qui si aggiungono:
 * - frecce e paginazione (pallini, contatore o barra). Una pagina è ciò che entra nello schermo, calcolata sulle
 *   larghezze reali: slide larghe e strette possono convivere;
 * - trascinamento col mouse (il tocco è già nativo). Lo snap si spegne durante il gesto, altrimenti il browser
 *   riporterebbe la traccia alla slide più vicina a ogni movimento;
 * - scorrimento automatico opzionale, con pausa (WCAG 2.2.2). Si ferma al passaggio del mouse, col focus, fuori dallo
 *   schermo e per sempre dopo un gesto del cliente; mai con movimento ridotto né nel theme editor;
 * - effetti e barra: frontend/entrypoints/carousel-effects.js, importato solo se servono.
 *
 * Non gestisce la direzione da destra a sinistra: il layout non imposta `dir` e le lingue del tema sono italiano e inglese.
 */

const DOT_SIZE = 24; // px, area di tocco minima (WCAG 2.5.8)
const ROW_GAP = 16; // px, gap-4 della riga dei comandi
const SETTLE_DELAY = 140; // ms senza scorrimento dopo cui la traccia è considerata ferma
const DRAG_THRESHOLD = 5; // px: sotto è un clic
const DRAG_PROJECTION = 180; // ms di velocità aggiunti alla posizione di rilascio

// Copia locale, non import da scripts/reduced-motion.js: l'import aggiungeva un file all'entrypoint (2 → 3), cioè
// una richiesta in più per una riga (misurato il 2026-11-11).
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

class CarouselSlider extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector('[data-carousel-track]');
    this.slides = Array.from(this.track?.children ?? []);
    this.toggleAttribute('data-static', this.slides.length === 0);
    if (this.slides.length === 0) return;

    this.abort = new AbortController();
    const { signal } = this.abort;
    this.previousButtons = this.querySelectorAll('[data-carousel-previous]');
    this.nextButtons = this.querySelectorAll('[data-carousel-next]');
    this.dots = this.querySelector('[data-carousel-dots]');
    this.dotTemplate = this.querySelector('[data-carousel-dot-template]');
    this.count = this.querySelector('[data-carousel-count]');
    this.current = this.querySelector('[data-carousel-current]');
    this.total = this.querySelector('[data-carousel-total]');
    this.status = this.querySelector('[data-carousel-status]');
    this.progressBar = this.querySelector('[data-carousel-progress]');
    this.toggle = this.querySelector('[data-carousel-toggle]');
    this.pages = [0];
    this.stops = [0];
    this.page = 0;
    // Cache delle misure azzerata: il theme editor può ricollegare lo stesso elemento dopo averlo spostato
    this.metrics = null;
    this.progressStart = undefined;
    this.atStart = this.atEnd = undefined;
    this.pendingSlide = undefined;
    this.effects = this.effectName = this.stopEffect = this.stopProgress = null;

    this.addEventListener('click', this.onClick, { signal });
    for (const type of ['pointerover', 'focusin']) this.addEventListener(type, this.onIntent, { signal });
    this.track.addEventListener('scroll', this.onScroll, { signal, passive: true });
    this.track.addEventListener('pointerdown', this.onPointerDown, { signal });
    this.track.addEventListener('dragstart', (event) => event.preventDefault(), { signal });
    this.track.addEventListener('touchstart', () => this.stopAutoplay(), { signal, passive: true });
    document.addEventListener('shopify:block:select', this.onBlockSelect, { signal });

    this.setupEffects(signal);
    this.setupAutoplay(signal);

    // Nessuna misura qui: il modulo gira mentre la pagina fa il primo layout, e leggere ora lo forzerebbe (con le
    // scritture appena fatte). La prima notifica del ResizeObserver arriva dopo il layout e prima del primo paint.
    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(this.track);
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.resizeObserver?.disconnect();
    this.visibilityObserver?.disconnect();
    clearTimeout(this.settleTimer);
    clearTimeout(this.autoplayTimer);
    cancelAnimationFrame(this.frame);
    this.stopEffect?.();
    this.stopProgress?.();
    this.stopEffect = this.stopProgress = null;
  }

  /* ------------------------------------------------------------------ Misure */

  /**
   * Posizione di scorrimento a cui si ferma ogni slide. offsetLeft ignora le trasformazioni degli effetti.
   * Chiamata solo dal ResizeObserver, con il layout appena calcolato: tutte le letture vengono prima di ogni scrittura,
   * così nessuna forza un nuovo layout. Le misure restano in cache fino al resize successivo.
   */
  measure() {
    const { track, slides } = this;
    const width = track.clientWidth;
    const scrollWidth = track.scrollWidth;
    const position = track.scrollLeft;
    const boxes = slides.map((slide) => ({ left: slide.offsetLeft, width: slide.offsetWidth }));
    // La riga dei comandi è nascosta mentre la traccia è statica: in quel caso la si misura solo se ricompare
    const wasStatic = this.hasAttribute('data-static');
    const dotsSpace = wasStatic ? null : this.measureDotsSpace();

    const max = scrollWidth - width;
    const isStatic = max <= 1;
    this.metrics = { width, scrollWidth, max };
    this.position = position;

    // Effetti e barra con il layout ancora pulito: il costruttore di ViewTimeline aggiorna il layout del soggetto, e
    // dopo le scritture qui sotto lo forzerebbe
    this.linkEffects();
    this.linkProgress();

    const centered = this.dataset.align === 'center';
    const inset = boxes[0].left;
    this.stops = boxes.map((box) => {
      const stop = centered ? box.left + box.width / 2 - width / 2 : box.left - inset;
      return clamp(stop, 0, Math.max(max, 0));
    });
    this.pages = centered ? [...new Set(this.stops)] : this.groupIntoPages(boxes, inset, width);

    this.toggleAttribute('data-static', isStatic);
    // Riga nascosta (statica) = nessuno spazio, come la misurerebbe il browser. Se ricompare ora, va letta dopo
    // averla mostrata: unico reflow, solo quando un resize fa passare la traccia da ferma a scorrevole.
    this.renderDots(isStatic ? -ROW_GAP : (dotsSpace ?? this.measureDotsSpace()));
    if (this.total) this.total.textContent = String(this.pages.length);
    this.update(true);

    // Blocco selezionato nel theme editor prima della prima misura (la section ricaricata riceve subito block:select)
    if (this.pendingSlide !== undefined) {
      const index = this.pendingSlide;
      this.pendingSlide = undefined;
      this.scrollTrackTo(this.stops[index]);
    }
  }

  /** Ogni pagina inizia dalla prima slide che non entra del tutto nella precedente. */
  groupIntoPages(boxes, inset, width) {
    const { stops } = this;
    const pages = [0];
    let pageEnd = width - inset;
    boxes.forEach((box, index) => {
      if (box.left + box.width <= pageEnd + 1 || stops[index] <= pages.at(-1)) return;
      pages.push(stops[index]);
      pageEnd = stops[index] + width - inset;
    });
    return pages;
  }

  /** Spazio per i pallini accanto ai pulsanti. La riga ha la larghezza del contenuto: non dipende dai pallini. */
  measureDotsSpace() {
    if (!this.dots || !this.dotTemplate) return 0;
    const row = this.dots.parentElement;
    return row.clientWidth - (row.querySelector('[data-carousel-actions]')?.offsetWidth ?? 0) - ROW_GAP;
  }

  renderDots(available) {
    if (!this.dots || !this.dotTemplate) return;
    // Se i pallini non stanno nella riga accanto ai pulsanti, al loro posto il contatore: mai su due righe
    const tooMany = this.pages.length * DOT_SIZE > available;
    this.dots.hidden = tooMany;
    if (this.count) this.count.hidden = !tooMany;
    if (tooMany || this.dots.children.length === this.pages.length) return;

    this.dots.replaceChildren(
      ...this.pages.map((_, index) => {
        const dot = this.dotTemplate.content.firstElementChild.cloneNode(true);
        dot.dataset.carouselDot = String(index);
        dot.setAttribute('aria-label', this.pageLabel(index, dot.getAttribute('aria-label')));
        return dot;
      }),
    );
    this.dotsChanged = true;
  }

  pageLabel(index, template = this.status?.dataset.label ?? '') {
    return template.replace('__page__', index + 1).replace('__total__', this.pages.length);
  }

  /* ------------------------------------------------------------------ Stato */

  nearestPage(position) {
    let nearest = 0;
    this.pages.forEach((stop, index) => {
      if (Math.abs(stop - position) < Math.abs(this.pages[nearest] - position)) nearest = index;
    });
    return nearest;
  }

  /** Solo scritture: posizione letta nell'evento scroll (o in measure), larghezze dalla cache delle misure. */
  update(force = false) {
    if (!this.metrics) return; // Prima misura non ancora arrivata
    const { position } = this;
    const atStart = position <= 1;
    const atEnd = position >= this.metrics.max - 1;
    if (force || atStart !== this.atStart) {
      this.atStart = atStart;
      for (const button of this.previousButtons) button.setAttribute('aria-disabled', String(atStart));
    }
    if (force || atEnd !== this.atEnd) {
      this.atEnd = atEnd;
      for (const button of this.nextButtons) button.setAttribute('aria-disabled', String(atEnd));
    }

    const page = this.nearestPage(position);
    if (page === this.page && !force && !this.dotsChanged) return;
    this.page = page;
    this.dotsChanged = false;
    if (this.current) this.current.textContent = String(page + 1);

    if (!this.dots) return;
    const scaling = this.dots.hasAttribute('data-scaling');
    Array.from(this.dots.children).forEach((dot, index) => {
      const distance = Math.abs(index - page);
      dot.setAttribute('aria-current', String(distance === 0));
      dot.style.setProperty('--dot-scale', scaling ? Math.max(1.35 - distance * 0.3, 0.45) : distance === 0 ? 1.35 : 1);
    });
  }

  onScroll = () => {
    // Letta qui, all'inizio dei passi di rendering: nel requestAnimationFrame altri script (Motion, Lenis) potrebbero
    // aver già scritto stili, e la lettura forzerebbe il layout
    this.position = this.track.scrollLeft;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.update());
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(this.onSettled, SETTLE_DELAY);
  };

  /** Scorrimento finito: lo snap torna attivo solo ora, per non far scattare la traccia durante l'atterraggio. */
  onSettled = () => {
    if (this.dragging) return; // Mouse fermo durante il trascinamento: il gesto non è finito
    this.pendingPage = null;
    this.track.removeAttribute('data-dragging');
    this.scheduleAutoplay();
  };

  /* ------------------------------------------------------------------ Navigazione */

  goToPage(index, { announce = false } = {}) {
    const page = clamp(index, 0, this.pages.length - 1);
    this.pendingPage = page; // Più clic ravvicinati avanzano di più pagine, anche se lo scorrimento è ancora in corso
    this.scrollTrackTo(this.pages[page]);
    if (announce && this.status) this.status.textContent = this.pageLabel(page);
  }

  scrollTrackTo(left) {
    this.track.scrollTo({ left, behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(this.onSettled, SETTLE_DELAY * 4); // Nessun evento scroll se è già lì
  }

  onClick = (event) => {
    if (this.suppressClick) {
      this.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const { target } = event;
    const base = this.pendingPage ?? this.page;
    if (target.closest('[data-carousel-previous]')) {
      this.stopAutoplay();
      this.goToPage(base - 1, { announce: true });
    } else if (target.closest('[data-carousel-next]')) {
      this.stopAutoplay();
      this.goToPage(base + 1, { announce: true });
    } else if (target.closest('[data-carousel-dot]')) {
      this.stopAutoplay();
      this.goToPage(Number(target.closest('[data-carousel-dot]').dataset.carouselDot), { announce: true });
    } else if (target.closest('[data-carousel-toggle]')) {
      this.setAutoplayPaused(!this.autoplayPaused);
    } else {
      this.openQuickView(event);
    }
  };

  onBlockSelect = (event) => {
    const index = this.slides.findIndex((item) => item === event.target || item.contains(event.target));
    if (index === -1) return;
    // Senza misure le posizioni non sono ancora note: ci pensa measure()
    if (!this.metrics) this.pendingSlide = index;
    else this.scrollTrackTo(this.stops[index]);
  };

  /* ------------------------------------------------------------------ Trascinamento col mouse */

  onPointerDown = (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || this.hasAttribute('data-static')) return;
    const drag = new AbortController();
    const options = { signal: drag.signal };
    const startX = event.clientX;
    const startLeft = this.track.scrollLeft;
    let moved = false;
    let lastX = startX;
    let lastTime = event.timeStamp;
    let velocity = 0; // px/ms

    window.addEventListener(
      'pointermove',
      (move) => {
        const distance = move.clientX - startX;
        if (!moved) {
          if (Math.abs(distance) < DRAG_THRESHOLD) return;
          moved = true;
          this.dragging = true;
          this.stopAutoplay();
          this.track.setAttribute('data-dragging', '');
          this.track.setPointerCapture(event.pointerId);
        }
        const elapsed = move.timeStamp - lastTime;
        if (elapsed > 0) velocity = (move.clientX - lastX) / elapsed;
        lastX = move.clientX;
        lastTime = move.timeStamp;
        this.track.scrollLeft = startLeft - distance;
      },
      options,
    );

    const finish = () => {
      drag.abort();
      if (!moved) return;
      this.dragging = false;
      // Il rilascio genera un clic sull'elemento sotto il mouse: non deve aprire il link della card
      this.suppressClick = true;
      setTimeout(() => (this.suppressClick = false), 50);
      this.land(velocity);
    };
    window.addEventListener('pointerup', finish, options);
    window.addEventListener('pointercancel', finish, options);
  };

  /** Dal rilascio: prosegue secondo la velocità e, con lo snap attivo, atterra sulla slide più vicina. */
  land(velocity) {
    const projected = this.track.scrollLeft - velocity * DRAG_PROJECTION;
    if (this.dataset.scroll === 'free') {
      this.scrollTrackTo(projected);
      return;
    }
    const nearest = this.stops.reduce((best, stop) => (Math.abs(stop - projected) < Math.abs(best - projected) ? stop : best));
    this.scrollTrackTo(nearest);
  }

  /* ------------------------------------------------------------------ Scorrimento automatico */

  setupAutoplay(signal) {
    const seconds = Number(this.dataset.autoplay);
    if (!seconds || prefersReducedMotion() || window.Shopify?.designMode) return;

    this.autoplayDelay = seconds * 1000;
    this.autoplayHolds = new Set();
    if (this.toggle) this.toggle.hidden = false;

    const hold = (reason, active) => {
      if (active) this.autoplayHolds.add(reason);
      else this.autoplayHolds.delete(reason);
      this.scheduleAutoplay();
    };
    this.track.addEventListener('pointerenter', (event) => event.pointerType === 'mouse' && hold('hover', true), { signal });
    this.track.addEventListener('pointerleave', () => hold('hover', false), { signal });
    this.track.addEventListener('focusin', () => hold('focus', true), { signal });
    this.track.addEventListener('focusout', () => hold('focus', false), { signal });
    document.addEventListener('visibilitychange', () => hold('hidden', document.hidden), { signal });

    this.visibilityObserver = new IntersectionObserver(([entry]) => hold('offscreen', !entry.isIntersecting), { threshold: 0.3 });
    this.visibilityObserver.observe(this);
  }

  scheduleAutoplay() {
    clearTimeout(this.autoplayTimer);
    if (!this.autoplayDelay || this.autoplayPaused || this.autoplayHolds.size > 0 || this.hasAttribute('data-static')) return;
    this.autoplayTimer = setTimeout(() => {
      this.goToPage(this.page >= this.pages.length - 1 ? 0 : this.page + 1);
    }, this.autoplayDelay);
  }

  setAutoplayPaused(paused) {
    this.autoplayPaused = paused;
    this.toggleAttribute('data-paused', paused);
    if (this.toggle) this.toggle.setAttribute('aria-label', paused ? this.toggle.dataset.labelPlay : this.toggle.dataset.labelPause);
    this.scheduleAutoplay();
  }

  stopAutoplay() {
    if (this.autoplayDelay && !this.autoplayPaused) this.setAutoplayPaused(true);
  }

  /* ------------------------------------------------------------------ Effetti e barra */

  async setupEffects(signal) {
    const effect = prefersReducedMotion() ? null : this.dataset.effect;
    if (!effect && !this.progressBar) return;

    const effects = await import('./carousel-effects.js');
    if (signal.aborted) return;
    this.effects = effects;
    this.effectName = effect;
    // Il collegamento avviene in measure(), con il layout pulito. Osservare di nuovo la traccia chiede una notifica
    // dopo il prossimo layout (prima del paint), anche se la prima misura è già arrivata. Va tolta prima: Chromium
    // ignora observe() su un elemento già osservato con lo stesso box.
    this.resizeObserver.unobserve(this.track);
    this.resizeObserver.observe(this.track);
  }

  /** Effetto delle slide, una volta per collegamento: le timeline seguono da sole i resize. Solo da measure(). */
  linkEffects() {
    if (!this.effects || !this.effectName || this.stopEffect) return;
    this.stopEffect = this.effects.linkEffect(this.effectName, this.track, this.slides);
  }

  /**
   * La barra parte dalla quota già visibile, che cambia con la larghezza: si ricollega solo quando cambia.
   * Solo da measure(), prima delle sue scritture, con le larghezze appena lette.
   */
  linkProgress() {
    if (!this.effects || !this.progressBar || !this.metrics) return;
    const { width, scrollWidth } = this.metrics;
    const start = Math.round((width / scrollWidth) * 100) / 100;
    if (start === this.progressStart) return;
    this.progressStart = start;
    this.stopProgress?.();
    this.stopProgress = this.effects.linkProgress(this.progressBar, this.track, start);
  }

  /* ------------------------------------------------------------------ Anteprima rapida */

  /** <quick-view> della section, quando definito (quick-view.js si carica a parte). */
  get quickView() {
    const element = this.dataset.quickView && document.getElementById(this.dataset.quickView);
    return element && typeof element.show === 'function' ? element : null;
  }

  openQuickView(event) {
    const trigger = event.target.closest('[data-quick-view-url]');
    if (!trigger || !this.quickView) return;
    this.quickView.show({
      url: trigger.dataset.quickViewUrl,
      origin: trigger.closest('product-card')?.querySelector('[data-card-media]'),
      label: trigger.getAttribute('aria-label'),
    });
  }

  onIntent = (event) => {
    const trigger = event.target.closest?.('[data-quick-view-url]');
    if (trigger) this.quickView?.prefetch(trigger.dataset.quickViewUrl);
  };
}

if (!customElements.get('carousel-slider')) {
  customElements.define('carousel-slider', CarouselSlider);
}
