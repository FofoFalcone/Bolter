/**
 * Header del negozio — custom element <site-header> (sections/header.liquid).
 * Importato staticamente da frontend/entrypoints/theme.js: l'header è su ogni pagina.
 *
 * Il markup funziona senza JS: menu mobile con <details>, pannelli delle voci come popover nativi
 * (snippet header-panel). Qui solo i miglioramenti:
 * - pannelli: apertura al passaggio del mouse con un breve ritardo (data-hover-open, solo mouse: sul touch
 *   resta il tocco), posizione sotto l'header (--header-bottom) e sotto la voce (--panel-left, tendine
 *   compatte), stato su <site-header data-menu-open="mega|compact"> per il velo sulla pagina;
 * - evidenziazione del menu desktop che scorre tra le voci e resta su quella aperta;
 * - menu mobile: blocco dello scroll della pagina, Esc chiude e riporta il focus, chiusura passando a desktop;
 * - header "a scomparsa" (data-sticky="scroll-up"): nascosto scorrendo verso il basso, visibile risalendo;
 * - header trasparente sopra la hero: data-solid quando deve tornare pieno (la trasparenza è decisa in CSS);
 * - ricerca: il modulo della ricerca predittiva si scarica solo all'intenzione di cercare;
 * - paese/lingua: filtro dell'elenco dei paesi;
 * - theme editor: selezionando un blocco Mega menu (o una sua card) il pannello si apre;
 * - altezza dell'header in --header-height su :root (default in frontend/styles/tokens.css);
 * - avatar di <shopify-account> da cliente connesso (account-avatar.js).
 * Animazioni solo CSS (frontend/styles/header.css e utility nel markup): nessuna libreria su ogni pagina.
 *
 * Layout: niente misure all'avvio (connectedCallback gira mentre la pagina fa il primo layout, e ogni lettura lo
 * forzava). Altezze e posizione di scroll iniziale dal ResizeObserver (dalle entry, nella prima callback della
 * pagina, quando il layout è appena stato calcolato), hero sotto l'header da un IntersectionObserver; negli eventi
 * le letture vengono prima delle scritture, e gli attributi cambiano solo quando cambia lo stato.
 */

import { refineAccountAvatar } from './account-avatar.js';
import { wrapFocus } from './focus-wrap.js';

const DESKTOP_QUERY = '(min-width: 990px)'; // = breakpoint lg: da qui menu orizzontale, sotto il cassetto
// --header-height predefinita in frontend/styles/tokens.css (da tenere allineata): 4.5rem + 1px, 5rem + 1px da 750px
const HEADER_HEIGHT_DEFAULT = { narrow: 4.5, wide: 5 }; // rem, più 1px di bordo
const HEADER_HEIGHT_WIDE_QUERY = '(width >= 46.875rem)';
const SCROLL_THRESHOLD = 8; // px di scroll minimi per cambiare stato (evita tremolii)
const HOVER_OPEN_DELAY = 120; // ms: evita aperture attraversando la barra con il mouse
const HOVER_CLOSE_DELAY = 250; // ms: tempo per passare dalla voce al pannello
const COMPACT_WIDTH = 256; // px = md:w-64 del pannello compatto
const VIEWPORT_MARGIN = 16;

