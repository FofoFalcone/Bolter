/**
 * Carrello — custom element <cart-items> (pagina carrello e cassetto) e <cart-drawer>.
 * Markup: sections/main-cart.liquid, sections/cart-drawer.liquid, snippets/cart-line-items.liquid,
 * snippets/cart-summary.liquid. Senza JS tutto funziona con il form verso routes.cart_url.
 *
 * <cart-items>
 * - quantità (input + pulsanti −/+) aggiornate con cart/change.js dopo una breve pausa (debounce);
 * - rimozione: il link url_to_remove viene intercettato; la riga si chiude con un'animazione
 *   (esempio Motion "Layout animation", con motion/mini) mentre la richiesta è in corso;
 * - nota per l'ordine salvata con cart/update.js;
 * - codici sconto: <cart-discount> (cart/update.js con `discount`, standard event shopify:cart:discount-update);
 * - attributi: <cart-attributes> (cart/update.js con `attributes`, standard event shopify:cart:attributes-update);
 * - dopo ogni modifica Shopify restituisce l'HTML aggiornato di header e carrelli (cart-api.js);
 * - barra della spedizione gratuita (snippets/cart-free-shipping.liquid): arriva già con il valore nuovo e qui si anima
 *   dal valore precedente, anche per le modifiche di app e prodotto che passano da renderCartSections.
 *
 * <cart-drawer>
 * - si apre dopo l'aggiunta al carrello (evento cart:item-added da product.js), cliccando il carrello
 *   dell'header e con l'azione standard Shopify.actions.openCart (app e agenti);
 * - <dialog> nativo: focus, Esc e sfondo inerte gestiti dal browser; animazioni in cart.css.
 */

import { animate } from 'motion/mini';
import { spring } from 'motion';
import { postCart, refreshCartSections, renderCartSections, prefersReducedMotion } from '../scripts/cart-api.js';
import { syncQuantitySteps } from '../scripts/quantity-steps.js';
import { withCartEvent } from '../scripts/standard-events.js';
import { showToast } from '../scripts/toast.js';

const QUANTITY_DEBOUNCE_MS = 400;
const NOTE_DEBOUNCE_MS = 600;
// Senza rimbalzo: a fine barra scoprirebbe un tratto vuoto a sinistra
const PROGRESS_SPRING = { type: spring, visualDuration: 0.6, bounce: 0 };

/**
 * Annuncio nella regione live. Il testo è sempre lo stesso ("Carrello aggiornato"): va svuotato e reimpostato
 * dopo un attimo, altrimenti i lettori di schermo non rileggono un testo identico al precedente.
 */
let announceTimer;
function announce(message) {
  const regions = document.querySelectorAll('[data-cart-status]');
  regions.forEach((el) => (el.textContent = ''));
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => regions.forEach((el) => (el.textContent = message)), 100);
}

/** Testo della barra della spedizione gratuita, da annunciare insieme all'esito di una modifica. */
function freeShippingText() {
  return document.querySelector('[data-free-shipping-text]')?.textContent.trim().replace(/\s+/g, ' ') ?? '';
}

