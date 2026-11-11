/**
 * Collezioni in tab — custom element <collection-tabs>.
 *
 * Adattato dall'esempio Motion "Tab select" (https://motion.dev/examples/js-tab-select):
 * - pattern ARIA tabs (frecce, Home/End, roving tabindex, attivazione automatica);
 * - indicatore che scorre sotto la tab attiva animato con motion/mini
 *   (l'esempio usa animateLayout del pacchetto completo, molto più pesante);
 * - i prodotti della nuova tab entrano a onda dal centro della griglia (stagger con `grid`,
 *   come nell'esempio "Stagger grid");
 * - prefers-reduced-motion: cambio istantaneo.
 *
 * Caricato dalla section con {% render 'vite-tag', entry: 'collection-tabs.js' %}.
 */

import { animate } from 'motion/mini';
import { stagger } from 'motion';

const TRANSITION = { duration: 0.3, ease: [0.4, 0, 0.2, 1] };

// Copia locale, non import da reduced-motion.js: l'import aggiungeva un file all'entrypoint (5 → 6), cioè una
// richiesta in più per una riga (misurato il 2026-11-11).
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class CollectionTabs extends HTMLElement {
  connectedCallback() {
    this.tablist = this.querySelector(':scope > [role="tablist"]');
    if (!this.tablist) return; // una sola collezione: niente tab

    this.tabs = Array.from(this.tablist.querySelectorAll('[role="tab"]'));
    this.panels = this.tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
    this.indicator = this.tablist.querySelector('.collection-tabs__indicator');

    this.handleClick = this.handleClick.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleBlockSelect = this.handleBlockSelect.bind(this);

    this.tablist.addEventListener('click', this.handleClick);
    this.tablist.addEventListener('keydown', this.handleKeydown);
    document.addEventListener('shopify:block:select', this.handleBlockSelect);

    // Stato iniziale: solo scritture. L'indicatore si posiziona alla prima notifica del ResizeObserver
    const selected = this.tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    this.select(Math.max(0, selected), { animated: false });

    // Misure delle tab lette solo qui, a layout appena calcolato (la prima notifica arriva prima del primo paint):
    // in connectedCallback, dopo le scritture di select(), forzerebbero il layout della pagina ancora in costruzione.
    // Osservate anche le singole tab: con il font caricato cambiano larghezza anche se la barra no (scorre).
    this.resizeObserver = new ResizeObserver(() => this.measureTabs());
    this.resizeObserver.observe(this.tablist);
    for (const tab of this.tabs) this.resizeObserver.observe(tab);
  }

  disconnectedCallback() {
    if (!this.tablist) return;
    this.tablist.removeEventListener('click', this.handleClick);
    this.tablist.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('shopify:block:select', this.handleBlockSelect);
    this.resizeObserver?.disconnect();
  }

  handleClick(event) {
    const tab = event.target.closest('[role="tab"]');
    if (!tab) return;
    this.select(this.tabs.indexOf(tab));
  }

  handleKeydown(event) {
    const last = this.tabs.length - 1;
    const keys = {
      ArrowRight: this.current === last ? 0 : this.current + 1,
      ArrowLeft: this.current === 0 ? last : this.current - 1,
      Home: 0,
      End: last,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    this.select(keys[event.key], { focus: true });
  }

  handleBlockSelect(event) {
    const index = this.panels.findIndex((panel) => panel === event.target || panel.contains(event.target));
    if (index !== -1) this.select(index, { animated: false });
  }

  select(index, { animated = true, focus = false } = {}) {
    if (index === this.current) return;
    const shouldAnimate = animated && !prefersReducedMotion();
    // Letture prima delle scritture: colonne dalla griglia ancora visibile (stesse classi in ogni pannello).
    // Lette dopo aver mostrato il nuovo pannello forzerebbero il layout.
    const columns = shouldAnimate ? this.countColumns(this.panels[this.current]) : 1;
    this.current = index;

    this.tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      this.panels[i].hidden = !selected;
    });

    if (focus) this.tabs[index].focus();

    this.moveIndicator({ animated: shouldAnimate });

    if (shouldAnimate) {
      const grid = this.panels[index].querySelector('.collection-tabs__grid');
      const items = grid.querySelectorAll('.collection-tabs__item');
      // Onda dal centro della griglia (esempio Motion "Stagger grid")
      animate(
        items,
        { opacity: [0, 1], scale: [0.92, 1] },
        {
          duration: 0.4,
          ease: [0.22, 1, 0.36, 1],
          delay: stagger(0.05, { from: 'center', grid: [columns, Math.ceil(items.length / columns)] }),
        },
      );
    }
  }

  /** Colonne della griglia di un pannello visibile, dal CSS attuale. */
  countColumns(panel) {
    const grid = panel?.querySelector('.collection-tabs__grid');
    if (!grid) return 1;
    return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
  }

  /** Dal ResizeObserver: tutte le letture, poi la scrittura dell'indicatore. */
  measureTabs() {
    this.tabBoxes = this.tabs.map((tab) => ({ left: tab.offsetLeft, width: tab.offsetWidth }));
    this.moveIndicator({ animated: false });
  }

  /**
   * Posizione dalla cache di measureTabs(): qui si arriva dopo le scritture di select(). La tab attiva cambia solo
   * colore (aria-selected:text-neutral), quindi le misure restano valide al cambio di tab.
   */
  moveIndicator({ animated }) {
    const box = this.tabBoxes?.[this.current];
    if (!box || !this.indicator) return;

    const target = { translate: `${box.left}px 0`, width: `${box.width}px` };

    if (animated) {
      animate(this.indicator, target, TRANSITION);
    } else {
      Object.assign(this.indicator.style, target);
    }
  }
}

if (!customElements.get('collection-tabs')) {
  customElements.define('collection-tabs', CollectionTabs);
}
