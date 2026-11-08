/**
 * Anteprima rapida del prodotto — custom element <quick-view> (snippets/quick-view.liquid).
 *
 * show({ url, origin, label }) apre il <dialog> con showModal() e carica il contenuto con la Section
 * Rendering API (/products/<handle>?section_id=quick-view → sections/quick-view.liquid); nel frattempo
 * si vede lo scheletro con l'immagine della card. Dentro, <product-page> (frontend/scripts/product-page.js)
 * gestisce varianti, quantità e aggiunta al carrello come nella pagina prodotto.
 *
 * Effetto "warp": reinterpretazione originale dell'idea dell'esempio Motion+ "Warp overlay"
 * (https://motion.dev/examples/react-warp-overlay), di cui non si usa il codice.
 * - L'immagine della card (`origin`) si stacca e vola fino al riquadro media del pannello, piegandosi
 *   in prospettiva nella direzione del movimento e raddrizzandosi all'arrivo.
 * - Il pannello si espande dalla card con la stessa molla, deformato e inclinato, e si distende.
 * - Le informazioni compaiono quando il pannello è quasi in posizione; lo sfondo si scurisce.
 * - In chiusura il percorso inverso, verso la card se è ancora visibile (altrimenti dissolvenza).
 * Molle di Motion eseguite con WAAPI (motion/mini + spring): nessun motore di animazione JS nel bundle.
 * prefers-reduced-motion: apertura e chiusura immediate.
 *
 * I contenuti restano in cache per URL; prefetch(url) li richiede in anticipo (es. passando sul trigger).
 * Sul link alla pagina prodotto: l'immagine principale di quella pagina parte all'intenzione di cliccare, così
 * l'immagine condivisa delle transizioni tra pagine arriva già pronta (snippets/page-transitions.liquid).
 * Caricato da snippets/quick-view.liquid con {% render 'vite-tag', entry: 'quick-view.js' %}.
 */

import { animate } from 'motion/mini';
import { spring } from 'motion';
import { prefersReducedMotion } from '@/scripts/cart-api.js';
import '@/scripts/product-page.js';

const SECTION_ID = 'quick-view';
// Molla senza rimbalzo (smorzamento critico): il pannello passa dalla card a quasi tutto lo schermo, e anche un
// rimbalzo del 18% lo faceva crescere oltre la misura finale (~6px) e poi rimpicciolire, come uno scatto
const OPEN_SPRING = { type: spring, visualDuration: 0.5, bounce: 0 };
const CLOSE_TWEEN = { duration: 0.42, ease: [0.4, 0, 0.2, 1] };
const WARP_TIMING = { duration: 0.6, times: [0, 0.35, 1], ease: 'easeOut' };
const PERSPECTIVE = 1200; // px: distanza della camera per la piega
const BASE_TILT = 10; // gradi: in volo il pannello è sempre un po' inclinato, come un foglio sollevato
const DIRECTION_TILT = 22; // gradi massimi di inclinazione nella direzione del movimento
const DIRECTION_SKEW = 8; // gradi massimi di inclinazione laterale (skew)
// Immagine nel pannello (come in sections/quick-view.liquid): tessera intera sotto i 750px, a tutto riquadro da 750px
const PANEL_IMAGE_CLASS =
  'absolute inset-x-0 top-4 mx-auto h-[calc(100%-1rem)] w-auto max-w-full rounded-lg object-contain md:inset-0 md:size-full md:rounded-none md:object-cover';

const cache = new Map();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const centerOf = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

/** HTML della section quick-view per il prodotto `url` (una richiesta per URL; ritentata se fallisce). */
function load(url) {
  let request = cache.get(url);
  if (!request) {
    const sectionUrl = new URL(url, window.location.origin);
    sectionUrl.searchParams.set('section_id', SECTION_ID);
    request = fetch(sectionUrl).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });
    request.catch(() => cache.delete(url));
    cache.set(url, request);
  }
  return request;
}

const isOnScreen = (rect) =>
  rect.width > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;

/**
 * Piega per uno spostamento da `from` a `to` (rettangoli): inclinazione di base più rotazione e skew
 * nella direzione del movimento. Restituisce il transform per `amount` 0 (piatto) … 1 (piega massima);
 * le funzioni sono sempre le stesse, così il browser le interpola.
 */
