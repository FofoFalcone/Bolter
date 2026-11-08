/**
 * Galleria orizzontale guidata dallo scroll — custom element <scroll-gallery>.
 *
 * Adattato dagli esempi Motion "Scroll pinning" (js-scroll-pinning) e
 * "Scroll horizontal" (react-scroll-horizontal):
 * - l'elemento è alto quanto la distanza da percorrere (calcolata in CSS) e contiene
 *   un'area sticky; traslazione orizzontale della traccia e barra di avanzamento sono animazioni
 *   `animate()` di motion/mini collegate allo scroll con `scroll(animation)`: con le scroll timeline
 *   native girano fuori dal main thread. Ricreate solo quando cambia la distanza (resize);
 * - attivo solo con PINNED_QUERY (stessa media query del CSS): altrimenti la traccia è
 *   un normale carosello scorrevole e questo script non fa nulla;
 * - focus da tastiera e selezione del blocco nel theme editor scorrono la pagina
 *   fino alla card corrispondente.
 *
 * Letture di layout: la distanza (offsetLeft delle card) si misura solo nel callback del ResizeObserver, che
 * arriva subito dopo il layout e prima del paint, anche la prima volta (subito dopo observe()). L'aggancio allo
 * scroll si fa all'inizio del fotogramma dopo (scheduleUpdate), con il layout ancora valido: scroll() di Motion
 * misura in modo sincrono section e viewport (clientHeight), e in connectedCallback, durante il caricamento,
 * forzava il layout della pagina. Non nel callback stesso: con l'offset 'start start'/'end end' scroll()
 * registra un ResizeObserver di Motion su questo elemento e su <html> (attach-animation.mjs, a * b < 0), e
 * durante la consegna delle osservazioni quelle nuove, meno profonde della traccia, verrebbero rimandate con
 * l'errore "ResizeObserver loop completed with undelivered notifications" su window.
 *
 * Caricato dalla section con {% render 'vite-tag', entry: 'scroll-gallery.js' %}.
 */

import { animate } from 'motion/mini';
import { scroll, GroupAnimation } from 'motion';

// Deve coincidere con la media query in scroll-gallery.css
const PINNED_QUERY = '(min-width: 750px) and (prefers-reduced-motion: no-preference)';

class ScrollGallery extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector('.scroll-gallery__track');
    this.progressBar = this.querySelector('.scroll-gallery__progress-bar');
    this.items = Array.from(this.querySelectorAll('.scroll-gallery__item'));
    if (!this.track || this.items.length < 2) return;

    this.mediaQuery = window.matchMedia(PINNED_QUERY);
    this.update = this.update.bind(this);
    this.handleFocusIn = this.handleFocusIn.bind(this);
    this.handleBlockSelect = this.handleBlockSelect.bind(this);

    this.mediaQuery.addEventListener('change', this.update);
    this.addEventListener('focusin', this.handleFocusIn);
    document.addEventListener('shopify:block:select', this.handleBlockSelect);

    // La distanza dipende dalla larghezza delle card: ricalcolata solo al resize, non a ogni frame;
    // se cambia, le animazioni (che hanno la distanza nei keyframe) vengono ricreate.
    // Il primo callback (distanza ancora indefinita) fa la configurazione iniziale: niente misure qui.
    this.distance = undefined;
    this.resizeObserver = new ResizeObserver(() => {
      const previous = this.distance;
      this.measure();
      if (this.distance !== previous) this.scheduleUpdate();
    });
    this.resizeObserver.observe(this.track);
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.updateFrame);
    this.teardown();
    this.mediaQuery?.removeEventListener('change', this.update);
    this.removeEventListener('focusin', this.handleFocusIn);
    document.removeEventListener('shopify:block:select', this.handleBlockSelect);
    this.resizeObserver?.disconnect();
  }

  get isPinned() {
    return this.mediaQuery.matches;
  }

  measure() {
    const first = this.items[0];
    const last = this.items[this.items.length - 1];
    this.distance = last.offsetLeft - first.offsetLeft;
  }

  teardown() {
    if (!this.scrollLink) return;
    const { animation, stop } = this.scrollLink;
    // cancel() prima di stop(): stop() di Motion su un'animazione ancora attiva ne scrive i valori correnti
    // negli stili inline (commitStyles, che per calcolarli ricalcola anche gli stili) e la traccia resterebbe
    // spostata come carosello; annullata prima, stop() si limita a staccarla dallo scroll.
    animation.cancel();
    stop();
    this.scrollLink = null;
  }

  /**
   * Ricrea le animazioni all'inizio del fotogramma successivo, fuori dal callback del ResizeObserver (vedi in
   * cima). Più richieste nello stesso fotogramma diventano una. Nel fotogramma d'attesa resta l'animazione
   * precedente; la prima volta lo stato del CSS (traccia ferma, barra vuota), lo stesso visibile prima che lo
   * script venga eseguito.
   */
  scheduleUpdate() {
    cancelAnimationFrame(this.updateFrame);
    this.updateFrame = requestAnimationFrame(() => {
      this.updateFrame = 0;
      this.update();
    });
  }

  update() {
    this.teardown();
    if (!this.isPinned || this.distance === undefined) return;

    // Prima tutte le animazioni (scritture), poi un solo scroll(): Motion misura section e viewport una volta
    // sola, dopo le scritture, invece di alternare scrittura e lettura per ogni elemento.
    const transition = { ease: 'linear' };
    const animations = [animate(this.track, { translate: ['0 0', `${-this.distance}px 0`] }, transition)];
    if (this.progressBar) animations.push(animate(this.progressBar, { scale: ['0 1', '1 1'] }, transition));

    const animation = new GroupAnimation(animations);
    this.scrollLink = { animation, stop: scroll(animation, { target: this, offset: ['start start', 'end end'] }) };
  }

  /** Scorre la pagina in modo che la card `item` sia al centro dell'area fissa. */
  scrollToItem(item, behavior = 'instant') {
    if (!this.isPinned || !this.distance) return;
    const progress = (item.offsetLeft - this.items[0].offsetLeft) / this.distance;
    const top = this.getBoundingClientRect().top + window.scrollY;
    const scrollable = this.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + progress * scrollable, behavior });
  }

  handleFocusIn(event) {
    const item = event.target.closest('.scroll-gallery__item');
    if (item) this.scrollToItem(item);
  }

  handleBlockSelect(event) {
    const item = this.items.find((el) => el === event.target || el.contains(event.target));
    if (item) this.scrollToItem(item, 'smooth');
  }
}

if (!customElements.get('scroll-gallery')) {
  customElements.define('scroll-gallery', ScrollGallery);
}
