/**
 * Stati di caricamento globali (CSS in frontend/styles/loading.css).
 *
 * - Immagini: data-loaded su ogni <img> arrivata (anche con errore), per fermare il riflesso di `media-loading`.
 *   `load` ed `error` non risalgono il DOM ma si catturano: vale anche per le immagini inserite in seguito
 *   (Section Rendering, cambio variante, theme editor) senza osservare nulla.
 * - Navigazione: barra in alto se la pagina nuova tarda più di NAVIGATION_DELAY. Navigation API: dove manca (o se il
 *   merchant la spegne, Impostazioni tema → Transizioni tra pagine) non si mostra nulla e la navigazione è quella normale.
 */

const NAVIGATION_DELAY = 200; // ms: sotto questa soglia una barra sarebbe solo uno sfarfallio
const NAVIGATION_LIMIT = 15000; // ms: risposta senza cambio pagina (es. 204) o navigazione annullata con Esc

function markImage(event) {
  if (event.target instanceof HTMLImageElement) event.target.setAttribute('data-loaded', '');
}

function initImages() {
  document.addEventListener('load', markImage, true);
  document.addEventListener('error', markImage, true);
  // Già arrivate prima di questo script (è un modulo: parte dopo il parsing)
  for (const image of document.images) {
    if (image.complete) image.setAttribute('data-loaded', '');
  }
}

function initNavigationProgress() {
  if (!window.navigation || document.documentElement.dataset.navigationProgress === undefined) return;

  let bar = null;
  let showTimer = 0;
  let limitTimer = 0;

  const hide = () => {
    clearTimeout(showTimer);
    clearTimeout(limitTimer);
    if (bar?.matches(':popover-open')) bar.hidePopover();
  };
  const show = () => {
    if (!bar) {
      bar = document.createElement('div');
      bar.popover = 'manual';
      bar.setAttribute('aria-hidden', 'true');
      bar.className = 'navigation-progress';
      document.body.append(bar);
    }
    bar.showPopover();
    limitTimer = setTimeout(hide, NAVIGATION_LIMIT);
  };

  window.navigation.addEventListener('navigate', ({ destination, downloadRequest }) => {
    // Stessa pagina (ancore, replaceState di filtri e varianti), download, mailto: e tel: non caricano una pagina
    if (destination.sameDocument || downloadRequest !== null || !destination.url.startsWith('http')) return;
    hide();
    showTimer = setTimeout(show, NAVIGATION_DELAY);
  });

  // pageswap: prima dell'ultimo fotogramma della pagina, così la barra non finisce nella "foto" della transizione
  window.addEventListener('pageswap', hide);
  window.addEventListener('pagehide', hide);
  window.navigation.addEventListener('navigateerror', hide);
}

export function initLoadingStates() {
  initImages();
  initNavigationProgress();
}
