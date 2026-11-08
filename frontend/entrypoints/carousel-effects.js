/**
 * Effetti del carosello legati allo scorrimento (frontend/entrypoints/carousel.js).
 *
 * Entrypoint a parte: si scarica solo se la section usa un effetto o la barra di avanzamento.
 * Dove il browser ha le timeline native (ScrollTimeline/ViewTimeline) le animazioni WAAPI si collegano direttamente:
 * girano fuori dal main thread e si evitano le letture di clientWidth che scroll() di Motion fa per ogni slide subito
 * dopo aver creato l'animazione. Il costruttore di ViewTimeline invece aggiorna stile e layout del soggetto (Chromium,
 * view_timeline.cc: UpdateStyleAndLayoutForNode): linkEffect va chiamata con il layout già pulito (carousel.js la chiama
 * dal ResizeObserver, prima di ogni scrittura) e crea tutte le timeline prima di tutte le animazioni, così nessun
 * costruttore trova lo stile invalidato dall'animazione della slide precedente. ScrollTimeline non ha questo costo
 * (aggiorna l'albero solo in quirks mode).
 * Dove mancano, Motion le guida da JS con le stesse animazioni.
 * Nessun effetto con prefers-reduced-motion (controllo in carousel.js e varianti js-motion nel Liquid).
 */

import { animate } from 'motion/mini';
import { scroll } from 'motion';

// La slide attraversa la traccia: entra da destra (0), al centro (0.5), esce a sinistra (1)
const CROSSING = ['start end', 'end start'];
// Lo stesso intervallo come range della ViewTimeline (quello che Motion ricava da CROSSING)
const CROSSING_RANGE = { rangeStart: 'entry-crossing 0%', rangeEnd: 'exit-crossing 100%' };
const PERSPECTIVE = 'perspective(1200px)';

const supportsViewTimeline = () => typeof window.ViewTimeline === 'function';
const supportsScrollTimeline = () => typeof window.ScrollTimeline === 'function';

const EFFECTS = {
  parallax: (slide) => [
    {
      element: slide.querySelector('[data-carousel-image] > img'),
      keyframes: { translate: ['-7% 0', '7% 0'] },
    },
  ],
  coverflow: (slide) => [
    {
      element: slide,
      keyframes: {
        transform: [
          `${PERSPECTIVE} rotateY(42deg) scale(0.82)`,
          `${PERSPECTIVE} rotateY(0deg) scale(1)`,
          `${PERSPECTIVE} rotateY(-42deg) scale(0.82)`,
        ],
        opacity: [0.55, 1, 0.55],
      },
    },
  ],
};

/** Animazione WAAPI su una timeline nativa: solo scritture, nessuna misura. La durata `auto` copre il range. */
function linkNative(element, keyframes, options) {
  const animation = element.animate(keyframes, { easing: 'linear', fill: 'both', ...options });
  return () => animation.cancel();
}

/** Ripiego senza timeline native: Motion misura una volta per fotogramma, nella sua fase di lettura. */
function linkWithMotion(element, keyframes, scrollOptions) {
  const animation = animate(element, keyframes, { ease: 'linear' });
  const stop = scroll(animation, scrollOptions);
  return () => {
    stop();
    animation.cancel();
  };
}

export function linkEffect(name, track, slides) {
  const describe = EFFECTS[name];
  if (!describe) return () => {};

  const native = supportsViewTimeline();
  const targets = slides
    .map((slide) => ({ slide, parts: describe(slide).filter(({ element }) => element) }))
    .filter(({ parts }) => parts.length > 0);

  // Prima fase: solo timeline (una per slide, condivisa dai suoi elementi, come la cache di Motion). Con il layout pulito
  // l'aggiornamento chiesto da ogni costruttore non ha nulla da ricalcolare.
  if (native) {
    for (const target of targets) target.timeline = new window.ViewTimeline({ subject: target.slide, axis: 'x' });
  }

  // Seconda fase: solo animazioni (scritture di stile), nessun costruttore dopo di loro
  const stops = targets.flatMap(({ slide, parts, timeline }) =>
    parts.map(({ element, keyframes }) =>
      native
        ? linkNative(element, keyframes, { timeline, ...CROSSING_RANGE })
        : linkWithMotion(element, keyframes, { container: track, target: slide, axis: 'x', offset: CROSSING }),
    ),
  );

  return () => {
    for (const stop of stops) stop();
  };
}

/** Barra di avanzamento: `start` è la quota già visibile a inizio corsa, così non parte mai vuota. */
export function linkProgress(bar, track, start) {
  const keyframes = { scale: [`${start} 1`, '1 1'] };
  if (supportsScrollTimeline()) {
    return linkNative(bar, keyframes, { timeline: new window.ScrollTimeline({ source: track, axis: 'x' }) });
  }
  return linkWithMotion(bar, keyframes, { container: track, axis: 'x' });
}
