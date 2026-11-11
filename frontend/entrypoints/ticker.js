/**
 * Ticker — custom element <ticker-section> (sections/ticker.liquid): striscia di loghi o testi che scorre all'infinito.
 * Codice originale del tema: dagli esempi "Ticker" di Motion+ si riprendono solo le idee, mai il codice.
 *
 * - Un'unica animazione WAAPI (motion/mini) del binario, lunga un gruppo di elementi, è la sorgente della posizione:
 *   gira sul compositor, il trascinamento e il focus ne impostano il tempo, lo scroll le dà la sua timeline.
 * - Copie del gruppo: quante bastano a coprire la striscia. Niente `inert`, che renderebbe non cliccabili i link
 *   proprio dove passano sotto il mouse: `aria-hidden` e tabindex -1 li tolgono solo a tastiera e lettori di schermo.
 * - La striscia a tutta larghezza si allinea alla pagina con il padding iniziale del binario: le copie prima del
 *   gruppo originale coprono quel tratto, così l'originale si può sempre portare in vista.
 * - Accessibilità: pulsante di pausa (WCAG 2.2.2), con il focus da tastiera la striscia si ferma e mostra l'elemento.
 *   Con prefers-reduced-motion: reduce nessuna animazione né copia: resta la lista che scorre a mano, come senza JS.
 * - Theme editor: selezionando un blocco la striscia si ferma e lo mostra.
 * - Trascinamento col tocco: niente inerzia nativa fantasma dopo uno swipe veloce (frontend/scripts/touch-fling.js).
 */

import { animate } from 'motion/mini';
import { preventTouchFling } from '@/scripts/touch-fling.js';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: no-preference)';
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
const SCROLL_OFFSET = ['start end', 'end start']; // da section che entra dal basso a section uscita in alto
const HOVER_RATES = { slow: 0.25, pause: 0, none: 1 };
const RAMP_DURATION = 300; // ms per cambiare velocità al passaggio del mouse e dopo il trascinamento
const DRAG_THRESHOLD = 6; // px prima che un clic diventi trascinamento
const INERTIA = { time: 0.3, stiffness: 180, damping: 27 };
const CURSOR_SPRING = { stiffness: 600, damping: 45 };

/** Aspetto di un elemento in base alla distanza dal centro della striscia, t da -1 a 1. */
const EFFECTS = {
  focus: (t) => ({ transform: `scale(${1 - 0.3 * Math.abs(t)})`, opacity: 1 - 0.65 * Math.abs(t) }),
  arc: (t, axis) => ({
    transform:
      axis === 'x'
        ? `translateY(${t * t * 32}px) rotate(${t * 10}deg)`
        : `translateX(${t * t * 32}px) rotate(${t * -10}deg)`,
  }),
  tilt: (t, axis) => ({
    transform: `perspective(800px) ${axis === 'x' ? `rotateY(${t * -40}deg)` : `rotateX(${t * 40}deg)`}`,
  }),
};

const mod = (value, size) => ((value % size) + size) % size;

class TickerSection extends HTMLElement {
  connectedCallback() {
    this.viewport = this.querySelector('[data-ticker-viewport]');
    this.track = this.querySelector('[data-ticker-track]');
    this.group = this.querySelector('[data-ticker-group]');
    this.toggle = this.querySelector('[data-ticker-toggle]');
    this.cursor = this.querySelector('[data-ticker-cursor]');
    if (!this.viewport || !this.track || !this.group) return;

    const { axis, speed, direction, drive, hover, effect } = this.dataset;
    this.axis = axis === 'y' ? 'y' : 'x';
    this.speed = Number(speed) || 60;
    this.reverse = direction === 'reverse';
    this.drive = drive || 'auto';
    this.hoverRate = HOVER_RATES[hover] ?? 1;
    this.effect = EFFECTS[effect];

    this.userPaused = false;
    this.hovered = false;
    this.focused = false;
    this.selected = false;
    this.dragging = false;
    this.inView = true;
    this.rate = 1;

    this.motionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    this.abort = new AbortController();
    const { signal } = this.abort;
    this.motionQuery.addEventListener('change', () => this.sync(), { signal });
    this.toggle?.addEventListener('click', () => {
      this.userPaused = !this.userPaused;
      this.toggleAttribute('data-paused', this.userPaused);
      this.toggle.setAttribute('aria-label', this.userPaused ? this.toggle.dataset.labelPlay : this.toggle.dataset.labelPause);
      this.update();
    }, { signal });
    document.addEventListener('shopify:block:select', (event) => this.onBlockSelect(event), { signal });
    document.addEventListener('shopify:block:deselect', (event) => {
      if (!this.contains(event.target)) return;
      this.selected = false;
      this.update();
    }, { signal });

    this.sync();
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.stop();
  }

