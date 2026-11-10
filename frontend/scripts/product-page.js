/**
 * Prodotto — custom element <product-page>: pagina prodotto (sections/main-product.liquid) e anteprima
 * rapida (sections/quick-view.liquid, dentro <quick-view>).
 *
 * Il markup funziona senza JS (selettore varianti nativo <select name="id">, form di aggiunta al
 * carrello verso /cart/add). Qui i miglioramenti progressivi:
 *
 * 1. Varianti (metodo consigliato da Shopify): i radio delle opzioni portano l'id del
 *    product_option_value; al cambio si richiede la section con `option_values` + `section_id`
 *    (Section Rendering API) e si sostituiscono solo le parti [data-product-part]. Prezzi,
 *    disponibilità e media restano renderizzati in Liquid: nessuna formattazione di prezzi in JS.
 *    Combined listings: se il valore scelto appartiene a un altro prodotto (data-product-url) si carica
 *    la section di quel prodotto e si sostituisce tutto il prodotto (swapProduct).
 *    Opzioni di acquisto (radio name="selling_plan", snippets/product-selling-plans.liquid): stessa richiesta con il
 *    parametro selling_plan, che aggiorna il prezzo; i valori già scritti (quantità, destinatario) restano.
 * 2. Aggiunta al carrello senza ricaricare: POST a cart/add.js chiedendo anche la section dell'header
 *    (bundled section rendering) per aggiornare il contatore del carrello.
 * 3. Animazione "vola nel carrello" adattata dall'esempio Motion "Add to basket"
 *    (https://motion.dev/examples/js-add-to-basket): traiettoria curva calcolata qui e animata con
 *    motion/mini (WAAPI) invece di `arc` + spring del pacchetto completo (~20 KB in meno).
 *    Con prefers-reduced-motion: solo il cambio di testo del pulsante.
 *
 * Attributi:
 * - data-update-url="false": la variante scelta non va nell'URL (anteprima rapida e prodotto in evidenza: la pagina è un'altra);
 * - data-product-swap="false": un valore di un altro prodotto (combined listing) apre la sua pagina invece di
 *   sostituire il prodotto (prodotto in evidenza: la section rende sempre il prodotto scelto nelle impostazioni);
 * - data-cart-context: contesto dello standard event shopify:cart:lines-update ('product' default,
 *   'dialog' nell'anteprima rapida).
 */

import { animate } from 'motion/mini';
import { getHeaderSection, postCart, renderCartSections, prefersReducedMotion } from './cart-api.js';
import { quantityBounds, syncQuantitySteps } from './quantity-steps.js';
import { fetchAjaxCart, withCartEvent, withProductSelectEvent } from './standard-events.js';
import { showCartAddedToast } from './toast.js';

const SUCCESS_LABEL_MS = 2000;

/** Punti di una curva di Bézier quadratica da (0,0) a (dx,dy), con il vertice sollevato verso l'alto. */
function arcKeyframes(dx, dy, steps = 16) {
  const cx = dx * 0.5;
  const cy = Math.min(0, dy) - Math.max(80, Math.abs(dx) * 0.25); // punto di controllo sopra la traiettoria
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const x = 2 * (1 - t) * t * cx + t * t * dx;
    const y = 2 * (1 - t) * t * cy + t * t * dy;
    return `${x}px ${y}px`;
  });
}