class SiteHeader extends HTMLElement {
  connectedCallback() {
    this.section = this.closest('.section-header') ?? this;
    this.drawer = this.querySelector('details.header-drawer');
    this.panels = Array.from(this.querySelectorAll('[data-header-panel]'));
    this.triggers = Array.from(this.querySelectorAll('[data-header-trigger]'));
    this.highlight = this.querySelector('[data-nav-highlight]');
    this.desktopQuery = window.matchMedia(DESKTOP_QUERY);
    this.abort = new AbortController();
    const signal = this.abort.signal;

    this.drawer?.addEventListener('toggle', () => this.onDrawerToggle(), { signal });
    document.addEventListener('keydown', (event) => this.onKeydown(event), { signal });
    this.desktopQuery.addEventListener('change', () => this.onBreakpointChange(), { signal });
    // Direttamente nell'evento: i browser lo inviano al più una volta per fotogramma, all'inizio dell'aggiornamento
    // della pagina e prima dei requestAnimationFrame. Qui le letture (window.scrollY, posizione del pannello aperto)
    // trovano il layout ancora pulito; in un requestAnimationFrame arrivavano dopo gli stili scritti dalle animazioni
    // legate allo scroll (Motion, Lenis) e lo forzavano.
    window.addEventListener('scroll', () => this.onScroll(), { passive: true, signal });
    // Posizione di partenza (per l'header a scomparsa): letta alla prima notifica del ResizeObserver (onResize)

    this.panels.forEach((panel) => {
      panel.addEventListener('beforetoggle', (event) => event.newState === 'open' && this.positionPanel(panel), { signal });
      panel.addEventListener('toggle', () => this.syncMenuState(), { signal });
    });

    this.setupHover(signal);
    this.setupHighlight(signal);
    this.setupOverlay(signal);
    this.setupLocalizationFilter(signal);
    this.setupSearch(signal);
    refineAccountAvatar(this);

    document.addEventListener('shopify:block:select', (event) => this.onBlockSelect(event, true), { signal });
    document.addEventListener('shopify:block:deselect', (event) => this.onBlockSelect(event, false), { signal });

    // --header-height su :root (es. hero "Tutto lo schermo"), aggiornata se l'header cambia altezza; altezza
    // dell'header per l'header a scomparsa e per quello trasparente. Si osserva anche <site-header> se non coincide
    // con la section.
    this.resizeObserver = new ResizeObserver((entries) => this.onResize(entries));
    this.resizeObserver.observe(this.section);
    if (this.section !== this) this.resizeObserver.observe(this);
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.resizeObserver?.disconnect();
    this.overlayObserver?.disconnect();
    this.overlayObserver = null;
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
    this.section?.removeAttribute('data-header-hidden');
  }

  /* ------------------------------------------------------------- Altezza */

  /**
   * Prima notifica subito dopo il primo layout: è il primo ResizeObserver della pagina (header.js è il primo modulo
   * di theme.js), quindi qui il layout è ancora pulito e window.scrollY non lo ricalcola. Prima tutte le letture,
   * poi le scritture: le callback degli altri observer (scrollbar-width.js, scroll-regions.js, section) vengono dopo.
   */
  onResize(entries) {
    this.lastScrollY ??= window.scrollY;
    let sectionHeight = null;
    for (const entry of entries) {
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.offsetHeight;
      if (entry.target === this.section) sectionHeight = height;
      if (entry.target === this) this.ownHeight = Math.round(height);
    }
    if (sectionHeight !== null) this.writeHeaderHeight(sectionHeight);
    // L'header trasparente torna pieno quando la hero passa sotto il suo bordo: margine dell'observer = altezza
    if (this.overlayTarget && this.ownHeight !== this.overlayHeight) this.observeOverlay();
  }

  /**
   * Scrive --header-height solo se diversa da quella già in vigore. Finché l'header ha l'altezza predefinita di
   * tokens.css (il caso normale) non scrive nulla: una variabile su :root ricalcola lo stile di tutta la pagina, e
   * all'avvio rendeva forzate le misure degli observer successivi.
   */
  writeHeaderHeight(height) {
    const root = document.documentElement;
    const value = `${Math.round(height)}px`;
    const inline = root.style.getPropertyValue('--header-height');
    if (inline === value) return;
    if (!inline) {
      // Lettura di solo stile (dimensione del rem), prima di qualsiasi scrittura
      const rem = parseFloat(getComputedStyle(root).fontSize) || 16;
      const wide = window.matchMedia(HEADER_HEIGHT_WIDE_QUERY).matches;
      const fallback = (wide ? HEADER_HEIGHT_DEFAULT.wide : HEADER_HEIGHT_DEFAULT.narrow) * rem + 1;
      if (Math.abs(height - fallback) < 0.5) return;
    }
    root.style.setProperty('--header-height', value);
  }