class CartItems extends HTMLElement {
  connectedCallback() {
    this.timers = new Map();
    this.onChange = this.onChange.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onInput = this.onInput.bind(this);
    this.onSectionsRendered = this.onSectionsRendered.bind(this);
    this.addEventListener('change', this.onChange);
    this.addEventListener('click', this.onClick);
    this.addEventListener('input', this.onInput);
    document.addEventListener('cart:sections-rendered', this.onSectionsRendered);
    this.shippingProgress = this.currentShippingProgress();
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.onChange);
    this.removeEventListener('click', this.onClick);
    this.removeEventListener('input', this.onInput);
    document.removeEventListener('cart:sections-rendered', this.onSectionsRendered);
    this.timers.forEach(clearTimeout);
  }

  currentShippingProgress() {
    const bar = this.querySelector('[data-free-shipping]');
    return bar ? Number(bar.dataset.progress) : 0;
  }

  /** La barra è appena stata sostituita con il valore nuovo: parte dal precedente, prima che il browser la disegni. */
  onSectionsRendered() {
    const from = this.shippingProgress;
    const to = this.currentShippingProgress();
    this.shippingProgress = to;

    const bar = this.querySelector('[data-free-shipping]');
    if (!bar || from === to || prefersReducedMotion()) return;

    animate(bar.querySelector('[data-free-shipping-fill]'), { translate: [`${from - 100}%`, `${to - 100}%`] }, PROGRESS_SPRING);
    if (to === 100) {
      animate(bar.querySelector('[data-free-shipping-icon]'), { scale: [0.5, 1], opacity: [0, 1] }, { duration: 0.3, delay: 0.3, ease: [0.22, 1, 0.36, 1] });
    }
  }

  onChange(event) {
    const input = event.target.closest('[data-quantity-input]');
    if (!input) return;
    const line = input.closest('[data-line]');
    clearTimeout(this.timers.get(line.dataset.key));
    this.timers.set(
      line.dataset.key,
      setTimeout(() => this.updateLine(line, Math.max(0, Number(input.value) || 0)), QUANTITY_DEBOUNCE_MS),
    );
  }

  onInput(event) {
    const quantity = event.target.closest('[data-quantity-input]');
    if (quantity) {
      syncQuantitySteps(quantity.closest('[data-quantity]'));
      return;
    }

    const note = event.target.closest('[data-cart-note]');
    if (!note) return;
    clearTimeout(this.timers.get('note'));
    this.timers.set(
      'note',
      setTimeout(
        () =>
          // shopify:cart:note-update (standard event)
          withCartEvent({
            target: this,
            eventClass: 'CartNoteUpdateEvent',
            payload: { context: this.eventContext, note: note.value },
            run: () => postCart('update', { note: note.value }),
          }).catch(() => showToast(note.dataset.errorMessage, { tone: 'error' })),
        NOTE_DEBOUNCE_MS,
      ),
    );
  }

  /** Contesto per gli standard events: 'dialog' nel cassetto, 'cart' nella pagina carrello. */
  get eventContext() {
    return this.closest('dialog') ? 'dialog' : 'cart';
  }

  onClick(event) {
    const remove = event.target.closest('[data-cart-remove]');
    if (remove) {
      event.preventDefault();
      this.updateLine(remove.closest('[data-line]'), 0);
      return;
    }

    const step = event.target.closest('button[data-quantity-step]');
    if (step && step.getAttribute('aria-disabled') !== 'true') {
      const box = step.closest('[data-quantity]');
      const input = box.querySelector('[data-quantity-input]');
      if (step.dataset.quantityStep === 'up') input.stepUp();
      else input.stepDown();
      input.dispatchEvent(new Event('change', { bubbles: true }));
      // Subito, senza aspettare la risposta del server: il debounce lascerebbe il pulsante attivo oltre il limite
      syncQuantitySteps(box);
    }
  }

  async updateLine(line, quantity) {
    const errorBox = line.querySelector('[data-line-error]');
    errorBox.hidden = true;
    line.setAttribute('aria-busy', 'true');
    line.classList.add('opacity-50', 'pointer-events-none');

    const collapsing = quantity === 0 ? this.collapse(line) : null;

    try {
      // shopify:cart:lines-update (standard event); cart/change.js restituisce il carrello completo
      const data = await withCartEvent({
        target: this,
        eventClass: 'CartLinesUpdateEvent',
        payload: {
          action: quantity === 0 ? 'remove' : 'update',
          context: this.eventContext,
          lines: [{ id: line.dataset.key, quantity }],
        },
        run: () => postCart('change', { id: line.dataset.key, quantity }),
      });
      await collapsing;
      renderCartSections(data.sections);
      announce(`${document.querySelector('[data-cart-status]')?.dataset.updated ?? ''} ${freeShippingText()}`.trim());
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: data }));
    } catch (error) {
      await collapsing;
      // Ripristina lo stato reale del carrello, poi mostra l'errore sulla riga (se esiste ancora)
      await refreshCartSections().catch(() => {});
      const restored = document.getElementById(line.id) ?? line;
      const box = restored.querySelector('[data-line-error]');
      if (box) {
        box.textContent = error.message;
        box.hidden = false;
      }
    } finally {
      line.removeAttribute('aria-busy');
      line.classList.remove('opacity-50', 'pointer-events-none');
    }
  }

  /** Chiude la riga in altezza e opacità (esempio Motion "Layout animation"). */
  collapse(line) {
    if (prefersReducedMotion()) return Promise.resolve();
    const height = line.getBoundingClientRect().height;
    line.style.overflow = 'hidden';
    return animate(
      line,
      { height: [`${height}px`, '0px'], opacity: [1, 0], paddingTop: '0px', paddingBottom: '0px' },
      { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
    );
  }
}