class ProductPage extends HTMLElement {
  connectedCallback() {
    this.onChange = this.onChange.bind(this);
    this.onSubmit = this.onSubmit.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onInput = this.onInput.bind(this);
    this.refreshCartLimit = this.refreshCartLimit.bind(this);

    this.addEventListener('change', this.onChange);
    this.addEventListener('submit', this.onSubmit);
    this.addEventListener('click', this.onClick);
    this.addEventListener('input', this.onInput);
    document.addEventListener('cart:sections-rendered', this.refreshCartLimit);

    this.syncRecipient();
    this.syncQuantity();
    // Ritiro in negozio: JS scaricato solo se il blocco è in pagina. Si controlla la parte e non il componente:
    // con la variante iniziale esaurita il componente arriva solo al cambio variante
    if (this.querySelector('[data-product-part="pickup"]')) import('./pickup-availability.js');
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.onChange);
    this.removeEventListener('submit', this.onSubmit);
    this.removeEventListener('click', this.onClick);
    this.removeEventListener('input', this.onInput);
    document.removeEventListener('cart:sections-rendered', this.refreshCartLimit);
    this.variantRequest?.abort();
    this.limitRequest?.abort();
  }

  /* ---------- Varianti ---------- */

  onChange(event) {
    if (event.target.matches('input[data-option-value-id]')) this.updateVariant(event.target);
    else if (event.target.matches('input[name="selling_plan"]')) this.updateSellingPlan(event.target);
    else if (event.target.matches('[data-recipient-toggle]')) this.syncRecipient();
  }

  /** Opzione di acquisto: si aggiorna solo il prezzo, la variante non cambia (nessun shopify:product:select). */
  async updateSellingPlan(changedInput) {
    const checked = Array.from(this.querySelectorAll('input[data-option-value-id]:checked'));
    this.variantRequest?.abort();
    this.variantRequest = new AbortController();
    const { signal } = this.variantRequest;
    this.setAttribute('aria-busy', 'true');
    try {
      await this.renderVariant(checked.map((input) => input.dataset.optionValueId), changedInput, signal);
    } catch (error) {
      if (error.name !== 'AbortError') console.error('[product-page] aggiornamento opzione di acquisto non riuscito', error);
    } finally {
      if (!signal.aborted) this.removeAttribute('aria-busy');
    }
  }

  async updateVariant(changedInput) {
    const checked = Array.from(this.querySelectorAll('input[data-option-value-id]:checked'));
    const optionValueIds = checked.map((input) => input.dataset.optionValueId);

    this.variantRequest?.abort();
    this.variantRequest = new AbortController();
    const { signal } = this.variantRequest;
    this.setAttribute('aria-busy', 'true');

    // Combined listing: il valore appartiene a un altro prodotto → si carica quel prodotto
    const productUrl = changedInput.dataset.productUrl;
    const pathOf = (url) => new URL(url, window.location.origin).pathname;
    if (productUrl && pathOf(productUrl) !== pathOf(this.dataset.productUrl)) {
      // Prodotto in evidenza: la section mostra il prodotto delle sue impostazioni, non quello dell'URL richiesto
      if (this.dataset.productSwap === 'false') {
        window.location.assign(productUrl);
        return;
      }
      try {
        await this.swapProduct(productUrl, optionValueIds, changedInput, signal);
      } catch (error) {
        // Il prodotto collegato usa un altro template (section diversa) o la richiesta è fallita: pagina normale
        if (error.name !== 'AbortError') window.location.assign(productUrl);
      } finally {
        if (!signal.aborted) this.removeAttribute('aria-busy');
      }
      return;
    }

    try {
      // shopify:product:select (standard event): parte subito, si risolve con la variante calcolata dal server
      await withProductSelectEvent({
        target: this,
        product: { id: this.dataset.productGid, title: this.dataset.productTitle, handle: this.dataset.productHandle },
        selectedOptions: checked.map((input) => ({ name: input.dataset.optionName, value: input.value })),
        resolveVariant: () => this.renderVariant(optionValueIds, changedInput, signal),
      });
    } catch (error) {
      if (error.name !== 'AbortError') console.error('[product-page] aggiornamento variante non riuscito', error);
    } finally {
      if (!signal.aborted) this.removeAttribute('aria-busy');
    }
  }

  /** Section Rendering API: sostituisce le parti aggiornate e restituisce la variante (formato standard event). */
  async renderVariant(optionValueIds, changedInput, signal) {
    this.limitRequest?.abort(); // La risposta descriverebbe la variante precedente
    const sellingPlan = this.querySelector('input[name="selling_plan"]:checked')?.value ?? '';
    // Prodotto senza opzioni (nessun radio delle varianti): la variante si indica direttamente
    const selection = optionValueIds.length ? `option_values=${optionValueIds.join(',')}` : `variant=${this.dataset.variantId}`;
    const planParam = sellingPlan ? `&selling_plan=${sellingPlan}` : '';
    const url = `${this.dataset.productUrl}?${selection}${planParam}&section_id=${this.dataset.sectionId}`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = new DOMParser().parseFromString(await response.text(), 'text/html');
    const next = html.querySelector('product-page');
    if (!next) return null;

    // Le parti sostituite perderebbero quanto scritto dal cliente (quantità, dati del destinatario del buono regalo)
    const kept = Array.from(this.querySelectorAll('[data-preserve-field]')).map((field) => [
      field.id,
      field.type === 'checkbox' ? field.checked : field.value,
    ]);

    this.querySelectorAll('[data-product-part]').forEach((part) => {
      const replacement = next.querySelector(`[data-product-part="${part.dataset.productPart}"]`);
      if (!replacement) return;
      // La galleria si sostituisce solo se cambia l'immagine della variante (evita flash inutili)
      if (part.dataset.productPart === 'media' && part.dataset.featuredMediaId === replacement.dataset.featuredMediaId) {
        return;
      }
      part.replaceWith(replacement);
    });

    kept.forEach(([id, value]) => this.restoreField(document.getElementById(id), value));
    this.syncRecipient();
    this.syncQuantity();

    // Il focus resta sull'opzione appena scelta (il radio è stato sostituito)
    document.getElementById(changedInput.id)?.focus();
    this.announceVariant();

    const variantId = next.dataset.variantId;
    this.dataset.variantId = variantId;
    if (variantId && this.dataset.updateUrl !== 'false') {
      const pageUrl = new URL(window.location.href);
      pageUrl.searchParams.set('variant', variantId);
      if (sellingPlan) pageUrl.searchParams.set('selling_plan', sellingPlan);
      else pageUrl.searchParams.delete('selling_plan');
      window.history.replaceState({}, '', pageUrl);
    }

    // Dati della variante nel formato degli standard events (filtro Liquid standard_event_data)
    const eventData = next.querySelector('[data-product-event-data]')?.textContent;
    return eventData ? JSON.parse(eventData).product?.selectedVariant ?? null : null;
  }

  /**
   * Combined listings (metodo indicato da Shopify per i prodotti con molte varianti): la section si richiede
   * all'URL del prodotto collegato, con le stesse `option_values`, e si sostituisce tutto il prodotto
   * (<s-view-event> compreso: entrando in pagina emette shopify:product:view per il nuovo prodotto, quindi
   * niente shopify:product:select, che descriverebbe una variante del prodotto precedente).
   */
  async swapProduct(productUrl, optionValueIds, changedInput, signal) {
    const url = new URL(productUrl, window.location.origin);
    url.search = '';
    url.searchParams.set('option_values', optionValueIds.join(','));
    url.searchParams.set('section_id', this.dataset.sectionId);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = new DOMParser().parseFromString(await response.text(), 'text/html');
    const nextPage = html.querySelector('product-page');
    if (!nextPage || signal.aborted) throw new Error('[product-page] prodotto collegato non trovato');

    const currentRoot = this.closest('s-view-event') ?? this;
    const nextRoot = nextPage.closest('s-view-event') ?? nextPage;
    // Anteprima rapida: il titolo dà il nome al dialog (aria-labelledby), l'id deve restare lo stesso
    const titleId = currentRoot.querySelector('[data-quick-view-title]')?.id;
    if (titleId) nextRoot.querySelector('[data-quick-view-title]')?.setAttribute('id', titleId);

    const oldTitle = this.dataset.productTitle;
    const updateUrl = this.dataset.updateUrl !== 'false';
    const replacement = document.importNode(nextRoot, true);
    currentRoot.replaceWith(replacement);

    const page = replacement.matches('product-page') ? replacement : replacement.querySelector('product-page');
    document.getElementById(changedInput.id)?.focus();
    page?.announceVariant?.();

    if (updateUrl && page) {
      const pageUrl = new URL(productUrl, window.location.origin);
      pageUrl.search = '';
      if (page.dataset.variantId) pageUrl.searchParams.set('variant', page.dataset.variantId);
      window.history.replaceState({}, '', pageUrl);
      if (oldTitle && page.dataset.productTitle) document.title = document.title.replace(oldTitle, page.dataset.productTitle);
    }
  }

  /**
   * Annuncio per i lettori di schermo dopo il cambio variante: prezzo (con le etichette nascoste dello snippet
   * price, es. "Prezzo scontato") e stato del pulsante (es. "Esaurito"). Le parti aggiornate vengono sostituite,
   * quindi le loro regioni live non annuncerebbero nulla: si usa [data-product-status], che resta in pagina.
   */
  announceVariant() {
    const status = this.querySelector('[data-product-status]');
    if (!status) return;
    const text = (selector) => this.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() ?? '';
    status.textContent = [text('[data-product-part="price"]'), text('[data-add-label]')].filter(Boolean).join('. ');
  }

  /** Rimette un valore nel campo rinnovato; la quantità si adatta alla regola della nuova variante. */
  restoreField(field, value) {
    if (!field) return;
    if (field.type === 'checkbox') {
      field.checked = value;
      return;
    }
    if (field.type !== 'number') {
      field.value = value;
      return;
    }
    const { min, step, top } = quantityBounds(field);
    const snapped = min + Math.round((Math.max(Number(value) || min, min) - min) / step) * step;
    // Max sotto il minimo (non si può aggiungere nulla): il campo è disabilitato e mostra il minimo
    field.value = Math.max(min, Math.min(snapped, top));
  }

  /* ---------- Destinatario del buono regalo ---------- */

  /**
   * Con JS decide la casella: il campo nascosto "if_present" serve solo senza JS. I campi sono attivi solo con la
   * casella accesa, così a casella spenta il buono non parte per nessuno (snippets/gift-card-recipient-form.liquid).
   */
  syncRecipient() {
    this.querySelectorAll('[data-gift-recipient]').forEach((recipient) => {
      const toggle = recipient.querySelector('[data-recipient-toggle]');
      const offset = recipient.querySelector('[data-recipient-offset]');
      toggle.disabled = false;
      recipient.querySelector('[data-recipient-control]').disabled = true;
      recipient.toggleAttribute('data-open', toggle.checked);
      recipient.querySelectorAll('[data-recipient-fields] :is(input, textarea)').forEach((field) => {
        field.disabled = !toggle.checked;
      });
      offset.disabled = !toggle.checked;
      offset.value = String(new Date().getTimezoneOffset());
    });
  }

  /** Errori restituiti da Shopify per campo (email, name, message, send_on): segnati sul campo, il primo prende il focus. */
  markRecipientErrors(form, errors) {
    form.querySelectorAll('[data-recipient-fields] [aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
    if (!errors || typeof errors !== 'object') return;
    const fields = Object.keys(errors)
      .map((key) => form.querySelector(`[id^="Recipient-${key}-"]`))
      .filter(Boolean);
    fields.forEach((field) => field.setAttribute('aria-invalid', 'true'));
    fields[0]?.focus();
  }

  /** Dopo l'aggiunta al carrello il prossimo buono non deve ripartire con gli stessi dati. */
  resetRecipient(form) {
    const toggle = form.querySelector('[data-recipient-toggle]');
    if (!toggle) return;
    form.querySelectorAll('[data-recipient-fields] :is(input, textarea)').forEach((field) => {
      field.value = '';
    });
    toggle.checked = false;
    this.syncRecipient();
  }

  /* ---------- Quantità ---------- */

  onClick(event) {
    const stepButton = event.target.closest('button[data-quantity-step]');
    // aria-disabled non blocca Invio e Spazio: il limite si controlla anche qui
    if (!stepButton || stepButton.getAttribute('aria-disabled') === 'true') return;
    const input = stepButton.closest('[data-quantity]')?.querySelector('input[name="quantity"]');
    if (!input) return;
    if (stepButton.dataset.quantityStep === 'up') input.stepUp();
    else input.stepDown();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    this.syncQuantity();
  }

  onInput(event) {
    if (event.target.matches('input[name="quantity"]')) this.syncQuantity();
  }

  syncQuantity() {
    syncQuantitySteps(this.querySelector('[data-quantity]'));
  }

  /**
   * Il carrello è cambiato: quante unità si possono ancora aggiungere dipende da quante ce ne sono già
   * (snippets/variant-quantity-limit.liquid), quindi si rilegge la section. Niente richiesta se la variante non ha limiti.
   * Il pulsante di aggiunta non si sostituisce: può avere il focus, e con il cassetto aperto il browser deve poterglielo
   * restituire. Per lo stesso motivo si spegne con aria-disabled, che lascia il focus dov'è.
   */
  async refreshCartLimit() {
    const addButton = this.querySelector('button[name="add"]');
    if (!addButton?.hasAttribute('data-limited') || !this.dataset.variantId) return;

    this.limitRequest?.abort();
    this.limitRequest = new AbortController();
    const { signal } = this.limitRequest;
    const sellingPlan = this.querySelector('input[name="selling_plan"]:checked')?.value;
    const planParam = sellingPlan ? `&selling_plan=${sellingPlan}` : '';
    const url = `${this.dataset.productUrl}?variant=${this.dataset.variantId}${planParam}&section_id=${this.dataset.sectionId}`;

    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = new DOMParser().parseFromString(await response.text(), 'text/html').querySelector('product-page');
      if (!next) return;

      const part = this.querySelector('[data-product-part="quantity"]');
      const replacement = next.querySelector('[data-product-part="quantity"]');
      if (part && replacement) {
        const input = part.querySelector('input[name="quantity"]');
        const hadFocus = part.contains(document.activeElement);
        const value = input?.value;
        part.replaceWith(replacement);
        const newInput = input && document.getElementById(input.id);
        this.restoreField(newInput, value);
        this.syncQuantity();
        if (hadFocus) (newInput?.disabled ? addButton : newInput)?.focus();
      }

      const nextButton = next.querySelector('button[name="add"]');
      if (!nextButton) return;
      addButton.dataset.labelIdle = nextButton.dataset.labelIdle;
      addButton.toggleAttribute('data-limited', nextButton.hasAttribute('data-limited'));
      addButton.disabled = false;
      addButton.setAttribute('aria-disabled', String(nextButton.disabled));
      // Durante "Aggiunto" l'etichetta resta: la nuova arriva da sola allo scadere del messaggio (onSubmit)
      if (!['adding', 'added'].includes(addButton.dataset.state)) this.setButtonState(addButton, 'idle');
    } catch (error) {
      if (error.name !== 'AbortError') console.error('[product-page] aggiornamento del limite di quantità non riuscito', error);
    }
  }

  /* ---------- Aggiunta al carrello ---------- */

  get headerSection() {
    return getHeaderSection();
  }

  async onSubmit(event) {
    const form = event.target;
    if (!form.matches('form[action*="/cart/add"]')) return;
    event.preventDefault();

    const button = form.querySelector('button[name="add"]');
    if (!button || button.disabled || button.getAttribute('aria-busy') === 'true') return;
    if (button.getAttribute('aria-disabled') === 'true') return;

    const errorBox = form.querySelector('[data-product-form-error]');
    errorBox.hidden = true;
    this.markRecipientErrors(form);
    this.setButtonState(button, 'adding');

    try {
      const formData = new FormData(form);
      // shopify:cart:lines-update (standard event) avvolge la richiesta; postCart chiede anche
      // l'HTML aggiornato di header e carrelli (cassetto, se presente)
      const data = await withCartEvent({
        target: this,
        eventClass: 'CartLinesUpdateEvent',
        payload: {
          action: 'add',
          context: this.dataset.cartContext || 'product',
          lines: [{ merchandiseId: String(formData.get('id')), quantity: Number(formData.get('quantity') || 1) }],
        },
        run: () => postCart('add', formData),
        getCart: fetchAjaxCart, // cart/add.js restituisce gli articoli aggiunti, non il carrello
      });

      // Nell'anteprima rapida (<dialog> nel top layer) l'immagine in volo resterebbe sotto il pannello
      const quickView = this.closest('quick-view');
      if (!quickView) await this.flyToCart();
      renderCartSections(data.sections);
      this.resetRecipient(form);
      this.setButtonState(button, 'added');
      setTimeout(() => this.setButtonState(button, 'idle'), SUCCESS_LABEL_MS);

      // L'anteprima rapida si chiude prima che si apra il carrello a cassetto (cart.js), se attivo
      await quickView?.afterAddToCart?.();
      document.dispatchEvent(new CustomEvent('cart:item-added', { detail: data }));
      // Senza cassetto nulla mostrerebbe l'aggiunta: dopo la chiusura dell'anteprima rapida il pulsante non si vede più
      if (!document.querySelector('cart-drawer')) showCartAddedToast();
    } catch (error) {
      errorBox.textContent = error.data ? error.message : errorBox.dataset.genericError;
      errorBox.hidden = false;
      this.markRecipientErrors(form, error.data?.errors);
      this.setButtonState(button, 'idle');
    }
  }

  setButtonState(button, state) {
    const label = button.querySelector('[data-add-label]');
    const labels = { idle: button.dataset.labelIdle, adding: button.dataset.labelAdding, added: button.dataset.labelAdded };
    label.textContent = labels[state];
    button.dataset.state = state;
    button.setAttribute('aria-busy', String(state === 'adding'));
  }

  /** L'immagine del prodotto "vola" nel carrello dell'header, che poi sobbalza (esempio "Add to basket"). */
  async flyToCart() {
    const target = this.headerSection?.querySelector('[data-header-cart]');
    const sourceImage = this.querySelector('[data-product-part="media"] img');
    if (!target || !sourceImage || prefersReducedMotion()) return;

    // L'header "a scomparsa" deve essere visibile per far atterrare l'animazione
    this.headerSection.removeAttribute('data-header-hidden');

    const from = sourceImage.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    if (from.width === 0 || from.bottom < 0 || from.top > window.innerHeight) return; // immagine fuori schermo

    const size = Math.min(140, from.width);
    const startX = from.left + from.width / 2 - size / 2;
    const startY = from.top + from.height / 2 - size / 2;
    const dx = to.left + to.width / 2 - (startX + size / 2);
    const dy = to.top + to.height / 2 - (startY + size / 2);

    const flyer = document.createElement('div');
    flyer.setAttribute('aria-hidden', 'true');
    Object.assign(flyer.style, {
      position: 'fixed',
      left: `${startX}px`,
      top: `${startY}px`,
      width: `${size}px`,
      height: `${size}px`,
      zIndex: '60',
      pointerEvents: 'none',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-400)',
      background: `center / cover no-repeat url("${sourceImage.currentSrc || sourceImage.src}")`,
    });
    document.body.append(flyer);

    const duration = 0.6;
    await animate(
      flyer,
      {
        translate: arcKeyframes(dx, dy),
        scale: [1, 0.25],
        opacity: [1, 1, 1, 0],
      },
      { duration, ease: [0.55, 0, 0.75, 0.5] },
    );
    flyer.remove();

    // Il carrello "incassa" il colpo
    animate(target, { scale: [1, 1.15, 0.95, 1] }, { duration: 0.4, ease: 'easeOut' });
  }
}

if (!customElements.get('product-page')) {
  customElements.define('product-page', ProductPage);
}
