/**
 * Contenitori scorrevoli accessibili da tastiera (WCAG 2.1.1, regola axe/Lighthouse "scrollable-region-focusable").
 *
 * Un elenco che scorre in orizzontale (media del prodotto su mobile, scroll gallery come carosello) senza elementi
 * focusabili all'interno non si può scorrere da tastiera. Gli elementi [data-scroll-region] (con aria-label nel
 * markup) diventano focusabili (tabindex="0") solo quando scorrono davvero e non contengono già link o pulsanti:
 * su desktop, dove sono griglie o animati dallo scroll, non aggiungono passaggi inutili con Tab.
 *
 * Avvio: initScrollRegions(root) da theme.js, anche dopo shopify:section:load.
 *
 * Layout: le misure si leggono nella callback del ResizeObserver (dopo il layout), prima per tutti gli elenchi e poi
 * le scritture, e tabindex cambia solo se serve. Leggere e scrivere un elenco alla volta faceva ricalcolare il layout
 * a ogni elenco dopo il primo. L'observer nasce alla prima chiamata, dopo quello di scrollbar-width.js (theme.js):
 * le callback girano nell'ordine di creazione degli observer, e quelle che scrivono stili sulla radice devono venire
 * dopo le letture o le renderebbero forzate.
 */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

function isScrollable(region) {
  return region.scrollWidth > region.clientWidth + 1 || region.scrollHeight > region.clientHeight + 1;
}

let observer = null;

function onResize(entries) {
  // Letture
  const states = entries.map(({ target }) => [target, isScrollable(target) && !target.querySelector(FOCUSABLE)]);
  // Scritture
  for (const [region, focusable] of states) {
    if (focusable) {
      if (region.getAttribute('tabindex') !== '0') region.tabIndex = 0;
    } else if (region.hasAttribute('tabindex')) {
      region.removeAttribute('tabindex');
    }
  }
}

export function initScrollRegions(root = document) {
  observer ??= new ResizeObserver(onResize);
  root.querySelectorAll('[data-scroll-region]').forEach((region) => observer.observe(region));
}