  sync() {
    if (this.motionQuery.matches) this.start();
    else this.stop();
  }

  // ---------- Avvio e arresto ----------

  start() {
    if (this.running) return;
    this.running = true;
    this.runAbort = new AbortController();
    this.viewport.removeAttribute('tabindex');
    this.viewport.scrollTo(0, 0);
    this.toggleAttribute('data-running', true);

    const { signal } = this.runAbort;
    this.viewport.addEventListener('pointerenter', (event) => this.onHover(event, true), { signal });
    this.viewport.addEventListener('pointerleave', (event) => this.onHover(event, false), { signal });
    this.viewport.addEventListener('focusin', (event) => this.onFocusIn(event), { signal });
    this.viewport.addEventListener('focusout', (event) => {
      if (this.viewport.contains(event.relatedTarget)) return;
      this.focused = false;
      this.update();
    }, { signal });

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.viewport);
    this.resizeObserver.observe(this.group);
    this.visibilityObserver = new IntersectionObserver(([entry]) => {
      this.inView = entry.isIntersecting;
      this.update();
    });
    this.visibilityObserver.observe(this.viewport);

    this.layout();
    if (this.drive === 'drag' || this.cursor) this.setupPointerInteractions();
  }

  stop() {
    if (!this.running) {
      this.syncStaticFocus();
      return;
    }
    this.running = false;
    this.runAbort.abort();
    this.resizeObserver.disconnect();
    this.visibilityObserver.disconnect();
    this.stopClock();
    this.dragValue?.stop();
    cancelAnimationFrame(this.rampFrame);
    cancelAnimationFrame(this.effectFrame);
    this.effectFrame = null;
    this.heldClock = false;
    this.size = 0;
    this.clearEffect();
    this.track.querySelectorAll('[data-ticker-clone]').forEach((clone) => clone.remove());
    for (const name of ['data-running', 'data-dragging', 'data-cursor-active']) this.removeAttribute(name);
    this.syncStaticFocus();
  }

  /** Senza animazione la lista scorre a mano: da tastiera serve poterla raggiungere se non contiene link. */
  syncStaticFocus() {
    const { viewport } = this;
    const scrollable = viewport.scrollWidth > viewport.clientWidth + 1 || viewport.scrollHeight > viewport.clientHeight + 1;
    if (scrollable && !viewport.querySelector('a[href]')) viewport.tabIndex = 0;
    else viewport.removeAttribute('tabindex');
  }

  // ---------- Misure e copie ----------

  layout() {
    if (!this.running) return;
    const rect = this.group.getBoundingClientRect();
    const box = this.viewport.getBoundingClientRect();
    const size = this.axis === 'x' ? rect.width : rect.height;
    const extent = this.axis === 'x' ? box.width : box.height;
    const pad = this.axis === 'x' ? parseFloat(getComputedStyle(this.track).paddingInlineStart) || 0 : 0;
    if (!size || (size === this.size && extent === this.extent && pad === this.pad)) return;

    const fraction = this.getFraction();
    this.stopClock();
    this.clearEffect();

    this.size = size;
    this.extent = extent;
    this.pad = pad;
    this.rtl = this.axis === 'x' && getComputedStyle(this).direction === 'rtl';
    this.sign = this.rtl ? 1 : -1;

    const before = pad > 0 ? Math.ceil(pad / size) : 0;
    const after = Math.max(1, Math.ceil((extent - pad) / size));
    this.setClones(before, after);
    this.origin = before * size; // posizione con il gruppo originale all'inizio della striscia

    if (this.effect) this.measureItems();
    this.startClock(fraction);
    this.update();
  }

  setClones(before, after) {
    if (before === this.clonesBefore && after === this.clonesAfter && this.track.querySelector('[data-ticker-clone]')) return;
    this.track.querySelectorAll('[data-ticker-clone]').forEach((clone) => clone.remove());
    for (let i = 0; i < before; i += 1) this.group.before(this.makeClone());
    let last = this.group;
    for (let i = 0; i < after; i += 1) {
      const clone = this.makeClone();
      last.after(clone);
      last = clone;
    }
    this.clonesBefore = before;
    this.clonesAfter = after;
  }

  makeClone() {
    const clone = this.group.cloneNode(true);
    clone.removeAttribute('data-ticker-group');
    clone.setAttribute('data-ticker-clone', '');
    clone.setAttribute('aria-hidden', 'true');
    clone.querySelectorAll('a').forEach((link) => link.setAttribute('tabindex', '-1'));
    clone.querySelectorAll('[data-shopify-editor-block]').forEach((item) => item.removeAttribute('data-shopify-editor-block'));
    // Stesso URL dell'originale: nessuna richiesta in più, e l'immagine è già pronta quando entra in vista
    clone.querySelectorAll('img').forEach((image) => (image.loading = 'eager'));
    return clone;
  }

  // ---------- Posizione ----------

  translate(position) {
    const value = this.sign * position;
    return this.axis === 'x' ? `translate3d(${value}px, 0, 0)` : `translate3d(0, ${value}px, 0)`;
  }

  /** Animazione del binario lungo un gruppo. `repeat` a parte, è la stessa in tutte le modalità. */
  createClock(repeat, duration) {
    const from = this.translate(this.origin);
    const to = this.translate(this.origin + this.size);
    this.controls = animate(
      this.track,
      { transform: this.reverse ? [to, from] : [from, to] },
      { duration, ease: 'linear', repeat },
    );
    this.waapi = this.track.getAnimations().at(-1);
    this.duration = duration;
  }

  startClock(fraction = 0) {
    if (this.drive === 'scroll' && !this.isHeld) {
      this.attachScroll(fraction);
      return;
    }
    this.createClock(Infinity, this.size / this.speed);
    this.controls.time = fraction * this.duration;
    this.rate = 1;
    this.rampTarget = null;
  }

  stopClock() {
    this.stopScroll?.();
    this.stopScroll = null;
    this.scrollToken = null;
    this.controls?.cancel();
    this.controls = null;
    this.waapi = null;
  }

  /**
   * Guidato dallo scroll: con la ViewTimeline nativa l'animazione ripete il giro quante volte serve, fuori dal main
   * thread. Dove manca, Motion aggiornerebbe un solo giro: la posizione si calcola dal progresso dello scroll.
   */
  async attachScroll(fraction) {
    const token = (this.scrollToken = {});
    const range = window.innerHeight + this.offsetHeight;
    const loops = Math.max(1, ((this.speed / 100) * range) / this.size);

    if (!window.ViewTimeline) {
      this.createClock(Infinity, 1);
      this.controls.pause();
      this.controls.time = fraction;
    }
    const { scroll } = await import('motion');
    if (token !== this.scrollToken || !this.running) return;

    const options = { target: this, offset: SCROLL_OFFSET };
    if (window.ViewTimeline) {
      this.createClock(loops - 1, 1);
      this.stopScroll = scroll(this.controls, options);
      if (this.effect) this.update();
    } else {
      this.stopScroll = scroll((progress) => this.setFraction(mod(progress * loops, 1)), options);
    }
  }

  /** Progresso nel giro corrente, da 0 a 1. Vale con qualsiasi timeline, a differenza del tempo. */
  getFraction() {
    return this.waapi?.effect?.getComputedTiming().progress ?? 0;
  }

  setFraction(fraction) {
    if (this.controls) this.controls.time = fraction * this.duration;
  }

  getPosition() {
    const fraction = this.getFraction();
    return this.origin + (this.reverse ? 1 - fraction : fraction) * this.size;
  }

  setPosition(position) {
    const fraction = mod(position - this.origin, this.size) / this.size;
    this.setFraction(this.reverse ? mod(1 - fraction, 1) : fraction);
    if (this.effect) this.applyEffect();
  }

  // ---------- Stato ----------

  /** Con il focus da tastiera o un blocco selezionato la striscia resta ferma, anche se guidata dallo scroll. */
  get isHeld() {
    return this.focused || this.selected;
  }

  update() {
    if (!this.running || !this.controls) return;

    if (this.drive === 'scroll') {
      if (this.isHeld !== Boolean(this.heldClock)) {
        this.heldClock = this.isHeld;
        const fraction = this.getFraction();
        this.stopClock();
        this.startClock(fraction);
        if (this.isHeld) this.controls.pause();
      }
    } else {
      const moving = this.inView && !this.userPaused && !this.isHeld && !this.dragging;
      if (moving) this.controls.play();
      else this.controls.pause();
      this.rampTo(this.hovered ? this.hoverRate : 1);
    }

    this.runEffect();
  }

  rampTo(target) {
    if (target === this.rampTarget) return;
    this.rampTarget = target;
    cancelAnimationFrame(this.rampFrame);
    const from = this.rate;
    let start = null;
    const step = (now) => {
      if (!this.controls) return;
      start ??= now;
      const progress = Math.min((now - start) / RAMP_DURATION, 1);
      this.rate = from + (target - from) * (1 - (1 - progress) ** 3);
      this.controls.speed = this.rate;
      if (progress < 1) this.rampFrame = requestAnimationFrame(step);
    };
    this.rampFrame = requestAnimationFrame(step);
  }

  onHover(event, entering) {
    if (event.pointerType !== 'mouse') return;
    this.hovered = entering;
    this.update();
  }

  onFocusIn(event) {
    if (!event.target.matches(':focus-visible')) return;
    this.focused = true;
    this.update();
    this.reveal(event.target);
  }

  onBlockSelect(event) {
    if (!this.contains(event.target)) return;
    this.selected = true;
    this.update();
    this.reveal(event.target);
  }

  /** Porta in vista un elemento del gruppo originale, l'unico focusabile. */
  reveal(element) {
    if (!this.running || !this.controls || !this.group.contains(element)) return;
    const item = element.closest('li') ?? element;
    const rect = item.getBoundingClientRect();
    const box = this.viewport.getBoundingClientRect();
    const inView = this.axis === 'x'
      ? rect.left >= box.left && rect.right <= box.right
      : rect.top >= box.top && rect.bottom <= box.bottom;
    if (inView) return;

    const group = this.group.getBoundingClientRect();
    let offset = rect.top - group.top;
    if (this.axis === 'x') offset = this.rtl ? group.right - rect.right : rect.left - group.left;
    this.setPosition(this.origin + offset);
  }

  // ---------- Effetto in base alla posizione ----------

  measureItems() {
    const box = this.viewport.getBoundingClientRect();
    this.items = Array.from(this.track.querySelectorAll('li'), (element) => {
      const rect = element.getBoundingClientRect();
      const center = this.axis === 'x' ? rect.left + rect.width / 2 - box.left : rect.top + rect.height / 2 - box.top;
      return { element, center };
    });
  }

  runEffect() {
    if (!this.effect || this.effectFrame || !this.inView) return;
    const step = () => {
      if (!this.running || !this.inView) {
        this.effectFrame = null;
        return;
      }
      this.applyEffect();
      this.effectFrame = requestAnimationFrame(step);
    };
    this.effectFrame = requestAnimationFrame(step);
  }

  applyEffect() {
    if (!this.items || !this.controls) return;
    const fraction = this.getFraction();
    if (fraction === this.lastFraction) return;
    this.lastFraction = fraction;

    const half = this.extent / 2;
    const offset = this.sign * this.getPosition();
    for (const { element, center } of this.items) {
      const distance = center + offset - half;
      // Fuori dalla striscia niente scritture inutili
      if (Math.abs(distance) > half + this.size) continue;
      const { transform, opacity } = this.effect(Math.max(-1, Math.min(1, distance / half)), this.axis);
      element.style.transform = transform;
      if (opacity !== undefined) element.style.opacity = opacity;
    }
  }

  clearEffect() {
    this.lastFraction = null;
    this.track.querySelectorAll('li').forEach((element) => {
      element.style.removeProperty('transform');
      element.style.removeProperty('opacity');
    });
    this.items = null;
  }

  // ---------- Trascinamento e cursore ----------

  async setupPointerInteractions() {
    const { signal } = this.runAbort;
    const { SpringValue } = await import('@/scripts/spring-value.js');
    if (signal.aborted) return;
    if (this.drive === 'drag') this.setupDrag(SpringValue, signal);
    if (this.cursor) this.setupCursor(SpringValue, signal);
  }

  setupDrag(SpringValue, signal) {
    const { viewport } = this;
    this.dragValue = new SpringValue(0, () => this.setPosition(this.dragValue.get()));
    let press = null;
    let moved = false;

    const finish = () => {
      if (press) return;
      this.dragging = false;
      this.removeAttribute('data-dragging');
      // Riparte da fermo, senza scatti
      this.rate = 0;
      this.rampTarget = null;
      if (this.controls) this.controls.speed = 0;
      this.update();
    };

    viewport.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.dragValue.stop();
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, position: this.getPosition() };
      moved = false;
    }, { signal });

    viewport.addEventListener('pointermove', (event) => {
      if (!press || event.pointerId !== press.id) return;
      const delta = this.axis === 'x' ? event.clientX - press.x : event.clientY - press.y;
      if (!moved) {
        if (Math.abs(delta) < DRAG_THRESHOLD) return;
        moved = true;
        this.dragging = true;
        this.toggleAttribute('data-dragging', true);
        viewport.setPointerCapture(event.pointerId);
        this.update();
      }
      this.dragValue.set(press.position + delta * this.sign);
    }, { signal });

    const release = (event) => {
      if (!press || event.pointerId !== press.id) return;
      press = null;
      if (!this.dragging) return;
      const value = this.dragValue.get();
      const target = moved ? value + this.dragValue.getVelocity() * INERTIA.time : value;
      this.dragValue
        .animateTo(target, { stiffness: INERTIA.stiffness, damping: INERTIA.damping })
        .then(finish);
    };
    viewport.addEventListener('pointerup', release, { signal });
    viewport.addEventListener('pointercancel', release, { signal });

    // Un trascinamento non deve aprire il link su cui finisce, né iniziare il drag nativo di link e immagini
    viewport.addEventListener('click', (event) => {
      if (!moved) return;
      moved = false;
      event.preventDefault();
      event.stopPropagation();
    }, { signal, capture: true });
    viewport.addEventListener('dragstart', (event) => event.preventDefault(), { signal });
    // Chrome Android: senza, il primo tocco su un link dopo uno swipe veloce non diventa un clic
    preventTouchFling(viewport, () => press !== null && moved, signal);
  }

  setupCursor(SpringValue, signal) {
    if (!window.matchMedia(FINE_POINTER_QUERY).matches) return;
    const { cursor, viewport } = this;
    const render = () => {
      cursor.style.transform = `translate3d(${x.get()}px, ${y.get()}px, 0)`;
    };
    const x = new SpringValue(0, render);
    const y = new SpringValue(0, render);
    signal.addEventListener('abort', () => {
      x.stop();
      y.stop();
      cursor.removeAttribute('data-visible');
    });

    viewport.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      x.jump(event.clientX);
      y.jump(event.clientY);
      cursor.toggleAttribute('data-visible', true);
      this.toggleAttribute('data-cursor-active', true);
    }, { signal });
    viewport.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return;
      x.animateTo(event.clientX, CURSOR_SPRING);
      y.animateTo(event.clientY, CURSOR_SPRING);
      cursor.toggleAttribute('data-link', Boolean(event.target.closest?.('a')));
    }, { signal });
    viewport.addEventListener('pointerleave', () => {
      cursor.removeAttribute('data-visible');
      cursor.removeAttribute('data-pressed');
      this.removeAttribute('data-cursor-active');
    }, { signal });
    viewport.addEventListener('pointerdown', () => cursor.toggleAttribute('data-pressed', true), { signal });
    viewport.addEventListener('pointerup', () => cursor.removeAttribute('data-pressed'), { signal });
  }
}

if (!customElements.get('ticker-section')) {
  customElements.define('ticker-section', TickerSection);
}
