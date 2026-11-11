/**
 * Script delle section caricati quando servono (snippets/vite-tag-deferred.liquid).
 *
 * Lo snippet mette i tag di vite-tag (script del modulo e modulepreload) dentro un
 * <template data-deferred-script="near|idle">: il browser non li scarica finché qui non vengono copiati nel documento.
 * - near: quando la section è a meno di uno schermo dalla vista (IntersectionObserver);
 * - idle: dopo l'evento load, nel primo momento libero (es. carrello a cassetto: deve essere pronto prima del primo clic).
 *
 * Perché: uno <script type="module"> parte con priorità alta e compete con CSS, font e immagine LCP anche se la
 * section è in fondo alla pagina (e Lighthouse, in simulazione, lo conta come bloccante per FCP e LCP). I tag copiati
 * qui hanno fetchpriority="low". Lo stesso URL di un modulo viene scaricato ed eseguito una volta sola: se due section
 * usano lo stesso entrypoint, il secondo tag non fa nulla.
 *
 * Nel theme editor lo snippet stampa vite-tag direttamente (request.design_mode), quindi qui non serve gestire
 * shopify:section:load. Dopo un aggiornamento via Section Rendering basta richiamare initDeferredScripts(root).
 */

const NEAR_MARGIN = '100% 0px'; // uno schermo sopra e sotto la vista
const IDLE_TIMEOUT = 2000;

/** URL già inseriti (script e modulepreload), per non duplicare i tag. */
const inserted = new Set();

let observer;
/** Elemento osservato → template da attivare quando entra nel margine. */
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

function getObserver() {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        pending.get(entry.target)?.forEach(activate);
        pending.delete(entry.target);
      }
    },
    { rootMargin: NEAR_MARGIN },
  );
  return observer;
}

function whenIdle(callback) {
  const schedule = () =>
    'requestIdleCallback' in window
      ? requestIdleCallback(callback, { timeout: IDLE_TIMEOUT })
      : setTimeout(callback, 200);
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
}

/** Avvia il caricamento differito dei template in `root` (default: tutto il documento). */
export function initDeferredScripts(root = document) {
  const templates = root.querySelectorAll('template[data-deferred-script]:not([data-deferred-loaded])');
  const idle = [];

  for (const template of templates) {
    if (template.dataset.deferredScript === 'idle' || !('IntersectionObserver' in window)) {
      idle.push(template);
      continue;
    }
    // Si osserva la section che contiene il template (il <template> non ha dimensioni)
    const target = template.closest('.shopify-section') ?? template.parentElement;
    if (!target) continue;
    if (!pending.has(target)) {
      pending.set(target, []);
      getObserver().observe(target);
    }
    pending.get(target).push(template);
  }

  if (idle.length) whenIdle(() => idle.forEach(activate));
}
