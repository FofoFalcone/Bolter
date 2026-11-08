/**
 * Immagine con testo parallax — custom element <parallax-section>.
 *
 * Adattato dall'esempio Motion "Parallax" (https://motion.dev/examples/js-parallax):
 * mentre la section attraversa la viewport (0 → 1):
 * - immagine: da -offset a +offset dentro la cornice (più alta della cornice di 2 * offset, vedi CSS);
 * - testo: da +offset/2 a -offset/2 (direzione opposta, più lento) → effetto profondità.
 * Animazioni `animate()` di motion/mini collegate allo scroll con `scroll(animation)`: dove il browser ha le
 * scroll timeline native girano fuori dal main thread (niente stili scritti a ogni fotogramma), come nella hero.
 * Attivo solo con prefers-reduced-motion: no-preference.
 *
 * Letture di layout: scroll() di Motion misura in modo sincrono section e viewport (clientHeight) dopo aver
 * agganciato l'animazione: un solo scroll() per entrambe le animazioni, agganciato dopo il primo layout
 * (afterLayout) invece che in connectedCallback, dove durante il caricamento forzava il layout.
 *
 * Caricato dalla section con {% render 'vite-tag', entry: 'image-with-text-parallax.js' %}.
 */

import { animate } from 'motion/mini';
import { scroll, GroupAnimation } from 'motion';

const MOTION_QUERY = '(prefers-reduced-motion: no-preference)';

/**
 * Esegue `callback` nel primo callback di un ResizeObserver su `element`, che arriva subito dopo il layout del
 * fotogramma e prima del paint: lì le letture di layout non forzano nulla. Restituisce la funzione che annulla.
 * Non scatta finché l'elemento non è visualizzato (display: none), e allora non serve.
 * Va bene solo perché con l'offset 'start end'/'end start' scroll() non registra ResizeObserver di Motion
 * (a * b > 0 in attach-animation.mjs). Con un offset come 'start start'/'end end' li registrerebbe su section e
 * <html> durante la consegna delle osservazioni ("ResizeObserver loop completed with undelivered notifications"
 * su window): in quel caso aggancio nel fotogramma dopo, come in scroll-text-reveal.js.
 */
function afterLayout(element, callback) {
  const observer = new ResizeObserver(() => {
    observer.disconnect();
    callback();
  });
  observer.observe(element);
  return () => observer.disconnect();
}

class ParallaxSection extends HTMLElement {
  connectedCallback() {
    this.image = this.querySelector('.parallax__image');
    this.content = this.querySelector('[data-parallax-content]');
    this.offset = Number(this.dataset.offset) || 80;

    this.mediaQuery = window.matchMedia(MOTION_QUERY);
    this.update = this.update.bind(this);
    this.mediaQuery.addEventListener('change', this.update);
    this.cancelSetup = afterLayout(this, this.update);
  }

  disconnectedCallback() {
    this.cancelSetup?.();
    this.teardown();
    this.mediaQuery?.removeEventListener('change', this.update);
  }

  teardown() {
    if (!this.scrollLink) return;
    const { animation, stop } = this.scrollLink;
    // cancel() prima di stop(): immagine e testo tornano al loro posto. Nell'ordine opposto stop() di Motion
    // scriverebbe la traslazione corrente negli stili inline (commitStyles, che ricalcola anche gli stili).
    animation.cancel();
    stop();
    this.scrollLink = null;
  }

  update() {
    this.teardown();
    if (!this.mediaQuery.matches) return;

    const { offset } = this;
    const transition = { ease: 'linear' };
    // Prima tutte le animazioni (scritture), poi un solo scroll(): Motion misura section e viewport una volta sola
    const animations = [];
    if (this.image) animations.push(animate(this.image, { translate: [`0 ${-offset}px`, `0 ${offset}px`] }, transition));
    if (this.content) {
      animations.push(animate(this.content, { translate: [`0 ${offset / 2}px`, `0 ${-offset / 2}px`] }, transition));
    }
    if (animations.length === 0) return;

    const animation = new GroupAnimation(animations);
    // 0 quando la section entra dal basso, 1 quando esce dall'alto
    this.scrollLink = { animation, stop: scroll(animation, { target: this, offset: ['start end', 'end start'] }) };
  }
}

if (!customElements.get('parallax-section')) {
  customElements.define('parallax-section', ParallaxSection);
}