  /* ------------------------------------------------------------ Pannelli */

  get openPanel() {
    return this.panels.find((panel) => panel.matches(':popover-open'));
  }

  panelFor(trigger) {
    return document.getElementById(trigger.getAttribute('popovertarget'));
  }

  triggerFor(panel) {
    return this.triggers.find((trigger) => trigger.getAttribute('popovertarget') === panel.id);
  }

  /**
   * Pannello sotto il bordo inferiore dell'header (che può essere sticky, nascosto o già scrollato).
   * Tutte le misure prima delle scritture: scrivere --header-bottom e poi misurare la voce forzava il layout.
   */
  positionPanel(panel) {
    // Letture
    const bottom = Math.max(0, Math.round(this.getBoundingClientRect().bottom));
    let left = null;
    if (panel.dataset.headerPanel === 'compact') {
      // Voce del menu o, per paese/lingua, il pulsante visibile che apre il pannello
      const trigger =
        this.triggerFor(panel) ??
        Array.from(this.querySelectorAll(`[popovertarget="${panel.id}"]:not([popovertargetaction="hide"])`)).find(
          (button) => button.getClientRects().length > 0,
        );
      if (trigger) {
        const width = Number(panel.dataset.panelWidth) || COMPACT_WIDTH;
        const maxLeft = document.documentElement.clientWidth - width - VIEWPORT_MARGIN;
        left = Math.round(Math.max(VIEWPORT_MARGIN, Math.min(trigger.getBoundingClientRect().left, maxLeft)));
      }
    }

    // Scritture, solo se il valore cambia (durante lo scroll con un pannello aperto di solito resta uguale)
    if (bottom !== this.headerBottom) {
      this.headerBottom = bottom;
      this.style.setProperty('--header-bottom', `${bottom}px`);
    }
    if (left !== null && left !== this.panelLeft) {
      this.panelLeft = left;
      this.style.setProperty('--panel-left', `${left}px`);
    }
  }

  /** Stato letto dal DOM (gli eventi toggle arrivano dopo, anche passando da un pannello all'altro). */
  syncMenuState() {
    const open = this.openPanel;
    // Prima l'evidenziazione, che misura le voci: le scritture qui sotto (rotazione della freccia, header mostrato)
    // non ne cambiano le posizioni relative, ma misurando dopo forzavano il layout.
    if (!this.pointerInNav) this.moveHighlight(open && this.triggerFor(open));
    this.triggers.forEach((trigger) => trigger.toggleAttribute('data-open', this.panelFor(trigger) === open));
    if (open) {
      this.dataset.menuOpen = open.dataset.headerPanel === 'compact' ? 'compact' : 'mega';
      this.show(); // l'header resta visibile con un pannello aperto
    } else {
      delete this.dataset.menuOpen;
      this.openedByHover = null;
    }
    this.updateSolid();
  }

  hidePanels() {
    this.openPanel?.hidePopover();
  }

  /* -------------------------------------------- Apertura al passaggio del mouse */

  setupHover(signal) {
    if (!this.hasAttribute('data-hover-open')) return;
    const isMouse = (event) => event.pointerType === 'mouse' && this.desktopQuery.matches;

    this.triggers.forEach((trigger) => {
      trigger.addEventListener('pointerenter', (event) => isMouse(event) && this.hoverOpen(trigger), { signal });
      trigger.addEventListener('pointerleave', (event) => isMouse(event) && this.scheduleClose(), { signal });
      trigger.addEventListener('click', (event) => this.onTriggerClick(event, trigger), { signal });
    });
    this.panels.forEach((panel) => {
      panel.addEventListener('pointerenter', (event) => isMouse(event) && clearTimeout(this.closeTimer), { signal });
      panel.addEventListener('pointerleave', (event) => isMouse(event) && this.scheduleClose(), { signal });
    });
    // Le altre voci del menu chiudono il pannello aperto
    this.querySelectorAll('[data-header-nav] a').forEach((link) => {
      link.addEventListener('pointerenter', (event) => isMouse(event) && this.scheduleClose(80), { signal });
    });
  }