/**
 * Codici sconto (snippets/cart-discount.liquid): cart/update.js con `discount` = elenco completo dei codici
 * (sostituisce quelli presenti). shopify:cart:discount-update parte all'invio con lo stesso elenco; la promise si
 * risolve col carrello, dove un codice non applicabile ha applicable: false (non è un errore della richiesta).
 * Un codice non valido o non applicabile viene tolto subito dal carrello (senza evento: non è una scelta del
 * cliente) e spiegato sotto il campo. Il contenuto di <cart-items> viene ri-renderizzato a ogni modifica: il
 * messaggio e il focus si applicano al nuovo componente, ritrovato con l'id del campo.
 */
class CartDiscount extends HTMLElement {
  connectedCallback() {
    this.onClick = this.onClick.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.addEventListener('click', this.onClick);
    this.addEventListener('keydown', this.onKeyDown);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.onClick);
    this.removeEventListener('keydown', this.onKeyDown);
  }

  get codes() {
    try {
      return JSON.parse(this.dataset.codes || '[]');
    } catch {
      return [];
    }
  }

  get input() {
    return this.querySelector('[data-discount-input]');
  }

  message(name, code = '') {
    return (this.dataset[`message${name}`] ?? '').replace('[code]', code);
  }

  onKeyDown(event) {
    if (event.key === 'Enter' && event.target.matches('[data-discount-input]')) {
      event.preventDefault();
      this.apply();
    }
  }

  onClick(event) {
    if (event.target.closest('[data-discount-apply]')) {
      this.apply();
      return;
    }
    const remove = event.target.closest('[data-discount-remove]');
    if (remove) {
      const code = remove.dataset.discountRemove;
      this.update(
        this.codes.filter((existing) => existing !== code),
        { announce: this.message('Removed', code) },
      );
    }
  }

  apply() {
    const code = this.input?.value.trim() ?? '';
    if (!code) {
      this.showError(this.message('Empty'));
      return;
    }
    if (this.codes.some((existing) => existing.toLowerCase() === code.toLowerCase())) {
      this.showError(this.message('Duplicate', code));
      return;
    }
    this.update([...this.codes, code], { added: code });
  }

  /** Applica l'elenco `codes`. `added`: codice appena inserito (da controllare); `announce`: messaggio di esito. */
  async update(codes, { added = null, announce: message = '' } = {}) {
    if (this.getAttribute('aria-busy') === 'true') return;
    const inputId = this.input?.id;
    this.setBusy(true);
    this.showError('');

    let error = '';
    try {
      let data = await withCartEvent({
        target: this,
        eventClass: 'CartDiscountUpdateEvent',
        payload: { discountCodes: codes.map((code) => ({ code })) },
        run: () => postCart('update', { discount: codes.join(',') }),
      });

      if (added) {
        const entry = data.discount_codes?.find((item) => item.code.toLowerCase() === added.toLowerCase());
        if (!entry?.applicable) {
          error = this.message('Invalid', added);
          data = await postCart('update', { discount: codes.filter((code) => code !== added).join(',') });
        } else {
          message = this.message('Applied', entry.code);
        }
      }

      renderCartSections(data.sections);
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: data }));
    } catch {
      error = this.message('Error');
      this.setBusy(false);
    }

    // Componente nuovo (ri-renderizzato) o lo stesso se la richiesta è fallita
    const current = (inputId && document.getElementById(inputId)?.closest('cart-discount')) || this;
    if (error) {
      if (added && current.input) current.input.value = added;
      current.showError(error);
      current.input?.focus();
    } else if (message) {
      showToast(message);
      announce(freeShippingText());
      current.input?.focus();
    }
  }

  setBusy(busy) {
    const button = this.querySelector('[data-discount-apply]');
    const label = this.querySelector('[data-discount-label]');
    this.setAttribute('aria-busy', String(busy));
    if (!button || !label) return;
    button.setAttribute('aria-busy', String(busy));
    button.disabled = busy;
    this.idleLabel ??= label.textContent;
    label.textContent = busy ? this.dataset.labelBusy : this.idleLabel;
  }

  showError(text) {
    const box = this.querySelector('[data-discount-error]');
    if (box) box.textContent = text;
    if (text) this.input?.setAttribute('aria-invalid', 'true');
    else this.input?.removeAttribute('aria-invalid');
    // Nel cassetto il campo è in un <details>: con un errore deve essere visibile
    const details = this.querySelector('details');
    if (text && details) details.open = true;
  }
}

