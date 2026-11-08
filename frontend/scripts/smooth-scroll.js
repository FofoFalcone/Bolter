/**
 * Scorrimento morbido della pagina con Lenis (https://lenis.darkroom.engineering), come nell'esempio
 * Motion "Lenis smooth scroll" (https://motion.dev/examples/js-lenis-smooth-scroll): Lenis è guidato dal
 * frame loop di Motion (step "setup"), così le animazioni legate allo scroll del tema (scroll() di Motion:
 * parallax, galleria orizzontale, testo rivelato) leggono la posizione aggiornata nello stesso frame.
 *
 * Lenis anima la posizione di scroll nativa della finestra: eventi scroll, position: sticky, IntersectionObserver
 * e scroll-snap continuano a funzionare. Solo la rotella e il trackpad vengono smussati: tastiera, barra di
 * scorrimento e touch restano nativi.
 *
 * - autoToggle: si ferma da solo quando la pagina ha overflow: hidden (carrello a cassetto, anteprima rapida,
 *   menu mobile) e riparte alla chiusura;
 * - allowNestedScroll: i contenitori scorrevoli interni (lista del cassetto, informazioni dell'anteprima rapida,
 *   pannello del menu) scorrono in modo nativo. Per escluderne altri: attributo data-lenis-prevent;
 * - prevent: niente scorrimento morbido dentro i <dialog>;
 * - anchors: false, i link interni (es. "Vai al contenuto") restano nativi e spostano anche il focus;
 * - si spegne se l'utente attiva "riduci movimento" mentre la pagina è aperta.
 *
 * Caricato da frontend/entrypoints/theme.js (import dinamico) solo se attivo nelle impostazioni del tema
 * (<html data-smooth-scroll>), con puntatore preciso (mouse/trackpad) e senza riduzione del movimento.
 * CSS consigliato da Lenis: frontend/entrypoints/theme.css (@import 'lenis/dist/lenis.css').
 */

import Lenis from 'lenis';
import { cancelFrame, frame } from 'motion';

/** Intensità (impostazioni del tema) → lerp di Lenis: più basso = scorrimento più lungo e morbido. */
const LERP = { light: 0.16, medium: 0.1, strong: 0.06 };

/**
 * Classi che Lenis mette su <html> alla creazione con queste opzioni (getter `className` di Lenis: "lenis" e, con
 * autoToggle, "lenis-autoToggle"). Se una versione nuova di Lenis le cambia non si rompe nulla: le scrive lui, e
 * torna solo il layout forzato descritto in initSmoothScroll.
 */
const LENIS_CLASSES = ['lenis', 'lenis-autoToggle'];

let lenis = null;
let pending = false;
let resizeObserver = null;
let resizeQueued = false;
let skipFirstResize = true;

const step = ({ timestamp }) => lenis?.raf(timestamp);

/** Misure di Lenis (finestra e altezza della pagina) rifatte nella fase di lettura del frame di Motion. */
const measure = () => {
  resizeQueued = false;
  lenis?.dimensions.resize();
};

const queueResize = () => {
  if (resizeQueued) return;
  resizeQueued = true;
  frame.read(measure);
};

/**
 * Sostituisce l'autoResize di Lenis (resize della finestra + ResizeObserver su <html>, poi un setTimeout di 250ms
 * che misura innerWidth/innerHeight e scrollHeight): quel timer girava durante il caricamento, quando il layout è
 * spesso da rifare, e lo forzava. Qui le stesse misure (dimensions.resize(), come faceva Lenis) arrivano al più una
 * volta per fotogramma nella fase read, prima delle scritture delle animazioni. La prima notifica del
 * ResizeObserver, che arriva sempre all'osservazione, si salta: Lenis ha appena misurato nel costruttore.
 */
function observeResize() {
  skipFirstResize = true;
  resizeObserver = new ResizeObserver(() => {
    if (skipFirstResize) {
      skipFirstResize = false;
      return;
    }
    queueResize();
  });
  resizeObserver.observe(document.documentElement);
  window.addEventListener('resize', queueResize);
}

function unobserveResize() {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener('resize', queueResize);
  if (resizeQueued) cancelFrame(measure);
  resizeQueued = false;
}

/**
 * Layout: il costruttore di Lenis misura la finestra e la pagina (innerWidth/innerHeight, scrollHeight), toglie e
 * rimette le sue classi su <html>, poi legge window.scrollY e l'overflow di <html>. Creato subito dopo l'import,
 * durante il caricamento, la prima misura forzava il layout e la lettura dello scroll lo forzava di nuovo, con gli
 * stili cambiati dalle classi.
 * Qui le classi si scrivono subito e Lenis nasce nella fase read del frame di Motion del fotogramma successivo:
 * il browser ha già calcolato stili e layout con le classi, quindi la prima misura di solito non ha nulla da
 * rifare (non è garantito: un task o un requestAnimationFrame precedente può aver cambiato la pagina, ma il layout
 * andrebbe rifatto comunque in quel fotogramma, e qui succede una volta sola, prima delle scritture delle
 * animazioni). Lenis toglie e rimette comunque le classi (cleanUpClassName in updateClassName), e la lettura di
 * scrollY che segue ricalcola gli stili di <html> e <body>: con le classi già presenti i valori calcolati non
 * cambiano, quindi resta un ricalcolo piccolo, senza layout. Lo scorrimento morbido parte un fotogramma dopo.
 */
export function initSmoothScroll(intensity) {
  if (lenis || pending) return;
  pending = true;
  document.documentElement.classList.add(...LENIS_CLASSES);
  // postRender di questo fotogramma → read del successivo (un read chiesto dopo la fase read va al frame dopo)
  frame.postRender(() => {
    frame.read(() => {
      if (!pending) return; // spento nel frattempo (riduzione del movimento)
      pending = false;
      lenis = new Lenis({
        autoRaf: false,
        autoResize: false, // observeResize()
        lerp: LERP[intensity] ?? LERP.medium,
        autoToggle: true,
        allowNestedScroll: true,
        anchors: false,
        stopInertiaOnNavigate: true,
        prevent: (node) => node.nodeName === 'DIALOG',
      });
      observeResize();
      frame.setup(step, true);
    });
  });

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion.addEventListener('change', (event) => event.matches && destroySmoothScroll(), { once: true });
}

export function destroySmoothScroll() {
  if (pending) {
    pending = false;
    document.documentElement.classList.remove(...LENIS_CLASSES);
  }
  cancelFrame(step);
  unobserveResize();
  lenis?.destroy();
  lenis = null;
}
