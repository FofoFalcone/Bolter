/**
 * Galleria della pagina prodotto — custom element <product-media> (sections/main-product.liquid).
 *
 * Sta dentro la parte [data-product-part="media"]: al cambio variante viene sostituita e si reinizializza da sola.
 * - Carosello (sotto i 990px, e anche sopra con il layout a miniature): contatore, frecce e miniature seguono
 *   l'elemento al centro. Lo scorrimento resta nativo.
 * - Clic su un'immagine: lightbox (frontend/scripts/product-lightbox.js). Il codice si scarica all'intenzione di aprirlo
 *   (puntatore sopra, tocco o focus), così al clic è già pronto; se non arriva si apre l'immagine stessa.
 * - Video e modelli 3D (snippets/product-media-item.liquid): il player si inserisce al clic. Ne gira uno solo alla
 *   volta e si ferma quando esce dalla vista (linee guida Shopify sui media). YouTube e Vimeo si fermano con
 *   postMessage: i loro iframe accettano i comandi perché Shopify li genera con l'API attiva.
 * - Modelli 3D: <model-viewer> e "Vedi nel tuo spazio" sono funzioni di Shopify, caricate con Shopify.loadFeatures solo
 *   se il prodotto ne ha.
 *
 * Senza JS i pulsanti non si vedono (js:…), i video sono in <noscript> e la galleria si scorre comunque.
 */

import { prefersReducedMotion } from './cart-api.js';
import { watchCenteredItem } from './centered-item.js';

const MODEL_VIEWER_UI_CSS = 'https://cdn.shopify.com/shopifycloud/model-viewer-ui/assets/v1.0/model-viewer-ui.css';
const YOUTUBE_PAUSE = '{"event":"command","func":"pauseVideo","args":""}';
const VIMEO_PAUSE = '{"method":"pause"}';
const VISIBLE_RATIO = 0.5; // Sotto questa quota in vista, il video si ferma

const loadLightbox = () => import('./product-lightbox.js');

/** Una funzione di Shopify (window.Shopify.loadFeatures, da content_for_header). */
function loadFeature(name) {
  return new Promise((resolve, reject) => {
    if (!window.Shopify?.loadFeatures) {
      reject(new Error(`Shopify.loadFeatures non disponibile (${name})`));
      return;
    }
    window.Shopify.loadFeatures([{ name, version: '1.0', onLoad: (errors) => (errors ? reject(errors[0]) : resolve()) }]);
  });
}

