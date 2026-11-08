/**
 * Pulsanti −/+ di un campo quantità: condiviso da pagina prodotto e anteprima rapida (product-page.js) e dal carrello,
 * pagina e cassetto (entrypoints/cart.js). Markup: un contenitore [data-quantity] con un input number e i pulsanti
 * [data-quantity-step="down|up"].
 */

/**
 * Limiti di un campo quantità. `top` è l'ultimo valore raggiungibile: con min 2, passo 3 e max 10 è 8.
 * Nel carrello min può valere 0: lì il − su quantità 1 rimuove la riga (snippets/cart-line-items.liquid).
 */
export function quantityBounds(input) {
  const min = input.min ? Number(input.min) : 1;
  const step = Number(input.step) || 1;
  const top = input.max ? min + Math.floor((Number(input.max) - min) / step) * step : Infinity;
  return { min, step, top };
}

/**
 * − e + spenti quando non c'è più un valore raggiungibile in quella direzione. Con aria-disabled e non disabled:
 * chi usa la tastiera arriva al limite con il focus su quel pulsante e non deve perderlo, quindi chi gestisce il clic
 * deve controllare l'attributo (aria-disabled non blocca Invio e Spazio). Con `disabled` dal Liquid (variante non
 * acquistabile) non si tocca nulla.
 */
export function syncQuantitySteps(box) {
  const input = box?.querySelector('input[type="number"]');
  if (!input || input.disabled) return;
  const { min, top } = quantityBounds(input);
  const value = Number(input.value);
  box.querySelector('[data-quantity-step="down"]').setAttribute('aria-disabled', String(value <= min));
  box.querySelector('[data-quantity-step="up"]').setAttribute('aria-disabled', String(value >= top));
}
