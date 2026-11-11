/**
 * Script e immagini delle section caricati quando servono.
 *
 * Script (snippets/vite-tag-deferred.liquid): lo snippet mette i tag di vite-tag (script del modulo e modulepreload)
 * dentro un <template data-deferred-script="near|idle">: il browser non li scarica finché qui non vengono copiati nel
 * documento.
 * - near: quando la section è a meno di uno schermo dalla vista (IntersectionObserver);
 * - idle: dopo l'evento load, nel primo momento libero (es. carrello a cassetto: deve essere pronto prima del primo clic).
 *
 * Perché: uno <script type="module"> parte con priorità alta e compete con CSS, font e immagine LCP anche se la
 * section è in fondo alla pagina (e Lighthouse, in simulazione, lo conta come bloccante per FCP e LCP). I tag copiati
 * qui hanno fetchpriority="low". Lo stesso URL di un modulo viene scaricato ed eseguito una volta sola: se due section
 * usano lo stesso entrypoint, il secondo tag non fa nulla.
 *
 * Immagini (snippets/deferred-media.liquid): l'HTML dell'immagine è dentro <noscript data-deferred-media>. Con JS
 * attivo il browser lo legge come testo e non scarica nulla; qui viene inserito come HTML quando la section è a meno
 * di uno schermo dalla vista. Senza JS il noscript mostra l'immagine normalmente.
 * Perché: `loading="lazy"` lascia la distanza al browser, che su una connessione che stima lenta scarica le immagini
 * fino a ~2500px sotto lo schermo (misurato il 2026-11-11: la galleria della home, a ~2000px, partiva all'apertura
 * solo con il profilo 3G e toglieva banda alla foto della hero).
 *
 * Nel theme editor gli snippet stampano direttamente script e immagini (request.design_mode), quindi qui non serve
 * gestire shopify:section:load. Dopo un aggiornamento via Section Rendering basta richiamare le funzioni init(root).
 */

const NEAR_MARGIN = '100% 0px'; // uno schermo sopra e sotto la vista
const IDLE_TIMEOUT = 2000;

/** URL già inseriti (script e modulepreload), per non duplicare i tag. */
const inserted = new Set();

let observer;
/** Elemento osservato → azioni da eseguire quando entra nel margine. */
const pending = new Map();

function activate(template) {
  if (template.dataset.deferredLoaded !== undefined) return;
  template.dataset.deferredLoaded = '';

  // Prima i modulepreload, poi gli script: le dipendenze partono insieme all'entrypoint
  const nodes = [...template.content.querySelectorAll('link[rel="modulepreload"], script[src]')].sort(
    (a, b) => (a.localName === 'script') - (b.localName === 'script'),
  );
  for (const node of nodes) {
    const url = node.getAttribute('src') ?? node.getAttribute('href');
    if (!url || inserted.has(url)) continue;
    inserted.add(url);
    // Elemento nuovo, non un clone: gli script copiati da un <template> potrebbero non partire
    const element = document.createElement(node.localName);
    for (const { name, value } of node.attributes) element.setAttribute(name, value);
    element.setAttribute('fetchpriority', 'low');
    document.head.append(element);
  }
}

/** Sostituisce il <noscript> con il suo contenuto (testo con JS attivo) trasformato in HTML. */
function insertMedia(noscript) {
  if (!noscript.isConnected) return;
  const template = document.createElement('template');
  template.innerHTML = noscript.textContent;
  noscript.replaceWith(template.content);
}

function getObserver() {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        pending.get(entry.target)?.forEach((action) => action());
        pending.delete(entry.target);
      }
    },
    { rootMargin: NEAR_MARGIN },
  );
  return observer;
}

/** Esegue `action` quando la section che contiene `element` si avvicina alla vista. False se non c'è nulla da osservare. */
function whenNear(element, action) {
  // Si osserva la section che contiene l'elemento (<template> e <noscript> non hanno dimensioni)
  const target = element.closest('.shopify-section') ?? element.parentElement;
  if (!target) return false;
  if (!pending.has(target)) {
    pending.set(target, []);
    getObserver().observe(target);
  }
  pending.get(target).push(action);
  return true;
}

function whenIdle(callback) {
  const schedule = () =>
    'requestIdleCallback' in window
      ? requestIdleCallback(callback, { timeout: IDLE_TIMEOUT })
      : setTimeout(callback, 200);
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
}

/** Avvia il caricamento differito dei template di script in `root` (default: tutto il documento). */
export function initDeferredScripts(root = document) {
  const templates = root.querySelectorAll('template[data-deferred-script]:not([data-deferred-loaded])');
  const idle = [];

  for (const template of templates) {
    if (template.dataset.deferredScript === 'idle' || !('IntersectionObserver' in window)) {
      idle.push(template);
      continue;
    }
    whenNear(template, () => activate(template));
  }

  if (idle.length) whenIdle(() => idle.forEach(activate));
}

/** Avvia l'inserimento differito delle immagini in `root` (default: tutto il documento). */
export function initDeferredMedia(root = document) {
  for (const noscript of root.querySelectorAll('noscript[data-deferred-media]:not([data-deferred-queued])')) {
    noscript.dataset.deferredQueued = '';
    // Senza IntersectionObserver subito: meglio un'immagine in anticipo che una che non arriva mai
    if (!('IntersectionObserver' in window) || !whenNear(noscript, () => insertMedia(noscript))) insertMedia(noscript);
  }
}
