/**
 * Theme entry point.
 *
 * This file is picked up by vite-plugin-shopify as an entrypoint
 * and loaded in the layout via {% render 'vite-tag', entry: 'theme.js' %}.
 *
 * Import section-specific or component scripts here:
 *   import '../scripts/header.js';
 *   import '../scripts/product-form.js';
 */

// Header: presente su ogni pagina, quindi nel bundle globale (custom element <site-header>)
import '../scripts/header.js';
// Standard storefront events and actions di Shopify: eventi shopify:*, <s-view-event>, Shopify.actions
import { initStandardEvents } from '../scripts/standard-events.js';
// Elenchi scorrevoli raggiungibili da tastiera ([data-scroll-region])
import { initScrollRegions } from '../scripts/scroll-regions.js';
// Stati di caricamento globali: immagini arrivate e barra della navigazione
import { initLoadingStates } from '../scripts/loading-states.js';
// Larghezza della barra di scorrimento per il blocco dello scroll ([data-scroll-lock])
import { initScrollbarWidth } from '../scripts/scrollbar-width.js';
// Esc nasconde i tooltip CSS (utility `tooltip`)
import { initTooltips } from '../scripts/tooltips.js';
// JS e immagini delle section caricati quando servono (snippets/vite-tag-deferred.liquid, snippets/deferred-media.liquid)
import { initDeferredScripts, initDeferredMedia, loadWhenNeeded } from '../scripts/deferred-scripts.js';

// Nessuna misura del layout all'avvio: il modulo gira mentre la pagina fa il primo layout, e ogni lettura lo
// forzerebbe. Le misure arrivano dai ResizeObserver, le cui callback girano nell'ordine di creazione: header
// (header.js, alla definizione di <site-header>), poi barra di scorrimento, poi elenchi scorrevoli
// (initScrollRegions, sotto). Ognuna legge prima di scrivere; non spostare initScrollbarWidth dopo initScrollRegions.
initStandardEvents();
initLoadingStates();
initScrollbarWidth();
initTooltips();

const ANIMATE_SELECTOR = '[data-animate], [data-animate-stagger]';

function onDOMReady(fn) {
  if (document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

/**
 * Motion viene caricato solo se la pagina (o la section) contiene elementi animati:
 * Vite lo separa in un chunk dedicato, quindi le pagine senza animazioni non lo scaricano.
 * Arriva quando una section animata si avvicina alla vista o a pagina caricata (loadWhenNeeded): gli elementi animati
 * non sono mai nella prima schermata (CLAUDE.md), quindi non serve scaricarlo insieme alla foto LCP.
 * initAnimations salta gli elementi già pronti: più chiamate sulla stessa section non li animano due volte.
 */
function loadAnimations(root = document) {
  const elements = root.querySelectorAll(ANIMATE_SELECTOR);
  const reveals = root.querySelectorAll('[data-animate-scroll]');
  if (!elements.length && !reveals.length) return;
  // [data-animate-scroll] (card delle griglie): la griglia è già in vista, ma questi elementi non sono nascosti dal
  // CSS, quindi basta arrivare a pagina caricata. Prima di allora le card visibili restano semplicemente ferme.
  loadWhenNeeded(elements, () =>
    import('../scripts/animations.js').then(({ initAnimations }) => initAnimations(root)),
  );
}

/**
 * Selettore colore delle card prodotto: il JS si scarica solo se in pagina c'è una card che lo usa, quando la card si
 * avvicina alla vista o a pagina caricata. Prima del JS la card resta un link alla pagina prodotto.
 */
function loadProductCards(root = document) {
  const cards = root.querySelectorAll('product-card:has([data-card-swatches])');
  if (cards.length) loadWhenNeeded(cards, () => import('../scripts/product-card.js'));
}

/**
 * Scorrimento morbido (Lenis): solo se attivo nelle impostazioni del tema, con mouse/trackpad (sul touch
 * Lenis non interviene, inutile scaricarlo) e senza riduzione del movimento.
 */
function loadSmoothScroll() {
  const intensity = document.documentElement.dataset.smoothScroll;
  if (!intensity || !window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return;
  import('../scripts/smooth-scroll.js').then(({ initSmoothScroll }) => initSmoothScroll(intensity));
}

onDOMReady(() => {
  initDeferredScripts();
  initDeferredMedia();
  loadAnimations();
  loadProductCards();
  loadSmoothScroll();
  initScrollRegions();
});

// Theme editor: quando una section viene aggiunta o ricaricata, inizializza animazioni, card ed elenchi scorrevoli.
document.addEventListener('shopify:section:load', (event) => {
  loadAnimations(event.target);
  loadProductCards(event.target);
  initScrollRegions(event.target);
});