function warp(from, to) {
  const a = centerOf(from);
  const b = centerOf(to);
  const nx = clamp((b.x - a.x) / window.innerWidth, -1, 1);
  const ny = clamp((b.y - a.y) / window.innerHeight, -1, 1);
  const rx = BASE_TILT - ny * DIRECTION_TILT;
  const ry = nx * DIRECTION_TILT;
  const kx = -nx * DIRECTION_SKEW;
  const ky = (-ny * DIRECTION_SKEW) / 2;
  return (amount) =>
    `perspective(${PERSPECTIVE}px) rotateX(${rx * amount}deg) rotateY(${ry * amount}deg) ` +
    `skew(${kx * amount}deg, ${ky * amount}deg)`;
}

/** translate + scale che portano il rettangolo `rect` (senza trasformazioni) sul rettangolo `target`. */
function flip(rect, target) {
  const a = centerOf(rect);
  const b = centerOf(target);
  return { translate: `${b.x - a.x}px ${b.y - a.y}px`, scale: `${target.width / rect.width} ${target.height / rect.height}` };
}

/** Raggi del riquadro `inner` dentro `outer`: arrotondati solo gli angoli che coincidono con quelli del contenitore. */
function cornerRadii(inner, outer, radius) {
  const near = (a, b) => Math.abs(a - b) < 1;
  const corner = (x, y) => (near(inner[x], outer[x]) && near(inner[y], outer[y]) ? radius : '0px');
  return `${corner('left', 'top')} ${corner('right', 'top')} ${corner('right', 'bottom')} ${corner('left', 'bottom')}`;
}

/** Immagine decorativa con la stessa sorgente già caricata di `image`. */
function copyImage(image, className) {
  const copy = new Image();
  copy.src = image.currentSrc || image.src;
  // Proporzioni note da subito: la tessera ha già la sua misura quando si calcola dove far atterrare il volo
  copy.width = image.naturalWidth;
  copy.height = image.naturalHeight;
  copy.alt = '';
  copy.className = className;
  return copy;
}

const rectFrame = (rect) => ({
  width: `${rect.width}px`,
  height: `${rect.height}px`,
  translate: `${rect.left}px ${rect.top}px`,
});

class QuickView extends HTMLElement {
  connectedCallback() {
    this.dialog = this.querySelector('dialog');
    this.backdrop = this.querySelector('[data-quick-view-backdrop]');
    this.panel = this.querySelector('[data-quick-view-panel]');
    this.content = this.querySelector('[data-quick-view-content]');
    this.skeleton = this.querySelector('template[data-quick-view-skeleton]');
    if (!this.dialog || !this.panel || !this.content || !this.skeleton) return;

    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.addEventListener('click', this.onClick, { signal });
    // Intenzione di aprire la pagina prodotto: pointerdown copre il tocco, che non ha un passaggio del puntatore
    for (const type of ['pointerover', 'pointerdown', 'focusin']) this.addEventListener(type, this.onDetailsIntent, { signal });
    // Esc: chiusura animata invece di quella immediata del browser
    this.dialog.addEventListener('cancel', this.onCancel, { signal });
    this.dialog.addEventListener('close', this.cleanup, { signal });
  }

  disconnectedCallback() {
    this.abort?.abort();
    if (this.dialog?.open) this.dialog.close();
    this.cleanup();
  }

  /** Richiede in anticipo il contenuto (es. puntatore sopra il trigger). */
  prefetch(url) {
    load(url).catch(() => {});
  }

  /**
   * Apre l'anteprima del prodotto `url`.
   * @param {object} options
   * @param {string} options.url        URL del prodotto (product.url)
   * @param {HTMLElement} [options.origin]  riquadro della card da cui parte l'animazione (con la sua <img>)
   * @param {string} [options.label]    nome accessibile del dialog finché il contenuto non è caricato
   */
  show({ url, origin = null, label = '' }) {
    if (!this.dialog || this.dialog.open) return;
    const request = (this.request = Symbol(url));
    this.origin = origin;

    this.dialog.removeAttribute('aria-labelledby');
    this.dialog.setAttribute('aria-label', label);
    this.content.replaceChildren(this.skeleton.content.cloneNode(true));
    const originImage = origin?.querySelector('img');
    const media = this.content.querySelector('[data-quick-view-media]');
    if (originImage && media) media.append(copyImage(originImage, PANEL_IMAGE_CLASS));

    this.dialog.showModal();
    // Il dialog è largo 100vw: la posizione del pannello non cambia quando, qualche fotogramma dopo (Lenis, vedi
    // frontend/styles/scroll-lock.css), la barra sparisce
    this.panelRect = this.panel.getBoundingClientRect();
    if (!prefersReducedMotion()) this.animateOpen(originImage, media);

    load(url)
      .then((html) => request === this.request && this.render(html))
      .catch(() => request === this.request && this.renderError(url));
  }

