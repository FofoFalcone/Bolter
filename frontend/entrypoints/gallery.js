/**
 * Galleria animata — custom element <animated-gallery> (sections/gallery.liquid).
 *
 * Otto disposizioni 3D con trascinamento e inerzia, frecce, tastiera, scorrimento orizzontale del
 * trackpad e apertura dell'elemento dentro la galleria. Le molle usano la fisica di Motion
 * (frontend/scripts/spring-value.js): si interrompono afferrando di nuovo la galleria e partono con
 * la velocità del trascinamento.
 *
 * Disposizioni: un entrypoint ciascuna (frontend/entrypoints/gallery-<nome>.js, base comune in
 * frontend/scripts/gallery-arrangements.js), importato qui in modo dinamico. La section stampa anche il
 * vite-tag della disposizione scelta, così il file si scarica insieme a questo e l'import non aggiunge
 * richieste; nel theme editor, se cambia la disposizione, l'import lo scarica al momento.
 * Finché la disposizione non è pronta resta visibile solo il primo elemento (gallery.css, data-ready).
 *
 * - Senza JS: carosello nativo con scroll-snap (markup della section).
 * - prefers-reduced-motion: stesse disposizioni, ma ogni spostamento è immediato (niente molle
 *   né inerzia) e i video non partono da soli.
 * - Griglia ripetuta: le celle oltre la prima copia sono cloni degli elementi (aria-hidden,
 *   fuori dall'ordine di tabulazione), ricreati quando cambia la dimensione della scena.
 * - Theme editor: la selezione di un blocco porta in primo piano l'elemento corrispondente.
 * - Card prodotto: il clic sulla card in primo piano apre l'anteprima rapida (<quick-view> della section,
 *   frontend/entrypoints/quick-view.js) partendo dalla card; il contenuto viene richiesto in anticipo
 *   quando il puntatore o il focus arrivano sulla card in primo piano.
 *
 * Caricato dalla section con {% render 'vite-tag', entry: 'gallery.js' %}.
 */

import { frame } from 'motion';
import { normalizeIndex } from '@/scripts/gallery-arrangements.js';
import { SpringValue } from '@/scripts/spring-value.js';

// Percorsi letterali: Vite risolve gli import dinamici solo se il nome del file è scritto per intero
const ARRANGEMENTS = {
  list: () => import('./gallery-list.js'),
  grid: () => import('./gallery-grid.js'),
  coverflow: () => import('./gallery-coverflow.js'),
  stack: () => import('./gallery-stack.js'),
  barrel: () => import('./gallery-barrel.js'),
  ring: () => import('./gallery-ring.js'),
  helix: () => import('./gallery-helix.js'),
  sphere: () => import('./gallery-sphere.js'),
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const SPRING = { stiffness: 260, damping: 34, restDelta: 0.001, restSpeed: 0.01 };
const OPEN_SPRING = { stiffness: 320, damping: 36, restDelta: 0.001 };
const DRAG_THRESHOLD = 6; // px prima che un clic diventi un trascinamento
const WHEEL_SETTLE = 140; // ms dopo l'ultimo evento wheel prima di allineare l'elemento più vicino
const DIM_WHEN_OPEN = 0.85; // quanto si attenuano gli altri elementi mentre uno è aperto
const BASE_POSE = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, opacity: 1 };
const FOCUSABLE = 'a[href], button, input, select, textarea';

const mix = (from, to, progress) => from + (to - from) * progress;

function mixPose(from, to, progress) {
  const pose = {};
  for (const key in BASE_POSE) pose[key] = mix(from[key], to[key], progress);
  return pose;
}

function applyPose(element, pose) {
  element.style.transform =
    `translate3d(${pose.x}px, ${pose.y}px, ${pose.z}px) ` +
    `rotateY(${pose.ry}deg) rotateX(${pose.rx}deg) rotateZ(${pose.rz}deg) scale(${pose.scale})`;
  element.style.opacity = pose.opacity;
  element.style.visibility = pose.opacity < 0.01 ? 'hidden' : '';
}

