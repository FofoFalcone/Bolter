/**
 * Lightbox delle immagini del prodotto (markup in snippets/product-lightbox.liquid, aperto da <product-media>).
 *
 * <dialog> nativo: focus intrappolato, Esc e pagina inerte sono del browser; il blocco dello scroll è data-scroll-lock.
 * Tra un'immagine e l'altra si scorre in modo nativo (scroll-snap); frecce e tasti per chi non può o non vuole trascinare.
 *
 * Zoom:
 * - clic o tocco sull'immagine e pulsante: ingrandisce e riduce;
 * - due dita e pinch del trackpad (ctrl + rotella): zoom continuo attorno al punto tra le dita o sotto il puntatore;
 * - trascinamento, rotella e frecce: spostano l'immagine ingrandita; + e - cambiano l'ingrandimento.
 * Tutto con `scale` e `translate` sull'immagine (compositor). Il pinch usa touchmove, l'unico evento che permette di
 * fermare il browser quando le due dita arrivano sopra un'area che scorre; se lo scorrimento è già partito non è più
 * annullabile e si lascia finire.
 *
 * L'immagine vola dalla galleria al suo posto e ritorno. Nel frattempo sotto ha come sfondo la versione già scaricata
 * dalla galleria, così non si vede un riquadro vuoto mentre arriva quella grande.
 */

import { animate } from 'motion/mini';
import { prefersReducedMotion } from './cart-api.js';
import { watchCenteredItem } from './centered-item.js';

const FLIGHT = { duration: 0.45, ease: [0.22, 1, 0.36, 1] };
const FADE = { duration: 0.25, ease: 'easeOut' };
const ZOOM_TRANSITION = 'translate 250ms var(--ease-theme), scale 250ms var(--ease-theme)';
const TOGGLE_SCALE = 2.5; // Ingrandimento di un clic, se l'immagine è abbastanza grande
const MIN_MAX_SCALE = 2; // Anche un originale piccolo si può ingrandire un po'
const MAX_MAX_SCALE = 4;
const SCALE_STEP = 1.5; // Tasti + e -
const WHEEL_ZOOM_SPEED = 0.01;
const PAN_STEP = 80; // px: tasti freccia con l'immagine ingrandita
const DRAG_THRESHOLD = 5; // px: sotto è un clic
const MIN_PINCH_SCALE = 1.05; // Sotto, alla fine del pinch l'immagine torna a riposo

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const centerOf = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const midpoint = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
const isOnScreen = (rect) =>
  rect.width > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;

/** translate + scale che portano il rettangolo `base` su `rect`. */
function flip(base, rect) {
  const from = centerOf(base);
  const to = centerOf(rect);
  return { translate: `${to.x - from.x}px ${to.y - from.y}px`, scale: rect.width / base.width };
}

export class ProductLightbox {
  /** @param {HTMLElement} host <product-media>: contiene il template del dialog e i pulsanti [data-media-open] */
  constructor(host) {
    this.host = host;
    host.append(host.querySelector('template[data-product-lightbox]').content.cloneNode(true));

    this.dialog = host.querySelector('dialog');
    this.backdrop = this.dialog.querySelector('[data-lightbox-backdrop]');
    this.track = this.dialog.querySelector('[data-lightbox-track]');
    this.controls = Array.from(this.dialog.querySelectorAll('[data-lightbox-controls]'));
    this.zoomButton = this.dialog.querySelector('[data-lightbox-zoom]');
    this.previousButton = this.dialog.querySelector('[data-lightbox-previous]');
    this.nextButton = this.dialog.querySelector('[data-lightbox-next]');
    this.indexLabel = this.dialog.querySelector('[data-lightbox-index]');
    this.slides = Array.from(this.track.children);
    this.images = this.slides.map((slide) => slide.querySelector('img'));

    this.index = 0;
    this.zoom = { scale: 1, x: 0, y: 0 };
    this.width = window.innerWidth;

    this.abort = new AbortController();
    const { signal } = this.abort;
    this.dialog.addEventListener('click', this.onClick, { signal });
    this.dialog.addEventListener('keydown', this.onKeydown, { signal });
    // Esc: chiusura animata invece di quella immediata del browser
    this.dialog.addEventListener('cancel', this.onCancel, { signal });
    this.dialog.addEventListener('close', this.onClosed, { signal });
    this.track.addEventListener('pointerdown', this.onPointerDown, { signal });
    this.track.addEventListener('pointermove', this.onPointerMove, { signal });
    this.track.addEventListener('pointerup', this.onPointerEnd, { signal });
    this.track.addEventListener('pointercancel', this.onPointerEnd, { signal });
    this.track.addEventListener('touchstart', this.onTouchStart, { signal, passive: true });
    this.track.addEventListener('touchmove', this.onTouchMove, { signal, passive: false });
    this.track.addEventListener('touchend', this.onTouchEnd, { signal, passive: true });
    this.track.addEventListener('touchcancel', this.onTouchEnd, { signal, passive: true });
    this.track.addEventListener('wheel', this.onWheel, { signal, passive: false });
    window.addEventListener('resize', this.onResize, { signal });

    this.slideObserver = watchCenteredItem(this.track, (index) => this.setIndex(index));
  }