function loadModelViewerStyles() {
  if (document.querySelector(`link[href="${MODEL_VIEWER_UI_CSS}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = MODEL_VIEWER_UI_CSS;
  document.head.append(link);
}

class ProductMedia extends HTMLElement {
  connectedCallback() {
    this.abort = new AbortController();
    const { signal } = this.abort;
    this.list = this.querySelector('[data-media-list]');
    this.counter = this.querySelector('[data-media-counter]');
    this.previousButton = this.querySelector('[data-media-previous]');
    this.nextButton = this.querySelector('[data-media-next]');
    this.thumbs = Array.from(this.querySelectorAll('[data-media-thumb]'));
    this.xrButton = this.querySelector('[data-shopify-xr]');
    this.items = Array.from(this.list?.children ?? []);
    this.modelUis = new Map();
    this.index = 0;

    this.addEventListener('click', this.onClick, { signal });
    for (const type of ['pointerover', 'pointerdown', 'focusin']) this.addEventListener(type, this.onIntent, { signal });
    // `play` non risale il DOM ma si cattura
    this.addEventListener('play', this.onPlay, { signal, capture: true });

    if (this.items.length > 1) this.itemObserver = watchCenteredItem(this.list, (index) => this.setIndex(index));
    if (this.xrButton) this.setupXr();
  }

  disconnectedCallback() {
    this.abort.abort();
    this.itemObserver?.disconnect();
    this.playerObserver?.disconnect();
    this.lightbox?.destroy();
    this.lightbox = null;
  }

  /* ------------------------------------------------------------------ Carosello */

  setIndex(index) {
    this.index = index;
    if (this.counter) this.counter.textContent = String(index + 1);
    this.previousButton?.setAttribute('aria-disabled', String(index === 0));
    this.nextButton?.setAttribute('aria-disabled', String(index === this.items.length - 1));
    this.thumbs.forEach((thumb, position) => thumb.setAttribute('aria-current', String(position === index)));
    // "Vedi nel tuo spazio" apre il modello in vista, altrimenti il primo (linee guida Shopify)
    const modelId = this.items[index]?.dataset.modelId;
    if (modelId && this.xrButton) this.xrButton.setAttribute('data-shopify-model3d-id', modelId);
  }

  scrollToItem(index) {
    const item = this.items[index];
    if (!item) return;
    const itemRect = item.getBoundingClientRect();
    const listRect = this.list.getBoundingClientRect();
    const offset = itemRect.left + itemRect.width / 2 - (listRect.left + listRect.width / 2);
    this.list.scrollBy({ left: offset, behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
  }

  /* ------------------------------------------------------------------ Video e 3D */

  activate(button) {
    const holder = button.parentElement;
    const player = holder.querySelector('template[data-media-player]')?.content.firstElementChild?.cloneNode(true);
    const element = player?.firstElementChild;
    if (!element) return;

    this.pauseAll();
    // L'iframe parte da solo: il clic è già la scelta del cliente. Nel frammento non ha ancora caricato nulla
    if (element.matches('iframe')) {
      const url = new URL(element.src);
      url.searchParams.set('autoplay', '1');
      element.src = url;
      if (!/autoplay/.test(element.allow)) element.allow = `${element.allow}; autoplay`;
    }

    holder.append(player);
    button.remove();
    this.observePlayer(element);

    if (element.matches('video')) element.play().catch(() => {}); // Rifiutato dal browser: restano i controlli nativi
    if (element.matches('model-viewer')) this.setupModel(element);
    element.focus({ preventScroll: true });
  }

  observePlayer(element) {
    this.playerObserver ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio < VISIBLE_RATIO) this.pause(entry.target);
        }
      },
      { threshold: [0, VISIBLE_RATIO] },
    );
    this.playerObserver.observe(element);
  }

  pause(element) {
    if (element.matches('video')) {
      element.pause();
    } else if (element.matches('iframe')) {
      const { origin, hostname } = new URL(element.src);
      if (hostname.includes('youtube')) element.contentWindow?.postMessage(YOUTUBE_PAUSE, origin);
      else if (hostname.includes('vimeo')) element.contentWindow?.postMessage(VIMEO_PAUSE, origin);
    } else {
      this.modelUis.get(element)?.pause();
    }
  }

  pauseAll(except = null) {
    this.querySelectorAll('[data-media-list] :is(video, iframe, model-viewer)').forEach((element) => {
      if (element !== except) this.pause(element);
    });
  }

  async setupModel(element) {
    loadModelViewerStyles();
    try {
      await loadFeature('model-viewer-ui');
      if (element.isConnected) this.modelUis.set(element, new window.Shopify.ModelViewerUI(element));
    } catch (error) {
      console.error('[product-media] visualizzatore 3D non disponibile', error);
    }
  }

  async setupXr() {
    const models = this.querySelector('[data-product-models]');
    try {
      await loadFeature('shopify-xr');
      const addModels = () => {
        window.ShopifyXR.addModels(JSON.parse(models.textContent));
        window.ShopifyXR.setupXRElements();
      };
      if (window.ShopifyXR) addModels();
      else document.addEventListener('shopify_xr_initialized', addModels, { once: true, signal: this.abort.signal });
    } catch (error) {
      console.error('[product-media] realtà aumentata non disponibile', error); // Il pulsante resta nascosto
    }
  }

  /* --------------------------------------------------------------------- Eventi */

  onPlay = (event) => this.pauseAll(event.target);

  onIntent = (event) => {
    if (event.target.closest?.('[data-media-open]')) loadLightbox().catch(() => {});
  };

  onClick = (event) => {
    const target = event.target;
    const play = target.closest('[data-media-play]');
    if (play) return this.activate(play);

    const thumb = target.closest('[data-media-thumb]');
    if (thumb) return this.scrollToItem(Number(thumb.dataset.mediaThumb));

    if (target.closest('[data-media-previous]')) return this.scrollToItem(this.index - 1);
    if (target.closest('[data-media-next]')) return this.scrollToItem(this.index + 1);

    const open = target.closest('[data-media-open]');
    if (open) this.openLightbox(open);
    return undefined;
  };

  async openLightbox(trigger) {
    this.pauseAll();
    try {
      const { ProductLightbox } = await loadLightbox();
      if (!this.isConnected) return;
      this.lightbox ??= new ProductLightbox(this);
      this.lightbox.open(Number(trigger.dataset.mediaOpen));
    } catch (error) {
      console.error('[product-media] lightbox non disponibile', error);
      const image = trigger.parentElement.querySelector('img');
      if (image) window.location.assign(image.currentSrc || image.src);
    }
  }
}

if (!customElements.get('product-media')) {
  customElements.define('product-media', ProductMedia);
}
