/**
 * Standard storefront events and actions (Shopify, giugno 2026).
 * Doc: https://shopify.dev/docs/api/storefront-events-and-actions
 *
 * Il tema EMETTE eventi DOM standard (shopify:…) per le interazioni commerciali, così app e agenti
 * li ascoltano senza leggere il markup o intercettare fetch. Il tema CONFIGURA le azioni
 * (Shopify.actions.updateCart / openCart) che app e agenti chiamano.
 *
 * - Libreria ufficiale caricata dal CDN Shopify (import dinamico: niente import map né bundling).
 *   Se non si carica, il tema funziona comunque: gli eventi semplicemente non vengono emessi.
 * - <s-view-event>: custom element ufficiale per gli eventi di visualizzazione
 *   (shopify:product:view, shopify:cart:view, shopify:collection:view), payload dal filtro Liquid
 *   `standard_event_data`.
 * - In sviluppo: `npm run start:events` (watch + theme dev con --standard-events-inspector).
 */

import { announceCartStatus, refreshCartSections } from './cart-api.js';

const STANDARD_EVENTS_URL = 'https://cdn.shopify.com/storefront/standard-events.js';

let libraryPromise;

/** Carica (una sola volta) la libreria ufficiale degli eventi standard. Restituisce null se non disponibile. */
export function loadStandardEvents() {
  libraryPromise ??= import(/* @vite-ignore */ STANDARD_EVENTS_URL).catch((error) => {
    console.warn('[standard-events] libreria non caricata: eventi standard disattivati', error);
    return null;
  });
  return libraryPromise;
}

/** Registra <s-view-event> (eventi di visualizzazione dichiarati nel Liquid). */
async function defineViewEventElement() {
  const SE = await loadStandardEvents();
  if (SE?.createViewEventElement && !customElements.get('s-view-event')) {
    customElements.define('s-view-event', SE.createViewEventElement());
  }
}

/** shopify:page:view — una volta per pagina, sul document, a documento pronto. */
async function dispatchPageView() {
  const SE = await loadStandardEvents();
  if (!SE?.PageViewEvent) return;
  const dispatch = () =>
    document.dispatchEvent(
      new SE.PageViewEvent({
        page: {
          template: document.documentElement.dataset.template ?? '',
          title: document.title,
          url: window.location.href,
        },
      }),
    );
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', dispatch, { once: true });
  else dispatch();
}

const errorCodeFor = (error) => (error?.data?.status === 422 ? 'INVALID' : 'SERVICE_UNAVAILABLE');

/** Una risposta HTTP 4xx dell'Ajax Cart API è una modifica rifiutata (userErrors), non un guasto della richiesta. */
const isDeclined = (error) => typeof error?.data?.status === 'number' && error.data.status < 500;

/**
 * Esegue un'operazione sul carrello avvolta nell'evento standard corrispondente:
 * l'evento parte PRIMA della richiesta con una promise che si risolve con il carrello aggiornato,
 * oppure con userErrors (modifica rifiutata), oppure si rifiuta + shopify:cart:error (richiesta fallita).
 *
 * @param {object} options
 * @param {EventTarget} options.target    elemento da cui emettere (prodotto, carrello, cassetto)
 * @param {'CartLinesUpdateEvent'|'CartNoteUpdateEvent'|'CartDiscountUpdateEvent'|'CartAttributesUpdateEvent'} options.eventClass
 * @param {object} options.payload        payload dell'evento senza `promise`
 * @param {() => Promise<object>} options.run  operazione (risposta dell'Ajax Cart API)
 * @param {() => Promise<object>} [options.getCart]  carrello Ajax aggiornato, se `run` non lo restituisce
 */
export async function withCartEvent({ target, eventClass, payload, run, getCart }) {
  const SE = await loadStandardEvents();
  const EventClass = SE?.[eventClass];
  const deferred = EventClass?.createPromise();
  if (deferred) target.dispatchEvent(new EventClass({ ...payload, promise: deferred.promise }));

  try {
    const result = await run();
    if (deferred) {
      const ajaxCart = getCart ? await getCart() : result;
      deferred.resolve({ cart: EventClass.createCartFromAjaxResponse(ajaxCart), userErrors: [], warnings: [] });
    }
    return result;
  } catch (error) {
    if (deferred) {
      if (isDeclined(error)) {
        const ajaxCart = await fetchAjaxCart().catch(() => null);
        deferred.resolve({
          cart: ajaxCart ? EventClass.createCartFromAjaxResponse(ajaxCart) : null,
          userErrors: [{ code: errorCodeFor(error), field: [], message: error.message }],
          warnings: [],
        });
      } else {
        if (SE?.CartErrorEvent) {
          target.dispatchEvent(new SE.CartErrorEvent({ error: error.message, code: errorCodeFor(error) }));
        }
        deferred.reject(error);
      }
    }
    throw error;
  }
}

export async function fetchAjaxCart() {
  const response = await fetch(`${window.Shopify?.routes?.root ?? '/'}cart.js`, {
    headers: { Accept: 'application/json' },
  });
  return response.json();
}

/**
 * shopify:product:select — al cambio delle opzioni prodotto. La promise si risolve con la variante
 * calcolata dal server (`resolveVariant`), oppure null se la combinazione non esiste.
 */