/**
 * Attributi del carrello (snippets/cart-attributes.liquid): si salvano da soli con cart/update.js, senza ricaricare le
 * section per non perdere il cursore. La richiesta manda solo i campi del tema (Shopify unisce gli altri), mentre
 * shopify:cart:attributes-update vuole l'elenco completo finale, attributi delle app compresi.
 * Se un'altra modifica ri-renderizza <cart-items> mentre si scrive, il messaggio in sospeso viene salvato comunque.
 */
class CartAttributes extends HTMLElement {
  connectedCallback() {
    this.onChange = this.onChange.bind(this);
    this.onInput = this.onInput.bind(this);
    this.addEventListener('change', this.onChange);
    this.addEventListener('input', this.onInput);
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.onChange);
    this.removeEventListener('input', this.onInput);
    if (this.timer) this.enqueueSave();
  }

  get savedValues() {
    try {
      return JSON.parse(this.dataset.attributes || '{}');
    } catch {
      return {};
    }
  }

  get fields() {
    return this.querySelectorAll('[data-attribute]');
  }

  /** Valori correnti dei campi. Senza confezione spuntata il messaggio non vale, anche se il testo resta nel campo. */
  collect() {
    const values = {};
    this.fields.forEach((field) => {
      if (field.type === 'checkbox') values[field.dataset.attribute] = field.checked ? field.value : '';
      else values[field.dataset.attribute] = field.value.trim();
    });
    const wrap = this.querySelector('[data-attribute-wrap]');
    const message = this.querySelector('[data-attribute-message]');
    if (wrap && !wrap.checked && message) values[message.dataset.attribute] = '';
    return values;
  }

  onInput(event) {
    if (!event.target.matches('[data-attribute-message]')) return;
    this.setStatus('');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.enqueueSave(), NOTE_DEBOUNCE_MS);
  }

  onChange(event) {
    if (event.target.matches('[data-attribute]')) this.enqueueSave();
  }

  /** Una richiesta alla volta: due modifiche ravvicinate non possono arrivare a Shopify in ordine inverso. */
  enqueueSave() {
    clearTimeout(this.timer);
    this.timer = null;
    this.queue = (this.queue ?? Promise.resolve()).then(() => this.save());
  }

  async save() {
    const dateField = this.querySelector('[data-attribute-date]');
    const dateIsInvalid = dateField && !dateField.validity.valid;
    if (dateIsInvalid) dateField.setAttribute('aria-invalid', 'true');
    else dateField?.removeAttribute('aria-invalid');
    if (dateIsInvalid) {
      this.setStatus('');
      this.showError(this.dataset.dateError);
      return;
    }

    const values = this.collect();
    const saved = this.savedValues;
    this.showError('');
    if (Object.entries(values).every(([key, value]) => (saved[key] ?? '') === value)) return;

    const next = Object.fromEntries(Object.entries({ ...saved, ...values }).filter(([, value]) => value !== ''));
    this.setStatus(this.dataset.saving);

    try {
      await withCartEvent({
        // Elemento già sostituito da un ri-rendering: l'evento non arriverebbe a document
        target: this.isConnected ? this : document,
        eventClass: 'CartAttributesUpdateEvent',
        payload: {
          context: this.closest('dialog') ? 'dialog' : 'cart',
          attributes: Object.entries(next).map(([key, value]) => ({ key, value })),
        },
        run: () => postCart('update', { attributes: values }),
      });
      this.dataset.attributes = JSON.stringify(next);
      this.setStatus(this.dataset.saved);
      // Dopo un ri-rendering di <cart-items> il componente in pagina è un altro, con i valori di prima
      document.querySelectorAll('cart-attributes').forEach((other) => {
        if (other !== this) other.applyValues(next);
      });
    } catch {
      // Stato precedente per casella e data; il messaggio resta nel campo, per non far riscrivere il cliente
      this.applyValues(saved, { keepText: true });
      this.setStatus('');
      this.showError(this.dataset.error);
    }
  }

  applyValues(values, { keepText = false } = {}) {
    if (!keepText) this.dataset.attributes = JSON.stringify(values);
    this.fields.forEach((field) => {
      const value = values[field.dataset.attribute] ?? '';
      if (field.type === 'checkbox') field.checked = value !== '';
      else if (!keepText || field.type !== 'textarea') field.value = value;
    });
  }

  setStatus(text) {
    const status = this.querySelector('[data-attributes-status]');
    if (status) status.textContent = text;
  }

  showError(text) {
    const box = this.querySelector('[data-attributes-error]');
    if (box) box.textContent = text;
  }
}

