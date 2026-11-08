/**
 * Animazioni dichiarative con Motion (https://motion.dev).
 *
 * Caricato on-demand da frontend/entrypoints/theme.js solo se nella pagina
 * esistono elementi con [data-animate] o [data-animate-stagger].
 *
 * Uso nel Liquid:
 *
 *   <div data-animate="fade-up">…</div>
 *     → l'elemento si anima quando entra nel viewport (una sola volta).
 *
 *   <ul data-animate-stagger="fade-up">
 *     <li>…</li><li>…</li>
 *   </ul>
 *     → i figli diretti si animano in sequenza quando il contenitore entra nel viewport.
 *
 * Attributi opzionali (valori in secondi):
 *   data-animate-delay="0.2"      ritardo iniziale
 *   data-animate-duration="0.8"   durata di ogni animazione
 *   data-animate-interval="0.1"   intervallo tra i figli (solo stagger)
 *   data-animate-from="center"    origine dello stagger: first (default) | center | last.
 *                                 Su un contenitore display:grid l'onda parte dal centro
 *                                 (o dall'angolo) della griglia, calcolando colonne e righe.
 *
 * Preset disponibili: vedi PRESETS qui sotto.
 *
 * Lo stato iniziale nascosto è gestito in CSS (frontend/styles/animations.css),
 * così non c'è flash di contenuto prima del caricamento di questo modulo.
 * Non usare data-animate su elementi above-the-fold (es. hero, immagine LCP):
 * resterebbero invisibili finché il JS non è caricato, peggiorando LCP.
 */

// motion/mini: animate() basato su Web Animations API (~pochi KB) invece della versione ibrida completa.
// stagger arriva dal pacchetto principale ma è tree-shakeable e leggero.
import { animate } from 'motion/mini';
import { stagger } from 'motion';

// Si usano le proprietà CSS individuali `translate` e `scale` (non `transform`):
// lo stile finale scritto inline non sovrascrive eventuali `transform` del tema (es. effetti hover).
export const PRESETS = {
  fade: { opacity: [0, 1] },
  'fade-up': { opacity: [0, 1], translate: ['0 24px', '0 0'] },
  'fade-down': { opacity: [0, 1], translate: ['0 -24px', '0 0'] },
  'fade-left': { opacity: [0, 1], translate: ['24px 0', '0 0'] },
  'fade-right': { opacity: [0, 1], translate: ['-24px 0', '0 0'] },
  'zoom-in': { opacity: [0, 1], scale: [0.94, 1] },
  // Dall'esempio "Stagger grid": comparsa con scala più marcata, ideale con data-animate-from="center".
  pop: { opacity: [0, 1], scale: [0.5, 1] },
};

const DEFAULTS = {
  duration: 0.6,
  interval: 0.08,
  ease: [0.22, 1, 0.36, 1], // ease-out morbido
};

const VIEW_OPTIONS = {
  amount: 0.2, // parte quando il 20% dell'elemento è visibile
  margin: '0px 0px -10% 0px',
};

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function readNumber(el, attr, fallback) {
  const value = parseFloat(el.getAttribute(attr));
  return Number.isFinite(value) ? value : fallback;
}

function getPreset(name, el) {
  const preset = PRESETS[name];
  if (!preset) {
    console.warn(`[animations] preset "${name}" sconosciuto, uso "fade".`, el);
    return PRESETS.fade;
  }
  return preset;
}

/**
 * Un solo IntersectionObserver per tutti gli elementi animati (stesse opzioni di inView di Motion, che ne creava uno
 * per elemento): gli elementi che entrano insieme nello schermo arrivano nella stessa callback, che prima fa tutte
 * le letture (griglia degli stagger) e poi avvia tutte le animazioni. Con un observer per elemento, la lettura della
 * griglia di uno stagger arrivava dopo gli stili scritti dalle animazioni partite nelle callback precedenti dello
 * stesso task, e forzava il layout della pagina.
 * Ogni elemento si anima una sola volta: appena entra smette di essere osservato.
 */
const starters = new WeakMap(); // elemento → prepara l'animazione (letture) e restituisce l'avvio (scritture)
let observer = null;

function onIntersection(entries) {
  const starts = [];
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer.unobserve(entry.target);
    const prepare = starters.get(entry.target);
    starters.delete(entry.target);
    if (prepare) starts.push(prepare());
  }
  starts.forEach((start) => start());
}

function observe(el, prepare) {
  observer ??= new IntersectionObserver(onIntersection, {
    rootMargin: VIEW_OPTIONS.margin,
    threshold: VIEW_OPTIONS.amount,
  });
  starters.set(el, prepare);
  observer.observe(el);
}

// Theme editor: una section rimossa o ricaricata non resta nell'observer condiviso
document.addEventListener('shopify:section:unload', (event) => {
  if (!observer) return;
  event.target.querySelectorAll?.('[data-animate-ready]').forEach((el) => {
    observer.unobserve(el);
    starters.delete(el);
  });
});

function setupSingle(el) {
  const keyframes = getPreset(el.dataset.animate, el);

  observe(el, () => () => {
    animate(el, keyframes, {
      duration: readNumber(el, 'data-animate-duration', DEFAULTS.duration),
      delay: readNumber(el, 'data-animate-delay', 0),
      ease: DEFAULTS.ease,
    });
  });
}

function setupStagger(container) {
  const keyframes = getPreset(container.dataset.animateStagger, container);
  const children = Array.from(container.children);
  if (children.length === 0) return;

  observe(container, () => {
    // Letture: fatte per tutti gli elementi entrati prima di avviare qualsiasi animazione (onIntersection)
    const staggerOptions = { startDelay: readNumber(container, 'data-animate-delay', 0) };
    const from = container.dataset.animateFrom;
    if (from && STAGGER_ORIGINS.includes(from)) {
      staggerOptions.from = from;
      // Su una griglia CSS l'origine è calcolata in 2D (es. dal centro della griglia, non della lista).
      const grid = readGrid(container, children.length);
      if (grid) staggerOptions.grid = grid;
    }

    return () => {
      animate(children, keyframes, {
        duration: readNumber(container, 'data-animate-duration', DEFAULTS.duration),
        delay: stagger(readNumber(container, 'data-animate-interval', DEFAULTS.interval), staggerOptions),
        ease: DEFAULTS.ease,
      });
    };
  });
}

const STAGGER_ORIGINS = ['first', 'center', 'last'];

/**
 * Colonne e righe di un contenitore con display: grid (letti al momento dell'animazione,
 * quindi corretti per il breakpoint attuale). Ispirato all'esempio Motion "Stagger grid".
 */
function readGrid(container, count) {
  const style = getComputedStyle(container);
  if (!style.display.includes('grid')) return null;
  const columns = style.gridTemplateColumns.split(' ').filter(Boolean).length;
  if (columns < 2) return null;
  return [columns, Math.ceil(count / columns)];
}

/**
 * Inizializza le animazioni dentro `root` (document o una section ricaricata
 * dal theme editor). Gli elementi già inizializzati vengono saltati.
 */
export function initAnimations(root = document) {
  // Con movimento ridotto non animiamo: il CSS lascia già gli elementi visibili.
  if (prefersReducedMotion()) return;

  root.querySelectorAll('[data-animate]').forEach((el) => {
    if (el.hasAttribute('data-animate-ready')) return;
    el.setAttribute('data-animate-ready', '');
    setupSingle(el);
  });

  root.querySelectorAll('[data-animate-stagger]').forEach((container) => {
    if (container.hasAttribute('data-animate-ready')) return;
    container.setAttribute('data-animate-ready', '');
    setupStagger(container);
  });
}