export async function withProductSelectEvent({ target, product, selectedOptions, resolveVariant }) {
  const SE = await loadStandardEvents();
  const deferred = SE?.ProductSelectEvent?.createPromise();
  if (deferred) target.dispatchEvent(new SE.ProductSelectEvent({ product, selectedOptions, promise: deferred.promise }));
  try {
    const variant = await resolveVariant();
    deferred?.resolve({ variant: variant ?? null });
    return variant;
  } catch (error) {
    deferred?.reject(error);
    throw error;
  }
}

/**
 * shopify:collection:update — al cambio di filtri o ordinamento di una collezione (dal form dei filtri).
 * La promise si risolve con il numero di prodotti trovati dopo la richiesta (`run` lo restituisce),
 * oppure si rifiuta se l'aggiornamento fallisce (anche se superato da una modifica successiva).
 *
 * @param {object} options
 * @param {EventTarget} options.target   form dei filtri
 * @param {object} options.payload       { collection, productFilters?, sortKey? } senza `promise`
 * @param {() => Promise<number>} options.run  aggiornamento; restituisce i prodotti trovati
 */
export async function withCollectionUpdateEvent({ target, payload, run }) {
  const SE = await loadStandardEvents();
  const deferred = SE?.CollectionUpdateEvent?.createPromise();
  if (deferred) target.dispatchEvent(new SE.CollectionUpdateEvent({ ...payload, promise: deferred.promise }));
  try {
    const productsCount = await run();
    deferred?.resolve({ productsCount });
    return productsCount;
  } catch (error) {
    deferred?.reject(error);
    throw error;
  }
}

/**
 * shopify:search:update — ricerca inviata o filtri/ordinamento cambiati sui risultati (dal form della ricerca o
 * dei filtri). La promise si risolve con il numero di risultati (`totalCount`, come da specifica) oppure si
 * rifiuta se la ricerca fallisce (anche se superata da una modifica successiva).
 *
 * @param {object} options
 * @param {EventTarget} options.target   form della ricerca o dei filtri
 * @param {object} options.payload       { search: { query, productFilters?, sortKey } } senza `promise`
 * @param {() => Promise<number>} options.run  ricerca; restituisce i risultati trovati
 */
export async function withSearchUpdateEvent({ target, payload, run }) {
  const SE = await loadStandardEvents();
  const deferred = SE?.SearchUpdateEvent?.createPromise();
  if (deferred) target.dispatchEvent(new SE.SearchUpdateEvent({ ...payload, promise: deferred.promise }));
  try {
    const totalCount = await run();
    deferred?.resolve({ totalCount });
    return totalCount;
  } catch (error) {
    deferred?.reject(error);
    throw error;
  }
}

/**
 * Riscontro di una modifica al carrello arrivata da fuori (Shopify.actions.updateCart):
 * - carrello in vista (cassetto aperto o pagina carrello): il contenuto è già cambiato sotto gli occhi del cliente,
 *   basta l'annuncio nella regione live del carrello;
 * - altrimenti cambia solo il contatore dell'header: toast "Carrello aggiornato" con il link al carrello.
 * toast.js (e Motion) si caricano solo qui, fuori dal bundle globale.
 */
function notifyExternalCartUpdate() {
  const element = document.querySelector('cart-drawer');
  // Solo se il custom element è già definito (cart.js caricato): altrimenti il link porta alla pagina carrello
  const drawer = typeof element?.open === 'function' ? element : null;
  const message = document.querySelector('[data-cart-status]')?.dataset.updated;
  if (element?.querySelector('dialog')?.open || document.documentElement.dataset.template === 'cart') {
    if (message) announceCartStatus(message);
    return;
  }
  import('./toast.js')
    .then(({ showCartUpdatedToast }) => showCartUpdatedToast(drawer))
    .catch(() => {});
}

/**
 * Configura le azioni standard. Chiamata dal listener DOMContentLoaded dichiarato nel layout PRIMA di
 * {{ content_for_header }} (come richiesto da Shopify), così la configurazione precede il codice delle app.
 * Solo la prima configure() di ogni azione ha effetto.
 */
export function configureStorefrontActions() {
  const actions = window.Shopify?.actions;
  if (!actions) return;

  // updateCart (chiamata da app/agenti, mai dal tema): Shopify scrive il carrello ed emette da sé gli eventi cart:*;
  // il tema aggiorna header, cassetto e pagina carrello senza ricaricare e senza emettere eventi doppi, poi dice al
  // cliente cosa è cambiato (gli agenti WebMCP lavorano nella sua scheda).
  actions.updateCart?.configure?.({
    eventTarget: () => document.querySelector('cart-items'),
    async handler(defaultHandler) {
      const result = await defaultHandler();
      await refreshCartSections();
      notifyExternalCartUpdate();
      return { ...result, detail: { ...result?.detail, handledBy: 'theme' } };
    },
  });

  // openCart: il cassetto se attivo, altrimenti la pagina carrello.
  actions.openCart?.configure?.({
    handler() {
      const drawer = document.querySelector('cart-drawer');
      if (drawer?.open) drawer.open();
      else window.location.href = `${window.Shopify?.routes?.root ?? '/'}cart`;
    },
  });
}

/** Avvio: chiamato da theme.js su ogni pagina. */
export function initStandardEvents() {
  window.bolterTheme = { ...window.bolterTheme, configureStorefrontActions };
  loadStandardEvents();
  defineViewEventElement();
  dispatchPageView();

  // Pagina ripristinata dalla back/forward cache (pulsante "indietro"): il carrello può essere cambiato
  // nel frattempo (es. articoli rimossi nella pagina carrello) → riallinea header e carrelli.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) refreshCartSections().catch(() => {});
  });
}