/**
 * Copia di un elemento (griglia ripetuta, lista e coverflow con ciclo): decorativa, cliccabile ma non
 * raggiungibile da tastiera. Nelle disposizioni lineari l'originale è sempre la card più vicina al centro.
 */
function makeClone(item) {
  const clone = item.cloneNode(true);
  for (const attribute of Array.from(clone.attributes)) {
    if (attribute.name.startsWith('data-shopify')) clone.removeAttribute(attribute.name);
  }
  clone.removeAttribute('data-active');
  clone.setAttribute('aria-hidden', 'true');
  // Lo standard event shopify:product:view vale per la card originale, non per le copie
  clone.querySelectorAll('s-view-event').forEach((event) => event.replaceWith(...event.childNodes));
  clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  clone.querySelectorAll(FOCUSABLE).forEach((control) => (control.tabIndex = -1));
  // Colori delle card prodotto: le copie non devono condividere il gruppo di radio dell'originale
  clone.querySelectorAll('input').forEach((input) => {
    input.disabled = true;
    input.removeAttribute('name');
  });
  clone.querySelectorAll('video').forEach((video) => {
    video.removeAttribute('autoplay');
    video.controls = false;
  });
  return clone;
}

class AnimatedGallery extends HTMLElement {
  connectedCallback() {
    this.stage = this.querySelector('[data-gallery-stage]');
    this.plane = this.querySelector('[data-gallery-plane]');
    this.items = Array.from(this.querySelectorAll('[data-gallery-item]'));
    const configScript = this.querySelector('[data-gallery-config]');
    if (!this.stage || !this.plane || !configScript || this.items.length === 0) return;

    this.config = JSON.parse(configScript.textContent);
    const name = this.config.arrangement in ARRANGEMENTS ? this.config.arrangement : 'list';
    this.abort = new AbortController();
    const signal = this.abort.signal;

    ARRANGEMENTS[name]().then(({ default: arrangement }) => {
      // Section rimossa o ricaricata dal theme editor nel frattempo
      if (signal.aborted) return;
      this.init(arrangement, this.config.options[name] ?? {}, signal);
    });
  }

