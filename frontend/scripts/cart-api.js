/**
 * API del carrello condivise (pagina prodotto, pagina carrello, carrello a cassetto).
 *
 * Tutte le modifiche passano dall'Ajax Cart API (cart/add.js, cart/change.js, cart/update.js)
 * chiedendo anche l'HTML aggiornato delle section interessate (bundled section rendering):
 * - header (contatore del carrello, link marcato [data-header-cart]);
 * - ogni <cart-items data-section-id="…"> presente in pagina (pagina carrello, cassetto).
 * Così il markup resta tutto in Liquid: qui si sostituisce solo l'HTML ricevuto.
 */

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const cartRoot = () => `${window.Shopify?.routes?.root ?? '/'}cart/`;

export function getHeaderSection() {
  return document.querySelector('.section-header');
}

const sectionIdOf = (element) => element?.closest('.shopify-section')?.id.replace('shopify-section-', '');

/** Id delle section da far ri-renderizzare a Shopify insieme alla modifica del carrello. */
export function cartSectionIds() {
  const ids = [sectionIdOf(getHeaderSection())];
  document.querySelectorAll('cart-items[data-section-id]').forEach((el) => ids.push(el.dataset.sectionId));
  return [...new Set(ids.filter(Boolean))];
}

/**
 * POST a cart/<endpoint>.js. `body` può essere FormData (form prodotto) o un oggetto (JSON).
 * Aggiunge sempre le section da aggiornare. In caso di errore lancia un Error con il messaggio di Shopify.
 */
export async function postCart(endpoint, body = {}) {
  const sections = cartSectionIds();
  const isForm = body instanceof FormData;

  if (isForm) {
    body.append('sections', sections.join(','));
    body.append('sections_url', window.location.pathname);
  } else {
    body = { ...body, sections, sections_url: window.location.pathname };
  }

  const response = await fetch(`${cartRoot()}${endpoint}.js`, {
    method: 'POST',
    headers: isForm
      ? { Accept: 'application/json' }
      : { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: isForm ? body : JSON.stringify(body),
  });
  const data = await response.json();

  if (!response.ok || data.status) {
    const error = new Error(data.description || data.message || 'Cart error');
    error.data = data;
    throw error;
  }
  return data;
}

/** Ricarica le section del carrello senza modifiche (es. per ripristinare dopo un errore). */
export async function refreshCartSections() {
  const root = window.Shopify?.routes?.root ?? '/';
  const response = await fetch(`${root}?sections=${cartSectionIds().join(',')}`);
  renderCartSections(await response.json());
}

const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

/** Sostituisce nel DOM le parti aggiornate: contatore dell'header e contenuto di ogni <cart-items>. */
export function renderCartSections(sections) {
  if (!sections) return;

  const header = getHeaderSection();
  const headerHtml = sections[sectionIdOf(header)];
  if (headerHtml) {
    const next = parse(headerHtml).querySelector('[data-header-cart]');
    const current = header.querySelector('[data-header-cart]');
    // Solo il contenuto: il link resta lo stesso nodo, così il cassetto (aperto da lì) può riportarci il focus
    if (next && current) current.innerHTML = next.innerHTML;
  }

  document.querySelectorAll('cart-items[data-section-id]').forEach((cartItems) => {
    const html = sections[cartItems.dataset.sectionId];
    if (!html) return;
    const next = parse(html).querySelector('cart-items');
    if (!next) return;
    // Si sostituisce il contenuto, non l'elemento: il custom element (e i suoi listener) resta lo stesso.
    // Focus: torna sul controllo con lo stesso id (gli id delle righe sono per posizione, quindi dopo una
    // rimozione va sulla riga successiva); se non esiste più, sul titolo del carrello ([data-cart-focus]).
    const active = document.activeElement;
    const hadFocus = cartItems.contains(active);
    const activeId = hadFocus ? active.id : '';
    cartItems.innerHTML = next.innerHTML;
    if (!hadFocus) return;
    const target = (activeId && document.getElementById(activeId)) || cartItems.querySelector('[data-cart-focus]');
    target?.focus({ preventScroll: true });
  });

  // Da qui passano tutte le modifiche al carrello (tema, app con Shopify.actions.updateCart, ritorno dal bfcache)
  document.dispatchEvent(new CustomEvent('cart:sections-rendered'));
}