  hoverOpen(trigger) {
    clearTimeout(this.closeTimer);
    clearTimeout(this.openTimer);
    const panel = this.panelFor(trigger);
    if (!panel || panel.matches(':popover-open')) return;
    // Da un pannello all'altro: subito, senza ritardo
    const delay = this.openPanel ? 0 : HOVER_OPEN_DELAY;
    this.openTimer = setTimeout(() => {
      if (panel.matches(':popover-open')) return;
      this.openedByHover = panel;
      panel.showPopover({ source: trigger });
    }, delay);
  }

  scheduleClose(delay = HOVER_CLOSE_DELAY) {
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      const open = this.openPanel;
      // Si chiude da solo solo il pannello aperto dal passaggio del mouse: quelli aperti con clic, tocco o
      // tastiera (e i selettori di paese/lingua) restano finché l'utente non li chiude. Mai con il focus dentro.
      if (open && open === this.openedByHover && !open.contains(document.activeElement)) open.hidePopover();
    }, delay);
  }

  /** Clic su una voce già aperta dal passaggio del mouse: resta aperta (senza, il clic la richiuderebbe). */
  onTriggerClick(event, trigger) {
    clearTimeout(this.openTimer);
    const panel = this.panelFor(trigger);
    if (panel && panel === this.openedByHover && panel.matches(':popover-open')) {
      event.preventDefault();
      this.openedByHover = null;
    }
  }

  /* ---------------------------------------------------- Evidenziazione del menu */

  setupHighlight(signal) {
    const list = this.highlight?.parentElement;
    if (!list) return;
    list.querySelectorAll(':scope > li > :is(a, button)').forEach((item) => {
      item.addEventListener('pointerenter', () => this.moveHighlight(item), { signal });
      item.addEventListener('focus', () => this.moveHighlight(item), { signal });
    });
    list.addEventListener('pointerenter', () => (this.pointerInNav = true), { signal });
    list.addEventListener('pointerleave', () => {
      this.pointerInNav = false;
      const open = this.openPanel;
      this.moveHighlight(open && this.triggerFor(open));
    }, { signal });
    list.addEventListener('focusout', (event) => {
      if (!list.contains(event.relatedTarget) && !this.openPanel) this.moveHighlight(null);
    }, { signal });
  }

  moveHighlight(target) {
    const highlight = this.highlight;
    if (!highlight) return;
    if (!target) {
      highlight.removeAttribute('data-visible');
      return;
    }
    const list = highlight.parentElement.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    // Prima comparsa: appare sulla voce, senza scorrere dalla posizione precedente
    const appearing = !highlight.hasAttribute('data-visible');
    if (appearing) highlight.style.transitionProperty = 'opacity';
    highlight.style.setProperty('--highlight-x', `${rect.left - list.left}px`);
    highlight.style.setProperty('--highlight-y', `${rect.top - list.top}px`);
    highlight.style.setProperty('--highlight-w', `${rect.width}px`);
    highlight.style.setProperty('--highlight-h', `${rect.height}px`);
    highlight.setAttribute('data-visible', '');
    if (appearing) requestAnimationFrame(() => highlight.style.removeProperty('transition-property'));
  }

  /* -------------------------------------------------------------- Ricerca */

  /**
   * Ricerca predittiva (frontend/scripts/predictive-search.js): il modulo si scarica all'intenzione di cercare
   * (puntatore, focus o pressione sull'icona) o all'apertura del pannello, non al caricamento della pagina.
   */
  setupSearch(signal) {
    const panel = document.getElementById('HeaderSearch');
    if (!panel?.querySelector('predictive-search[data-url]')) return;
    const load = () => {
      this.searchModule ??= import('./predictive-search.js');
    };
    this.querySelectorAll('[data-search-trigger]').forEach((trigger) => {
      for (const type of ['pointerenter', 'focus', 'pointerdown']) trigger.addEventListener(type, load, { signal, once: true });
    });
    panel.addEventListener('beforetoggle', load, { signal, once: true });
  }

  /* --------------------------------------------------- Paese e lingua (filtro) */

  /** Elenco dei paesi lungo: filtro per nome o codice ISO (data-name), separatore dei più usati nascosto filtrando. */
  setupLocalizationFilter(signal) {
    const input = this.querySelector('[data-localization-filter]');
    const list = this.querySelector('[data-localization-list]');
    if (!input || !list) return;
    const items = Array.from(list.querySelectorAll('li[data-name]'));
    const separator = list.querySelector('[data-localization-separator]');
    const empty = this.querySelector('[data-localization-empty]');

    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      let visible = 0;
      items.forEach((item) => {
        const match = !query || item.dataset.name.includes(query);
        item.hidden = !match;
        if (match) visible++;
      });
      if (separator) separator.hidden = Boolean(query);
      empty?.classList.toggle('hidden', visible > 0);
    }, { signal });
    // Invio nel campo: sceglie il primo paese visibile invece di inviare il form vuoto
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      items.find((item) => !item.hidden)?.querySelector('button')?.click();
    }, { signal });
  }

  /* ------------------------------------------------------ Header trasparente */

  /**
   * La trasparenza è decisa in CSS (varianti overlay: in theme.css): qui solo quando tornare pieno
   * (data-solid): hero già passata sotto l'header, menu o cassetto aperti, focus da tastiera nell'header.
   */
  setupOverlay(signal) {
    if (!this.hasAttribute('data-transparent')) return;
    this.overlayTarget = null; // a ogni connessione: l'observer della hero va ricreato (disconnectedCallback)
    this.findOverlayTarget();
    this.addEventListener('focusin', () => this.updateSolid(), { signal });
    this.addEventListener('focusout', () => requestAnimationFrame(() => this.updateSolid()), { signal });
    // Theme editor: la hero può essere aggiunta, spostata o ricaricata
    document.addEventListener('shopify:section:load', () => (this.findOverlayTarget(), this.updateSolid()), { signal });
    document.addEventListener('shopify:section:reorder', () => (this.findOverlayTarget(), this.updateSolid()), { signal });
    this.updateSolid();
  }

  findOverlayTarget() {
    const target = document.querySelector('main > .shopify-section:first-child [data-header-overlay]');
    if (target === this.overlayTarget) return;
    // Senza hero l'header è pieno; con una hero nuova si parte dall'header sopra di essa (pagina in cima), finché
    // l'observer non dice dove si trova. Una hero ricaricata al suo posto tiene lo stato di prima.
    if (!target) this.overlayPassed = true;
    else if (!this.overlayTarget) this.overlayPassed = false;
    this.overlayTarget = target;
    this.observeOverlay();
  }

  /**
   * Hero passata sotto l'header = non interseca più l'area della finestra sotto l'header. IntersectionObserver
   * invece di getBoundingClientRect a ogni scroll e all'avvio (che forzava il primo layout della pagina). Margine
   * superiore negativo pari all'altezza di <site-header>, quindi l'observer si ricrea quando cambia (onResize);
   * prima della prima misura resta lo stato iniziale. `root: document`: dentro l'iframe del theme editor la radice
   * implicita sarebbe la finestra dell'editor, dove rootMargin non vale.
   */
  observeOverlay() {
    this.overlayObserver?.disconnect();
    this.overlayObserver = null;
    const target = this.overlayTarget;
    if (!target || this.ownHeight === undefined) return;
    this.overlayHeight = this.ownHeight;
    this.overlayObserver = new IntersectionObserver(
      (entries) => {
        this.overlayPassed = !entries[entries.length - 1].isIntersecting;
        this.updateSolid();
      },
      { root: document, rootMargin: `-${this.overlayHeight}px 0px 0px 0px` },
    );
    this.overlayObserver.observe(target);
  }

  updateSolid() {
    if (!this.hasAttribute('data-transparent')) return;
    const passed = this.overlayTarget?.isConnected ? this.overlayPassed : true;
    const solid = passed || Boolean(this.openPanel) || Boolean(this.drawer?.open) || this.matches(':has(:focus-visible)');
    this.toggleAttribute('data-solid', solid);
  }

  /* ------------------------------------------------------------- Menu mobile */

  onKeydown(event) {
    // Sotto i 990px pannelli e cassetto coprono la pagina: Tab gira dentro quello in primo piano (il pannello
    // aperto, altrimenti il cassetto). Da 990px tendine e mega menu restano non modali.
    if (event.key === 'Tab' && !this.desktopQuery.matches) {
      wrapFocus(event, this.openPanel ?? (this.drawer?.open ? this.drawer : null));
      return;
    }
    if (event.key !== 'Escape' || !this.drawer?.open || this.openPanel) return;
    this.drawer.open = false;
    this.drawer.querySelector('summary')?.focus();
  }

  onDrawerToggle() {
    const open = this.drawer.open;
    if (open) this.show(); // l'header deve restare visibile con il menu aperto
    else this.hidePanels(); // chiudendo il cassetto si chiude anche il secondo livello
    this.updateSolid();
  }

  onBreakpointChange() {
    this.hidePanels();
    if (this.desktopQuery.matches && this.drawer?.open) this.drawer.open = false;
  }

  /* ------------------------------------------------------- Header a scomparsa */

  onScroll() {
    // Letture prima di ogni scrittura (posizione di scroll, poi il pannello aperto). L'header trasparente non
    // si aggiorna qui: ci pensa l'IntersectionObserver della hero (observeOverlay).
    const open = this.openPanel;
    const scrollUp = this.dataset.sticky === 'scroll-up';
    const y = scrollUp ? window.scrollY : 0;
    // Un pannello aperto segue il bordo dell'header (header non sticky che esce dallo schermo)
    if (open) this.positionPanel(open);

    if (!scrollUp) return;
    if (this.lastScrollY === undefined) {
      this.lastScrollY = y;
      return;
    }
    const delta = y - this.lastScrollY;
    if (Math.abs(delta) < SCROLL_THRESHOLD) return;
    this.lastScrollY = y;

    const menuOpen = this.drawer?.open || open;
    if (delta > 0 && y > (this.ownHeight ?? this.offsetHeight) && !menuOpen) this.hide();
    else if (delta < 0) this.show();
  }

  // Attributo scritto solo quando cambia: scorrendo, hide() arrivava a ogni fotogramma
  hide() {
    if (!this.section.hasAttribute('data-header-hidden')) this.section.setAttribute('data-header-hidden', '');
  }

  show() {
    if (this.section.hasAttribute('data-header-hidden')) this.section.removeAttribute('data-header-hidden');
  }

  /* ------------------------------------------------------------- Theme editor */

  onBlockSelect(event, selected) {
    const panel = event.target.closest?.('[data-header-panel]');
    if (!panel || !this.contains(panel)) return;
    if (selected && !panel.matches(':popover-open')) panel.showPopover();
    else if (!selected && panel.matches(':popover-open')) panel.hidePopover();
  }
}

if (!customElements.get('site-header')) {
  customElements.define('site-header', SiteHeader);
}