  init(arrangement, options, signal) {
    this.arrangement = arrangement;
    this.options = options;
    this.elements = this.items;
    this.clones = [];
    this.videos = this.items.map((item) => item.querySelector('video'));
    this.videos.forEach((video) => video && (video.controls = false));
    this.initialized = false;
    this.focusIndex = 0;
    this.openElement = null; // indice in this.elements dell'elemento aperto (o in chiusura)
    this.isOpen = false;
    this.inView = false;

    // Pausa dei video (WCAG 2.2.2): scelta dell'utente valida per tutta la galleria; con movimento ridotto in pausa
    this.videoToggle = this.querySelector('[data-gallery-video-toggle]');
    this.setVideosPaused(reducedMotion.matches);

    this.closeButton = this.querySelector('[data-gallery-close]');
    this.counter = this.querySelector('[data-gallery-counter]');
    this.status = this.querySelector('[data-gallery-status]');
    this.caption = this.querySelector('[data-gallery-caption]');
    this.link = this.querySelector('[data-gallery-link]');

    this.u = new SpringValue(0, this.requestRender);
    this.v = new SpringValue(0, this.requestRender);
    this.openProgress = new SpringValue(0, this.requestRender);

    this.stage.addEventListener('pointerdown', this.onPointerDown, { signal });
    this.stage.addEventListener('pointermove', this.onPointerMove, { signal });
    this.stage.addEventListener('pointerup', this.onPointerUp, { signal });
    this.stage.addEventListener('pointercancel', this.onPointerUp, { signal });
    this.stage.addEventListener('dragstart', (event) => event.preventDefault(), { signal });
    this.stage.addEventListener('wheel', this.onWheel, { passive: false, signal });
    this.addEventListener('click', this.onClickCapture, { capture: true, signal });
    this.addEventListener('click', this.onClick, { signal });
    this.addEventListener('keydown', this.onKeyDown, { signal });
    this.addEventListener('pointerover', this.onIntent, { signal });
    this.addEventListener('focusin', this.onIntent, { signal });
    document.addEventListener('shopify:block:select', this.onBlockSelect, { signal });

    // Misure dal ResizeObserver, mai lette all'avvio: la prima notifica arriva dopo il primo layout e prima
    // del disegno (la galleria compare già disposta, come con una misura immediata), e le dimensioni vengono
    // dalle entry, non da offsetWidth/clientWidth: niente layout forzato nemmeno se un altro observer della
    // pagina ha appena scritto stili (es. --header-height di header.js). Si osserva anche il primo elemento,
    // la cui misura dà larghezza e altezza di tutti.
    this.size = { width: 0, height: 0, stageWidth: 0, stageHeight: 0 };
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.stage);
    this.resizeObserver.observe(this.items[0]);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.inView = entry.isIntersecting;
      this.updateVideos();
    });
    this.intersectionObserver.observe(this);
  }

  disconnectedCallback() {
    this.abort?.abort();
    [this.u, this.v, this.openProgress].forEach((value) => value?.stop());
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    clearTimeout(this.wheelTimer);
    clearTimeout(this.statusTimer);
    this.clones?.forEach((clone) => clone.remove());
  }

  /* ------------------------------------------------------------ Misure e resa */

  /**
   * Dimensioni dalle entry del ResizeObserver (arrivano solo quelle cambiate: le altre restano in this.size).
   * Arrotondate come offsetWidth (primo elemento, bordo compreso) e clientWidth (scena: senza bordi né padding,
   * overflow-clip senza barra di scorrimento, quindi coincide con il content box). Ripiego sulle proprietà
   * del DOM solo nei browser senza borderBoxSize/contentBoxSize.
   */
  onResize = (entries) => {
    for (const entry of entries) {
      if (entry.target === this.stage) {
        const box = entry.contentBoxSize?.[0];
        this.size.stageWidth = box ? Math.round(box.inlineSize) : this.stage.clientWidth;
        this.size.stageHeight = box ? Math.round(box.blockSize) : this.stage.clientHeight;
      } else {
        const box = entry.borderBoxSize?.[0];
        this.size.width = box ? Math.round(box.inlineSize) : entry.target.offsetWidth;
        this.size.height = box ? Math.round(box.blockSize) : entry.target.offsetHeight;
      }
    }
    this.measure();
  };

  /** Aggiorna il contesto dalle misure di elementi e scena; alla prima misura valida imposta lo stato iniziale. */
  measure() {
    const { width, height, stageWidth, stageHeight } = this.size;
    if (!width) return; // section nascosta: riprova il ResizeObserver quando diventa visibile

    const ctx = {
      count: this.items.length,
      width,
      height,
      gap: this.config.gap,
      room: this.config.room,
      loop: this.config.loop,
      stageWidth,
      stageHeight,
      options: this.options,
    };
    ctx.layout = this.arrangement.prepare?.(ctx) ?? {};
    this.ctx = ctx;
    // La prospettiva (CSS: dipende dalla larghezza dell'elemento) serve solo con un elemento aperto:
    // si rilegge alla prossima apertura, non a ogni misura (getComputedStyle forzerebbe il ricalcolo degli stili)
    this.perspective = null;
    this.stage.style.touchAction = this.arrangement.touchAction(ctx);
    this.syncClones();

    if (!this.initialized) {
      this.initialized = true;
      const initial = this.arrangement.initial(ctx);
      this.u.jump(initial.u);
      this.v.jump(initial.v);
      this.setFocus(this.arrangement.focusOf(initial, ctx), false);
      this.render();
      this.toggleAttribute('data-ready', true);
      // Blocco selezionato nel theme editor prima della prima misura
      if (this.pendingBlockIndex != null) this.goTo(this.pendingBlockIndex);
      this.pendingBlockIndex = null;
      return;
    }
    this.requestRender();
  }

  syncClones() {
    const cells = this.ctx.layout.cells;
    const needed = cells ? cells.length - this.items.length : 0;
    if (needed === this.clones.length) return;

    this.clones.forEach((clone) => clone.remove());
    this.clones = [];
    for (let element = this.items.length; element < this.items.length + needed; element++) {
      const clone = makeClone(this.items[cells[element].item]);
      this.plane.append(clone);
      this.clones.push(clone);
    }
    this.elements = [...this.items, ...this.clones];
  }

  requestRender = () => {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    frame.render(this.render);
  };

  render = () => {
    this.renderScheduled = false;
    const { arrangement, ctx } = this;
    if (!ctx) return;

    const state = this.state();
    const progress = this.openProgress.get();
    ctx.open =
      this.openElement !== null && progress > 0
        ? { element: this.openElement, progress, scale: this.openScale }
        : null;
    // Solo se la scena è cambiata di misura con un elemento aperto: lettura prima delle scritture di questa resa
    if (ctx.open && this.perspective === null) this.perspective = this.readPerspective();

    // Rotazione della scena (camera): si annulla mentre un elemento si apre, così resta frontale
    const plane = { rx: 0, ry: 0, rz: 0, pivot: 0, ...arrangement.plane?.(ctx) };
    const keep = 1 - progress;
    this.plane.style.transform =
      `translateZ(${-plane.pivot}px) rotateX(${plane.rx * keep}deg) rotateY(${plane.ry * keep}deg) ` +
      `rotateZ(${plane.rz * keep}deg) translateZ(${plane.pivot}px)`;

    const poses = this.elements.map((_, element) => ({ ...BASE_POSE, ...arrangement.place(element, state, ctx) }));

    if (ctx.open) {
      let top = 0;
      poses.forEach((pose, element) => {
        if (element === ctx.open.element) return;
        top = Math.max(top, pose.z);
        pose.opacity *= 1 - DIM_WHEN_OPEN * progress;
      });
      // Davanti a tutti gli altri; la scala compensa l'ingrandimento prospettico dovuto a z
      const z = Math.min(top + 1, this.perspective / 2);
      const scale = this.perspective ? (ctx.open.scale * (this.perspective - z)) / this.perspective : ctx.open.scale;
      const target = { ...BASE_POSE, z, scale };
      poses[ctx.open.element] = mixPose(poses[ctx.open.element], target, progress);
    }

    poses.forEach((pose, element) => applyPose(this.elements[element], pose));
  };

  /** Distanza della camera (perspective calcolata della scena, in px). */
  readPerspective() {
    return parseFloat(getComputedStyle(this.stage).perspective) || 0;
  }

  state() {
    return { u: this.u.get(), v: this.v.get() };
  }

  /**
   * Stato a fine movimento (destinazione delle molle in corso). La navigazione parte da qui e non dalla
   * posizione intermedia: a fine molla lo stato è ancora a un soffio dalla destinazione, e nella pila con
   * ciclo l'elemento precedente sta proprio sul punto di giunzione (wrapStart -1). Partendo dalla posizione
   * intermedia "precedente" poteva risultare dall'altro lato e fare il giro lungo; così inoltre più clic
   * rapidi si sommano invece di ripartire da metà animazione.
   */
  targetState() {
    return { u: this.u.getTarget(), v: this.v.getTarget() };
  }

  itemOf(element) {
    return this.arrangement.itemOf(element, this.ctx);
  }

  /* ------------------------------------------------------------ Navigazione */

  animateTo(target) {
    const pairs = [
      [this.u, target.u],
      [this.v, target.v ?? this.v.get()],
    ];
    for (const [value, to] of pairs) {
      if (reducedMotion.matches) value.jump(to);
      else value.animateTo(to, SPRING);
    }
  }

  goTo(index, element) {
    this.setFocus(index);
    this.animateTo(this.arrangement.stateFor(index, this.targetState(), this.ctx, element));
  }

  step(delta) {
    if (!this.ctx || this.isOpen) return;
    const index = normalizeIndex(this.focusIndex + delta, this.ctx.count, this.arrangement.loops(this.ctx));
    const keyboardFocus = document.activeElement?.closest('[data-gallery-control]');
    this.goTo(index);
    // Navigazione da tastiera su un elemento: il focus segue l'elemento in primo piano
    if (keyboardFocus && this.contains(keyboardFocus)) this.controlOf(index)?.focus({ preventScroll: true });
  }

  /** Allinea l'elemento più vicino dopo trascinamento o scorrimento, proseguendo con l'inerzia. */
  settle(velocity) {
    const target = this.arrangement.release(this.state(), velocity, this.ctx);
    this.setFocus(this.arrangement.focusOf(target, this.ctx));
    this.animateTo(target);
  }

  controlOf(index) {
    return this.items[index]?.querySelector('[data-gallery-control]');
  }

  setFocus(index, announce = true) {
    this.focusIndex = index;
    // Da tastiera si raggiunge solo l'elemento in primo piano: il suo controllo principale e, nelle
    // card prodotto, anche link del titolo e colori (che tornano al loro ordine naturale)
    this.items.forEach((item, i) => {
      const active = i === index;
      item.toggleAttribute('data-active', active);
      item.querySelectorAll(FOCUSABLE).forEach((element) => {
        if (element.matches('[data-gallery-control]')) element.tabIndex = active ? 0 : -1;
        else if (active) element.removeAttribute('tabindex');
        else element.tabIndex = -1;
      });
    });
    this.updateStatus(announce);
    this.updateVideos();
  }

  updateStatus(announce) {
    const item = this.items[this.focusIndex];
    const position = this.dataset.positionTemplate
      .replace('[current]', this.focusIndex + 1)
      .replace('[total]', this.items.length);
    const caption = item.dataset.caption ?? '';

    if (this.counter) this.counter.textContent = position;
    if (this.caption) {
      this.caption.textContent = caption;
      this.caption.hidden = !caption;
    }
    if (this.link) {
      const href = item.dataset.link;
      this.link.hidden = !href;
      if (href) {
        this.link.href = href;
        this.link.textContent = item.dataset.linkLabel || this.link.dataset.defaultLabel;
      }
    }
    // Annuncio per i lettori di schermo solo quando lo spostamento si è fermato
    // (data-label: didascalia, testo alternativo o nome del prodotto)
    if (announce && this.status) {
      const label = item.dataset.label || caption;
      clearTimeout(this.statusTimer);
      this.statusTimer = setTimeout(() => {
        this.status.textContent = label ? `${position}: ${label}` : position;
      }, 300);
    }
  }

  setVideosPaused(paused) {
    this.videosPaused = paused;
    this.toggleAttribute('data-videos-paused', paused);
    if (this.videoToggle) {
      this.videoToggle.setAttribute(
        'aria-label',
        paused ? this.videoToggle.dataset.labelPlay : this.videoToggle.dataset.labelPause,
      );
    }
  }

  updateVideos() {
    // Il pulsante pausa/riproduzione compare quando l'elemento in primo piano è un video
    if (this.videoToggle) this.videoToggle.hidden = !this.videos?.[this.focusIndex];
    this.videos?.forEach((video, index) => {
      if (!video) return;
      const opened = this.isOpen && this.itemOf(this.openElement) === index;
      video.controls = opened;
      if (this.inView && index === this.focusIndex && !this.videosPaused) video.play().catch(() => {});
      else if (!opened) video.pause();
    });
  }

  /* --------------------------------------------------------- Apertura elemento */

  open(element) {
    if (!this.config.open || this.isOpen) return;
    const { width, height, stageWidth, stageHeight, room } = this.ctx;
    // Letta qui, prima di ogni scrittura dell'apertura (stili ancora validi dall'ultimo fotogramma)
    this.perspective ??= this.readPerspective();
    if (this.openElement !== null && this.openElement !== element) this.openProgress.jump(0);

    this.openScale = Math.max(1, Math.min((stageWidth - 2 * room) / width, (stageHeight - 2 * room) / height));
    this.openElement = element;
    this.isOpen = true;

    const opened = this.elements[element];
    opened.toggleAttribute('data-opened', true);
    // Immagine abbastanza definita alla dimensione ingrandita (srcset sceglie la variante più grande)
    opened.querySelectorAll('img').forEach((img) => (img.sizes = `${Math.ceil(width * this.openScale)}px`));
    this.elements.forEach((other, e) => (other.inert = e !== element));
    this.toggleAttribute('data-open', true);
    if (this.closeButton) {
      this.closeButton.hidden = false;
      this.closeButton.focus({ preventScroll: true });
    }
    this.updateVideos();
    this.animateOpen(1);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.elements[this.openElement]?.removeAttribute('data-opened');
    this.elements.forEach((element) => (element.inert = false));
    this.removeAttribute('data-open');
    if (this.closeButton) this.closeButton.hidden = true;
    this.controlOf(this.focusIndex)?.focus({ preventScroll: true });
    this.updateVideos();
    this.animateOpen(0).then(() => {
      if (this.isOpen) return;
      this.openElement = null;
      this.requestRender();
    });
  }

  animateOpen(to) {
    if (reducedMotion.matches) {
      this.openProgress.jump(to);
      return Promise.resolve();
    }
    return this.openProgress.animateTo(to, OPEN_SPRING);
  }

  /* -------------------------------------------------------------- Eventi */

  onPointerDown = (event) => {
    if (this.isOpen || !this.ctx || event.button !== 0 || this.items.length < 2) return;
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };

  onPointerMove = (event) => {
    const pointer = this.pointer;
    if (!pointer || event.pointerId !== pointer.id) return;

    if (!pointer.moved) {
      if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < DRAG_THRESHOLD) return;
      // Inizio del trascinamento: ferma le molle e riparte dalla posizione attuale
      pointer.moved = true;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.start = this.state();
      this.u.stop();
      this.v.stop();
      this.stage.setPointerCapture(pointer.id);
      this.toggleAttribute('data-dragging', true);
    }

    const next = this.arrangement.drag(pointer.start, event.clientX - pointer.x, event.clientY - pointer.y, this.ctx);
    this.u.set(next.u);
    if (next.v !== undefined) this.v.set(next.v);
  };

  onPointerUp = (event) => {
    const pointer = this.pointer;
    if (!pointer || event.pointerId !== pointer.id) return;
    this.pointer = null;
    if (!pointer.moved) return;

    this.removeAttribute('data-dragging');
    // Il clic che segue il rilascio non deve aprire né seguire link
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false), 0);
    const velocity = reducedMotion.matches ? { u: 0, v: 0 } : { u: this.u.getVelocity(), v: this.v.getVelocity() };
    this.settle(velocity);
  };

  /** Solo lo scorrimento orizzontale (trackpad, shift + rotella): quello verticale resta alla pagina. */
  onWheel = (event) => {
    if (this.isOpen || !this.ctx || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    const delta = event.deltaMode === 1 ? event.deltaX * 16 : event.deltaX;
    const current = this.state();
    const next = this.arrangement.drag(current, -delta, 0, this.ctx);
    if (next.u === current.u && (next.v ?? current.v) === current.v) return;

    event.preventDefault();
    this.u.stop();
    this.v.stop();
    this.u.set(next.u);
    if (next.v !== undefined) this.v.set(next.v);
    clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => this.settle({ u: 0, v: 0 }), WHEEL_SETTLE);
  };

  onClickCapture = (event) => {
    if (!this.suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
  };

  onClick = (event) => {
    const target = event.target;
    if (target.closest('[data-gallery-video-toggle]')) {
      this.setVideosPaused(!this.videosPaused);
      return this.updateVideos();
    }
    if (target.closest('[data-gallery-prev]')) return this.step(-1);
    if (target.closest('[data-gallery-next]')) return this.step(1);
    if (target.closest('[data-gallery-close]')) return this.close();
    if (!this.ctx) return;

    const item = target.closest('[data-gallery-item]');
    const element = item ? this.elements.indexOf(item) : -1;

    if (this.isOpen) {
      // Clic sulla scena fuori dall'elemento aperto: chiude
      if (this.stage.contains(target) && element !== this.openElement) this.close();
      return;
    }
    if (element < 0) return;

    const index = this.itemOf(element);
    if (index !== this.focusIndex) {
      // Il primo clic su un elemento laterale lo porta in primo piano (anche se è un link)
      event.preventDefault();
      this.goTo(index, element);
      return;
    }
    const quickViewTrigger = target.closest('[data-quick-view-url]');
    if (quickViewTrigger) {
      // Card prodotto: anteprima rapida che parte dalla card cliccata (anche una copia della griglia)
      this.quickView?.show({
        url: quickViewTrigger.dataset.quickViewUrl,
        origin: item.querySelector('[data-card-media]'),
        label: quickViewTrigger.getAttribute('aria-label'),
      });
      return;
    }
    if (this.config.open && target.closest('button[data-gallery-control]')) {
      // Nella griglia ripetuta apre la copia più vicina al centro, non per forza l'originale
      const nearest = this.arrangement.nearestElement(index, this.state(), this.ctx);
      this.open(item === this.items[index] ? nearest : element);
    }
  };

  onKeyDown = (event) => {
    if (event.key === 'Escape' && this.isOpen) {
      event.preventDefault();
      this.close();
      return;
    }
    if (this.isOpen || !this.ctx || event.altKey || event.ctrlKey || event.metaKey) return;
    // Frecce sui campi (es. colori delle card prodotto): restano al campo
    if (event.target.closest('input, select, textarea')) return;

    const loops = this.arrangement.loops(this.ctx);
    if (!loops && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      this.step((event.key === 'Home' ? 0 : this.ctx.count - 1) - this.focusIndex);
      return;
    }
    const delta = this.arrangement.keys(this.ctx)[event.key];
    if (!delta) return;
    event.preventDefault();
    this.step(delta);
  };

  /** <quick-view> della section, quando definito (quick-view.js si carica a parte). */
  get quickView() {
    const element = this.dataset.quickView && document.getElementById(this.dataset.quickView);
    return element && typeof element.show === 'function' ? element : null;
  }

  /** Puntatore o focus sulla card prodotto in primo piano: il contenuto dell'anteprima parte in anticipo. */
  onIntent = (event) => {
    const trigger = event.target.closest?.('[data-quick-view-url]');
    if (!trigger || this.pointer?.moved || !this.ctx) return;
    const element = this.elements.indexOf(trigger.closest('[data-gallery-item]'));
    if (element >= 0 && this.itemOf(element) === this.focusIndex) this.quickView?.prefetch(trigger.dataset.quickViewUrl);
  };

  onBlockSelect = (event) => {
    const index = this.items.findIndex((item) => item === event.target || item.contains(event.target));
    if (index < 0) return;
    if (!this.ctx) {
      this.pendingBlockIndex = index; // applicato alla prima misura (ResizeObserver)
      return;
    }
    this.close();
    this.goTo(index);
  };
}

if (!customElements.get('animated-gallery')) {
  customElements.define('animated-gallery', AnimatedGallery);
}