class CartDrawer extends HTMLElement {
  connectedCallback() {
    this.dialog = this.querySelector('dialog');
    this.onDocumentClick = this.onDocumentClick.bind(this);
    this.open = this.open.bind(this);

    document.addEventListener('click', this.onDocumentClick);
    document.addEventListener('cart:item-added', this.open);
    // Shopify.actions.openCart è configurata centralmente (frontend/scripts/standard-events.js)

    // Uscendo dalla pagina (es. "Vai al carrello") il cassetto si chiude: tornando indietro, la pagina
    // ripristinata dalla back/forward cache non deve riapparire con il cassetto aperto.
    this.onPageHide = () => this.close();
    window.addEventListener('pagehide', this.onPageHide);
  }

  disconnectedCallback() {
    document.removeEventListener('click', this.onDocumentClick);
    document.removeEventListener('cart:item-added', this.open);
    window.removeEventListener('pagehide', this.onPageHide);
  }

  open() {
    if (!this.dialog.open) this.dialog.showModal();
  }

  close() {
    this.dialog.close();
  }

  onDocumentClick(event) {
    if (event.target.closest('[data-cart-drawer-close]')) {
      this.close();
      return;
    }
    // Il link al carrello dell'header apre il cassetto (Ctrl/Cmd+clic apre comunque la pagina)
    const trigger = event.target.closest('[data-header-cart]');
    if (trigger && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      this.open();
    }
  }
}

if (!customElements.get('cart-items')) customElements.define('cart-items', CartItems);
if (!customElements.get('cart-drawer')) customElements.define('cart-drawer', CartDrawer);
if (!customElements.get('cart-discount')) customElements.define('cart-discount', CartDiscount);
if (!customElements.get('cart-attributes')) customElements.define('cart-attributes', CartAttributes);