  /** Chiusura animata; la promise si risolve a dialog chiuso. */
  close() {
    if (!this.dialog?.open) return Promise.resolve();
    this.closing ??= this.animateClose()
      .catch(() => {})
      .then(() => this.dialog.close());
    return this.closing;
  }

  /** Chiamata da <product-page> dopo l'aggiunta al carrello: col carrello a cassetto l'anteprima lascia il posto. */
  afterAddToCart() {
    return document.querySelector('cart-drawer') ? this.close() : Promise.resolve();
  }

  /* ------------------------------------------------------------ Contenuto */

  render(html) {
    if (!this.dialog.open || this.closing) return;
    const root = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-quick-view-root]');
    if (!root) throw new Error('[quick-view] contenuto non trovato');

    // L'immagine della card resta sotto quella del prodotto finché questa non è caricata
    const placeholder = this.content.querySelector('[data-quick-view-media] img');
    const media = root.querySelector('[data-quick-view-media]');
    if (placeholder && media) media.prepend(placeholder);

    this.content.replaceChildren(root);

    const title = this.content.querySelector('[data-quick-view-title]');
    if (title) {
      title.id ||= `${this.id}-title`;
      this.dialog.removeAttribute('aria-label');
      this.dialog.setAttribute('aria-labelledby', title.id);
    }
    const info = this.content.querySelector('product-page > :last-child');
    if (info && !prefersReducedMotion()) animate(info, { opacity: [0, 1] }, { duration: 0.25 });
  }

  renderError(url) {
    if (!this.dialog.open || this.closing) return;
    const box = document.createElement('div');
    box.className = 'flex size-full flex-col items-center justify-center gap-4 p-8 text-center';
    const message = document.createElement('p');
    message.className = 'text-body text-foreground';
    message.setAttribute('role', 'alert');
    message.textContent = this.dataset.error;
    const link = document.createElement('a');
    link.className = 'button button-primary';
    link.href = url;
    link.textContent = this.dataset.viewProduct;
    box.append(message, link);
    this.content.replaceChildren(box);
  }

  /* ------------------------------------------------------------ Animazioni */

  animateOpen(originImage, media) {
    const from = this.origin?.getBoundingClientRect();
    animate(this.backdrop, { opacity: [0, 1] }, { duration: 0.3 });

    if (!from || !isOnScreen(from)) {
      animate(this.panel, { opacity: [0, 1], scale: [0.96, 1] }, { duration: 0.25, ease: 'easeOut' });
      return;
    }

    // Arrivo dell'immagine misurato prima di animare il pannello: dopo, le sue trasformazioni falserebbero la misura
    const landing = media && this.mediaFrame(media);
    const bend = warp(from, this.panelRect);
    const start = flip(this.panelRect, from);
    // Il pannello nasce dalla card: deformato e piegato, si distende con la molla
    const panelOpening = animate(
      this.panel,
      { translate: [start.translate, '0px 0px'], scale: [start.scale, '1 1'], transform: [bend(1), bend(0)] },
      OPEN_SPRING,
    );
    animate(this.panel, { opacity: [0, 1] }, { duration: 0.2 });
    animate(this.content, { opacity: [0, 1] }, { duration: 0.25, delay: 0.2 });

    if (!originImage || !media) return;
    const ghost = this.createGhost(originImage, from, getComputedStyle(this.origin).borderRadius);
    // La card "si stacca": nascosta (finché l'anteprima è aperta) appena la copia in volo è pronta
    ghost
      .querySelector('img')
      .decode()
      .catch(() => {})
      .then(() => this.dialog.open && !this.closing && this.origin && (this.origin.style.visibility = 'hidden'));

    const flight = animate(ghost, { ...this.frames(from, landing.rect), borderRadius: landing.radius }, OPEN_SPRING);
    animate(ghost, { transform: [bend(0), bend(1), bend(0)] }, WARP_TIMING);
    // La copia lascia il posto all'immagine vera a pannello fermo e sfumando: nessuno scatto anche se le due
    // immagini non coincidono al pixel (es. ritaglio object-cover diverso tra card e anteprima)
    Promise.all([flight, panelOpening])
      .then(() => ghost === this.ghost && animate(ghost, { opacity: [1, 0] }, { duration: 0.15, ease: 'easeOut' }))
      .catch(() => {})
      .then(() => ghost === this.ghost && this.removeGhost());
  }

  async animateClose() {
    if (prefersReducedMotion()) return;
    this.removeGhost();

    // Rettangolo del pannello senza trasformazioni (riletto se nel frattempo è cambiata la finestra)
    if (this.panel.getAnimations().length === 0) this.panelRect = this.panel.getBoundingClientRect();
    const to = this.origin?.isConnected ? this.origin.getBoundingClientRect() : null;
    const animations = [
      animate(this.backdrop, { opacity: 0 }, { duration: 0.3 }),
      animate(this.content, { opacity: 0 }, { duration: 0.12 }),
    ];

    if (!to || !isOnScreen(to)) {
      animations.push(animate(this.panel, { opacity: 0, scale: 0.96 }, { duration: 0.2, ease: 'easeIn' }));
      await Promise.all(animations);
      return;
    }

    const bend = warp(this.panelRect, to);
    const end = flip(this.panelRect, to);
    animations.push(
      animate(this.panel, { translate: end.translate, scale: end.scale, transform: [bend(0), bend(1)] }, CLOSE_TWEEN),
      animate(this.panel, { opacity: 0 }, { duration: 0.2, delay: 0.12 }),
    );

    // L'immagine del prodotto torna nella card (la variante scelta può averla cambiata)
    const media = this.content.querySelector('[data-quick-view-media]');
    const image = media?.querySelector('img:last-of-type');
    const start = image?.complete ? this.mediaFrame(media) : null;
    // Su mobile il pannello scorre: con l'immagine già uscita in alto la copia partirebbe da fuori dal pannello
    if (start && start.rect.top >= this.panelRect.top - 1) {
      const ghost = this.createGhost(image, start.rect, start.radius);
      animations.push(
        animate(ghost, { ...this.frames(start.rect, to), borderRadius: getComputedStyle(this.origin).borderRadius }, CLOSE_TWEEN),
        animate(ghost, { transform: [bend(0), bend(1), bend(0)] }, { ...WARP_TIMING, duration: CLOSE_TWEEN.duration }),
      );
    }
    await Promise.all(animations);
  }

  /** Riquadro e raggi dell'immagine nel pannello: la tessera sotto i 750px, tutto il riquadro media da 750px. */
  mediaFrame(media) {
    const image = media.querySelector('img:last-of-type');
    const rect = (image ?? media).getBoundingClientRect();
    const radius = image ? getComputedStyle(image).borderTopLeftRadius : '0px';
    if (radius !== '0px') return { rect, radius };
    return { rect, radius: cornerRadii(rect, this.panelRect, getComputedStyle(this.panel).borderTopLeftRadius) };
  }

  /** Posizione e dimensioni dell'immagine in volo, da `from` a `to`. */
  frames(from, to) {
    const a = rectFrame(from);
    const b = rectFrame(to);
    return { width: [a.width, b.width], height: [a.height, b.height], translate: [a.translate, b.translate] };
  }

  createGhost(image, rect, radius) {
    this.removeGhost();
    const ghost = document.createElement('div');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.className = 'pointer-events-none fixed top-0 left-0 z-10 overflow-hidden bg-surface shadow-500';
    Object.assign(ghost.style, rectFrame(rect), { borderRadius: radius });
    ghost.append(copyImage(image, 'size-full object-cover'));
    this.dialog.append(ghost);
    this.ghost = ghost;
    return ghost;
  }

  removeGhost() {
    this.ghost?.remove();
    this.ghost = null;
  }

  /* -------------------------------------------------------------- Eventi */

  onClick = (event) => {
    if (event.target.closest('[data-quick-view-close], [data-quick-view-backdrop]')) this.close();
  };

  onCancel = (event) => {
    event.preventDefault();
    this.close();
  };

  /** Scarica l'immagine principale della pagina prodotto (una volta sola per variante: il template viene consumato). */
  onDetailsIntent = (event) => {
    const part = event.target.closest?.('[data-product-part="details-link"]');
    const template = part?.querySelector('template[data-quick-view-preload]');
    if (template && event.target.closest('a')) template.replaceWith(template.content);
  };

  /** Dialog chiuso (anche dal browser senza animazione): stato iniziale, card di nuovo visibile. */
  cleanup = () => {
    this.request = null;
    this.closing = null;
    this.removeGhost();
    if (this.origin) this.origin.style.visibility = '';
    this.origin = null;
    for (const element of [this.panel, this.content, this.backdrop]) {
      element?.getAnimations().forEach((animation) => animation.cancel());
      element?.removeAttribute('style');
    }
    this.content?.replaceChildren();
  };
}

if (!customElements.get('quick-view')) {
  customElements.define('quick-view', QuickView);
}