  destroy() {
    this.abort.abort();
    this.slideObserver.disconnect();
    if (this.dialog.open) this.dialog.close();
    this.showOrigin();
    this.dialog.remove();
  }

  /* ---------------------------------------------------------- Apertura e chiusura */

  get image() {
    return this.images[this.index];
  }

  /** Immagine della galleria che corrisponde a quella del lightbox. */
  originOf(index) {
    return this.triggerOf(index)?.parentElement.querySelector('img') ?? null;
  }

  triggerOf(index) {
    return this.host.querySelector(`[data-media-open="${index}"]`);
  }

  open(index) {
    if (this.dialog.open) return;
    const origin = this.originOf(index);
    const from = origin?.getBoundingClientRect();

    this.dialog.showModal();
    this.track.scrollTo({ left: this.slides[index].offsetLeft, behavior: 'instant' });
    this.setIndex(index);
    this.prepareImage(origin);

    if (prefersReducedMotion()) return;
    animate(this.backdrop, { opacity: [0, 1] }, FADE);
    this.controls.forEach((element) => animate(element, { opacity: [0, 1] }, { ...FADE, delay: 0.15 }));

    const image = this.image;
    if (!from || !isOnScreen(from)) {
      animate(image, { opacity: [0, 1], scale: [0.96, 1] }, FADE);
      return;
    }
    this.hideOrigin(origin);
    const base = image.getBoundingClientRect();
    const start = flip(base, from);
    animate(
      image,
      {
        translate: [start.translate, '0px 0px'],
        scale: [start.scale, 1],
        borderRadius: [`${this.radiusOf(origin) / start.scale}px`, '0px'],
      },
      FLIGHT,
    );
  }

  /** Chiusura animata; la promise si risolve a dialog chiuso. */
  close() {
    if (!this.dialog.open) return Promise.resolve();
    this.closing ??= this.animateClose()
      .catch(() => {})
      .then(() => this.dialog.close());
    return this.closing;
  }

  async animateClose() {
    // Il carosello mobile torna sull'immagine che si stava guardando, anche senza animazioni
    const origin = this.originOf(this.index);
    this.alignCarousel(origin);
    if (prefersReducedMotion()) return;
    // Quella da cui si era partiti torna visibile: durante la chiusura la pagina si rivede
    this.showOrigin();

    const image = this.image;
    const current = image.getBoundingClientRect();
    image.getAnimations().forEach((animation) => animation.cancel());
    this.zoom = { scale: 1, x: 0, y: 0 };
    this.applyZoom();
    const base = image.getBoundingClientRect();

    const animations = [
      animate(this.backdrop, { opacity: 0 }, FADE),
      ...this.controls.map((element) => animate(element, { opacity: 0 }, { ...FADE, duration: 0.12 })),
    ];
    const to = origin?.getBoundingClientRect();
    const start = flip(base, current);

    if (to && isOnScreen(to)) {
      this.hideOrigin(origin);
      const end = flip(base, to);
      animations.push(
        animate(
          image,
          {
            translate: [start.translate, end.translate],
            scale: [start.scale, end.scale],
            borderRadius: ['0px', `${this.radiusOf(origin) / end.scale}px`],
          },
          FLIGHT,
        ),
      );
    } else {
      animations.push(animate(image, { opacity: 0, translate: [start.translate, start.translate], scale: [start.scale, start.scale * 0.96] }, FADE));
    }
    await Promise.all(animations);
  }

  /** Dialog chiuso (anche dal browser senza animazione): stato iniziale e focus sull'immagine vista per ultima. */
  onClosed = () => {
    this.closing = null;
    this.zoom = { scale: 1, x: 0, y: 0 };
    this.dialog.removeAttribute('data-zoomed');
    this.zoomButton.setAttribute('aria-pressed', 'false');
    for (const element of [this.backdrop, ...this.controls, ...this.images]) {
      element.getAnimations().forEach((animation) => animation.cancel());
      element.style.opacity = '';
    }
    for (const image of this.images) {
      for (const property of ['translate', 'scale', 'transition', 'borderRadius', 'backgroundImage', 'backgroundSize']) {
        image.style[property] = '';
      }
    }
    this.showOrigin();
    this.triggerOf(this.index)?.focus({ preventScroll: true });
  };

