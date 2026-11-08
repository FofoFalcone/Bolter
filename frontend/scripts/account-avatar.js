/**
 * Avatar da cliente connesso di <shopify-account>: due correzioni che Shopify non espone (nessun part né variabile
 * per lo stato connesso), quindi un foglio adottato nello shadow root del componente.
 * - Hover: `scale: 1.05` porta il cerchio da 32 a 33,6 px e fa saltare l'iniziale. Il riscontro è il cambio di colore
 *   (variabile documentata, frontend/styles/header.css).
 * - Login con Shop: l'anello è una moneta 3D (preserve-3d, disco viola dietro con translateZ) che sfoca l'iniziale.
 *   Qui diventa piatta. Il bordo sgranato ha un'altra causa: sfondo dell'avatar, sfondo della moneta e anello finiscono
 *   sullo stesso bordo curvo, e i pixel semitrasparenti mescolano il colore scuro con il viola. Un solo disco viola con
 *   sopra quello interno, più piccolo, lascia sul bordo esterno solo il viola (scarto dal mix bianco/viola misurato il
 *   2026-11-06: da 24 a 0,25). Con la foto profilo l'anello resta quello di Shopify, sopra l'immagine.
 *   La rotazione di benvenuto (.animated) non si tocca.
 *
 * Sono classi interne e Shopify aggiorna il componente da solo: se cambiano, il foglio non ha più effetto e si torna
 * all'aspetto predefinito, senza errori. `:host` alza la specificità: l'ordine dei fogli non conta.
 */

const CSS = `
  :host .account-button__avatar:hover {
    scale: none;
  }

  :host .account-button--shop-customer:not(.animated),
  :host .account-button--shop-customer:not(.animated) .account-button__coin-front {
    transform-style: flat;
    backface-visibility: visible;
  }

  :host .account-button--shop-customer:not(.animated)::after,
  :host .account-button--shop-customer:not(.animated) .account-button__coin-front::before,
  :host .account-button--shop-customer:not(.animated) .account-button__coin-back {
    display: none;
  }

  :host .account-button--shop-customer:not(.animated) {
    background-color: transparent;
  }

  :host .account-button--shop-customer:not(.animated) .account-button__coin-front:not(.account-button__coin-front--has-image) {
    isolation: isolate;
    background-color: var(--shop-brand-color);
  }

  :host .account-button--shop-customer:not(.animated) .account-button__coin-front:not(.account-button__coin-front--has-image)::before {
    display: block;
    inset: var(--ring-width);
    width: auto;
    height: auto;
    transform: none;
    background-color: var(--shopify-account-signed-in-avatar-color-background, var(--shopify-account-color-accent));
  }

  :host .account-button--shop-customer:not(.animated) .account-button__coin-front:not(.account-button__coin-front--has-image)::after {
    display: none;
  }

  @media (prefers-reduced-motion: no-preference) {
    :host .account-button--shop-customer:not(.animated) .account-button__coin-front::before {
      transition: background-color var(--timing-short) var(--easing-default);
    }
  }
`;

let sheet;

/** Da chiamare a ogni connessione dell'header: il theme editor ricrea il componente quando ricarica la section. */
export function refineAccountAvatar(root) {
  const accounts = root.querySelectorAll('shopify-account');
  if (!accounts.length) return;

  customElements.whenDefined('shopify-account').then(() => {
    if (!sheet) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
    }
    accounts.forEach(({ shadowRoot }) => {
      if (shadowRoot && !shadowRoot.adoptedStyleSheets.includes(sheet)) {
        shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
      }
    });
  });
}
