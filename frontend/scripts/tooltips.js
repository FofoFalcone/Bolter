/**
 * Tooltip del tema (utility `tooltip`, frontend/styles/components.css): tutto CSS tranne Esc, che li nasconde finché il
 * puntatore o il focus non si spostano altrove (WCAG 1.4.13). Esc non viene fermato: chiude anche dialog e popover.
 */
export function initTooltips() {
  const root = document.documentElement;
  const restore = () => root.removeAttribute('data-tooltips-dismissed');

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    root.toggleAttribute('data-tooltips-dismissed', true);
    document.addEventListener('pointerover', restore, { once: true });
    document.addEventListener('focusin', restore, { once: true });
  });
}