  /** Finché non arriva l'immagine grande si vede quella della galleria, già scaricata. */
  prepareImage(origin) {
    const image = this.image;
    image.loading = 'eager';
    if (!origin || image.complete) return;
    image.style.backgroundImage = `url("${origin.currentSrc || origin.src}")`;
    image.style.backgroundSize = '100% 100%';
    image.addEventListener(
      'load',
      () => {
        image.style.backgroundImage = '';
        image.style.backgroundSize = '';
      },
      { once: true, signal: this.abort.signal },
    );
  }

  /** L'immagine in volo "si stacca" dalla galleria. */
  hideOrigin(origin) {
    this.showOrigin();
    origin.style.visibility = 'hidden';
    this.hiddenOrigin = origin;
  }

  showOrigin() {
    if (this.hiddenOrigin) this.hiddenOrigin.style.visibility = '';
    this.hiddenOrigin = null;
  }

  radiusOf(origin) {
    return parseFloat(getComputedStyle(origin.parentElement).borderTopLeftRadius) || 0;
  }

  /** Se la galleria è un carosello si porta al centro l'elemento. Con la griglia, da 990px, non scorre e non cambia nulla. */
  alignCarousel(origin) {
    const item = origin?.closest('li');
    const list = item?.parentElement;
    if (!list) return;
    const offset = centerOf(item.getBoundingClientRect()).x - centerOf(list.getBoundingClientRect()).x;
    list.scrollBy({ left: offset, behavior: 'instant' });
  }

  /* -------------------------------------------------------------------- Navigazione */

  setIndex(index) {
    if (index !== this.index) this.resetZoom(this.image);
    this.index = index;
    if (this.indexLabel) this.indexLabel.textContent = String(index + 1);
    this.previousButton?.setAttribute('aria-disabled', String(index === 0));
    this.nextButton?.setAttribute('aria-disabled', String(index === this.slides.length - 1));
    // Le vicine sono pronte prima di arrivarci
    for (const neighbour of [this.images[index - 1], this.images[index + 1]]) {
      if (neighbour) neighbour.loading = 'eager';
    }
  }

