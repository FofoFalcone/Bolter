/**
 * Frase rivelata allo scroll — custom element <scroll-text-reveal>.
 *
 * Riscrittura in JS vanilla dell'esempio Motion "Text scroll word reveal"
 * (https://motion.dev/examples/react-text-scroll-word-reveal):
 * nell'avanzamento dell'area sticky (0 → 1) ogni parola ha un intervallo [start, end] distribuito su SPREAD
 * e passa da START_OPACITY a 1 al suo interno. Ogni parola (e la barra di avanzamento) è un'animazione
 * `animate()` di motion/mini collegata allo scroll con `scroll(animation)`: con le scroll timeline native gira
 * fuori dal main thread, invece di riscrivere l'opacità di tutte le parole a ogni fotogramma.
 * Attivo solo con prefers-reduced-motion: no-preference (stessa condizione del CSS).
 *
 * Letture di layout: scroll() di Motion misura in modo sincrono section e viewport (clientHeight) dopo aver
 * agganciato l'animazione. Per questo tutte le animazioni stanno in un solo GroupAnimation e un solo scroll()
 * (una misura invece di una per parola, ognuna dopo la scrittura della precedente), e l'aggancio iniziale si fa
 * dopo il primo layout (afterFirstLayout) invece che in connectedCallback, durante il caricamento.
 *
 * Caricato dalla section con {% render 'vite-tag', entry: 'scroll-text-reveal.js' %}.
 */

import { animate } from 'motion/mini';
import { scroll, GroupAnimation } from 'motion';

const START_OPACITY = 0.15; // deve coincidere con il CSS
const SPREAD = 0.8; // porzione dello scroll su cui si distribuiscono gli inizi delle parole
const WORD_DURATION = 0.2; // durata della transizione di ogni parola (in avanzamento 0–1)
const MOTION_QUERY = '(prefers-reduced-motion: no-preference)';

function wordRange(index, count) {
  const start = count <= 1 ? 0 : (index / (count - 1)) * SPREAD;
  return { start, end: Math.min(1, start + WORD_DURATION) };
}

/**
 * Esegue `callback` all'inizio del fotogramma che segue il primo layout di `element` (primo callback di un
 * ResizeObserver, poi requestAnimationFrame): il layout è già stato fatto e di solito è ancora valido, quindi la
 * misura di Motion non lo forza. Restituisce la funzione che annulla. Non scatta finché l'elemento non è
 * visualizzato (display: none), e allora non serve.
 *
 * Perché non direttamente nel callback del ResizeObserver: con l'offset 'start start'/'end end' scroll() di Motion
 * registra un proprio ResizeObserver su questo elemento e su <html> (attach-animation.mjs, a * b < 0). Fatto
 * mentre il browser consegna le osservazioni, quelle nuove non sono più profonde dell'ultima consegnata: vengono
 * rimandate e il browser lancia su window l'errore "ResizeObserver loop completed with undelivered
 * notifications" (raccolto dai gestori di errori delle app). Il fotogramma d'attesa mostra lo stato del CSS, che
 * coincide con l'avanzamento 0, lo stesso visibile prima che lo script venga eseguito.
 */
function afterFirstLayout(element, callback) {
  let frame = 0;
  const observer = new ResizeObserver(() => {
    observer.disconnect();
    frame = requestAnimationFrame(() => callback());
  });
  observer.observe(element);
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}

class ScrollTextReveal extends HTMLElement {
  connectedCallback() {
    this.words = Array.from(this.querySelectorAll('.scroll-text-reveal__word'));
    this.progressBar = this.querySelector('.scroll-text-reveal__progress-bar');

    this.mediaQuery = window.matchMedia(MOTION_QUERY);
    this.update = this.update.bind(this);
    this.mediaQuery.addEventListener('change', this.update);
    this.cancelSetup = afterFirstLayout(this, this.update);
  }

  disconnectedCallback() {
    this.cancelSetup?.();
    this.teardown();
    this.mediaQuery?.removeEventListener('change', this.update);
  }

  teardown() {
    if (!this.scrollLink) return;
    const { animation, stop } = this.scrollLink;
    // cancel() prima di stop(): le parole tornano allo stato del CSS. Nell'ordine opposto stop() di Motion
    // scriverebbe l'opacità corrente negli stili inline (commitStyles, che ricalcola anche gli stili).
    animation.cancel();
    stop();
    this.scrollLink = null;
  }

  update() {
    this.teardown();
    if (!this.mediaQuery.matches || this.words.length === 0) return;

    const animations = this.words.map((word, index) => {
      const { start, end } = wordRange(index, this.words.length);
      // Ferma a START_OPACITY fino a `start`, piena da `end` in poi (posizioni nell'avanzamento 0–1)
      return animate(
        word,
        { opacity: [START_OPACITY, START_OPACITY, 1, 1] },
        { ease: 'linear', times: [0, start, end, 1] },
      );
    });
    if (this.progressBar) animations.push(animate(this.progressBar, { scale: ['1 0', '1 1'] }, { ease: 'linear' }));

    const animation = new GroupAnimation(animations);
    this.scrollLink = { animation, stop: scroll(animation, { target: this, offset: ['start start', 'end end'] }) };
  }
}

if (!customElements.get('scroll-text-reveal')) {
  customElements.define('scroll-text-reveal', ScrollTextReveal);
}