  /** aria-disabled e non disabled: il pulsante arrivato al limite non perde il focus. */
  go(direction) {
    const index = this.index + direction;
    if (index < 0 || index >= this.slides.length) return;
    this.resetZoom();
    this.track.scrollTo({ left: this.slides[index].offsetLeft, behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
    this.setIndex(index);
  }

  /* --------------------------------------------------------------------------- Zoom */

  maxScale(image = this.image) {
    return clamp(Number(image.getAttribute('width')) / image.offsetWidth, MIN_MAX_SCALE, MAX_MAX_SCALE);
  }

  /** Centro dell'area dell'immagine: fisso, perché l'immagine a riposo è centrata nella sua slide. */
  stageCenter() {
    return centerOf(this.image.parentElement.getBoundingClientRect());
  }

  /** Lo spostamento si ferma quando il bordo dell'immagine arriva a quello dello schermo. */
  bounded(scale, x, y) {
    const image = this.image;
    const slide = image.parentElement;
    const limitX = Math.max(0, (image.offsetWidth * scale - slide.clientWidth) / 2);
    const limitY = Math.max(0, (image.offsetHeight * scale - slide.clientHeight) / 2);
    return { scale, x: clamp(x, -limitX, limitX), y: clamp(y, -limitY, limitY) };
  }

  /** Zoom che tiene fermo sullo schermo il punto `point`. */
  zoomTo(scale, point = this.stageCenter(), animated = false) {
    const next = clamp(scale, 1, this.maxScale());
    const center = this.stageCenter();
    const ratio = next / this.zoom.scale;
    this.zoom = this.bounded(
      next,
      point.x - center.x - (point.x - center.x - this.zoom.x) * ratio,
      point.y - center.y - (point.y - center.y - this.zoom.y) * ratio,
    );
    if (next > 1) this.sharpen();
    this.applyZoom(animated);
  }

  panBy(dx, dy) {
    this.zoom = this.bounded(this.zoom.scale, this.zoom.x + dx, this.zoom.y + dy);
    this.applyZoom();
  }

  resetZoom(image = this.image, animated = false) {
    if (this.zoom.scale === 1) return;
    this.zoom = { scale: 1, x: 0, y: 0 };
    this.applyZoom(animated, image);
  }

  toggleZoom(point) {
    if (this.zoom.scale > 1) this.resetZoom(this.image, true);
    else this.zoomTo(Math.min(TOGGLE_SCALE, this.maxScale()), point, true);
  }

  applyZoom(animated = false, image = this.image) {
    const { scale, x, y } = this.zoom;
    image.style.transition = animated && !prefersReducedMotion() ? ZOOM_TRANSITION : 'none';
    image.style.translate = `${x}px ${y}px`;
    image.style.scale = String(scale);
    this.dialog.toggleAttribute('data-zoomed', scale > 1);
    this.zoomButton.setAttribute('aria-pressed', String(scale > 1));
  }

  /** Il browser sceglie dallo stesso srcset la versione adatta all'ingrandimento massimo; quella vecchia resta finché non arriva. */
  sharpen() {
    const image = this.image;
    if (image.dataset.sharp !== undefined) return;
    image.dataset.sharp = '';
    image.sizes = `${Math.ceil(image.offsetWidth * this.maxScale())}px`;
  }

  /* ------------------------------------------------------------------------- Eventi */

  onCancel = (event) => {
    event.preventDefault();
    this.close();
  };

  onClick = (event) => {
    const button = event.target.closest('button');
    if (button) {
      if (button === this.zoomButton) this.toggleZoom();
      else if (button.matches('[data-lightbox-close]')) this.close();
      else if (button === this.previousButton) this.go(-1);
      else if (button === this.nextButton) this.go(1);
      return;
    }
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    if (event.target === this.image) this.toggleZoom({ x: event.clientX, y: event.clientY });
    else if (this.zoom.scale > 1) this.resetZoom(this.image, true);
    else if (this.track.contains(event.target)) this.close();
  };

  onKeydown = (event) => {
    const zoomed = this.zoom.scale > 1;
    switch (event.key) {
      case 'ArrowLeft':
        if (zoomed) this.panBy(PAN_STEP, 0);
        else this.go(-1);
        break;
      case 'ArrowRight':
        if (zoomed) this.panBy(-PAN_STEP, 0);
        else this.go(1);
        break;
      case 'ArrowUp':
        if (zoomed) this.panBy(0, PAN_STEP);
        break;
      case 'ArrowDown':
        if (zoomed) this.panBy(0, -PAN_STEP);
        break;
      case '+':
      case '=':
        this.zoomTo(this.zoom.scale * SCALE_STEP, undefined, true);
        break;
      case '-':
        this.zoomTo(this.zoom.scale / SCALE_STEP, undefined, true);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  onPointerDown = (event) => {
    this.dragged = false;
    if (this.zoom.scale <= 1 || !event.isPrimary || event.target !== this.image) return;
    this.drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: this.zoom.x, y: this.zoom.y };
    this.image.setPointerCapture(event.pointerId);
  };

  onPointerMove = (event) => {
    const { drag } = this;
    if (!drag || this.pinch || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!this.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    this.dragged = true;
    this.zoom = this.bounded(this.zoom.scale, drag.x + dx, drag.y + dy);
    this.applyZoom();
  };

  onPointerEnd = () => {
    this.drag = null;
  };

  onTouchStart = (event) => {
    if (event.touches.length !== 2) return;
    const [a, b] = event.touches;
    this.drag = null;
    this.pinch = { distance: distance(a, b), mid: midpoint(a, b), scale: this.zoom.scale, x: this.zoom.x, y: this.zoom.y };
  };

  onTouchMove = (event) => {
    const { pinch } = this;
    if (!pinch || event.touches.length !== 2 || !event.cancelable) return;
    event.preventDefault();
    const [a, b] = event.touches;
    const scale = clamp((pinch.scale * distance(a, b)) / pinch.distance, 1, this.maxScale());
    const mid = midpoint(a, b);
    const center = this.stageCenter();
    const ratio = scale / pinch.scale;
    this.zoom = this.bounded(
      scale,
      mid.x - center.x - (pinch.mid.x - center.x - pinch.x) * ratio,
      mid.y - center.y - (pinch.mid.y - center.y - pinch.y) * ratio,
    );
    if (scale > 1) this.sharpen();
    this.applyZoom();
  };

  onTouchEnd = (event) => {
    if (!this.pinch || event.touches.length >= 2) return;
    this.pinch = null;
    if (this.zoom.scale < MIN_PINCH_SCALE) this.resetZoom(this.image, true);
  };

  onWheel = (event) => {
    if (event.ctrlKey) {
      event.preventDefault();
      this.zoomTo(this.zoom.scale * Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED), { x: event.clientX, y: event.clientY });
    } else if (this.zoom.scale > 1) {
      event.preventDefault();
      this.panBy(-event.deltaX, -event.deltaY);
    }
  };

  /** La finestra cambia larghezza (rotazione): le misure dello zoom non valgono più, e la slide va riallineata. */
  onResize = () => {
    if (window.innerWidth === this.width) return;
    this.width = window.innerWidth;
    if (!this.dialog.open) return;
    this.resetZoom();
    this.track.scrollTo({ left: this.slides[this.index].offsetLeft, behavior: 'instant' });
  };
}
