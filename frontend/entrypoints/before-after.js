/**
 * Prima/dopo — custom element <before-after> (sections/before-after.liquid).
 *
 * La posizione del divisore è la variabile --position (%) sul riquadro: il CSS ritaglia "prima" e sposta il divisore.
 * - Cursore nativo (visivamente nascosto): tastiera e lettori di schermo, aria-valuetext con la percentuale.
 * - Puntatore: clic/tocco sposta il divisore nel punto (animato), trascinando lo segue (senza animazione).
 *   Il trascinamento parte solo da un movimento orizzontale: in verticale scorre la pagina (touch-action: pan-y).
 */

const EASING_MS = 220;

class BeforeAfter extends HTMLElement {
  connectedCallback() {
    this.frame = this.querySelector('[data-before-after-frame]');
    this.input = this.querySelector('[data-before-after-input]');
    if (!this.frame || !this.input) return;

    this.abort = new AbortController();
    const { signal } = this.abort;
    this.input.addEventListener('input', () => this.setPosition(Number(this.input.value), true), { signal });
    this.frame.addEventListener('pointerdown', this.onPointerDown, { signal });
    this.frame.addEventListener('pointermove', this.onPointerMove, { signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.frame.addEventListener(type, this.onPointerEnd, { signal });
    }
  }

  disconnectedCallback() {
    this.abort?.abort();
    clearTimeout(this.easingTimer);
  }

  percentAt(clientX) {
    const rect = this.frame.getBoundingClientRect();
    return Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
  }

  setPosition(percent, eased = false) {
    const value = Math.round(percent * 10) / 10;
    if (eased) {
      this.frame.setAttribute('data-easing', '');
      clearTimeout(this.easingTimer);
      this.easingTimer = setTimeout(() => this.frame.removeAttribute('data-easing'), EASING_MS);
    } else {
      this.frame.removeAttribute('data-easing');
    }
    this.frame.style.setProperty('--position', `${value}%`);
    this.input.value = String(Math.round(value));
    this.input.setAttribute(
      'aria-valuetext',
      this.input.dataset.valueTemplate.replace('[percent]', String(Math.round(value))),
    );
  }

  onPointerDown = (event) => {
    if (event.button !== 0) return;
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
    // Mouse e penna: il divisore va subito nel punto. Tocco: si aspetta di capire se è uno scorrimento verticale
    if (event.pointerType !== 'touch') {
      event.preventDefault(); // niente selezione né trascinamento dell'immagine
      this.frame.setPointerCapture(event.pointerId);
      this.pointer.dragging = true;
      this.setPosition(this.percentAt(event.clientX), true);
    }
  };

  onPointerMove = (event) => {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!pointer.dragging) {
      const dx = Math.abs(event.clientX - pointer.x);
      const dy = Math.abs(event.clientY - pointer.y);
      if (dx < 6 || dx < dy) return;
      pointer.dragging = true;
      this.frame.setPointerCapture(event.pointerId);
    }
    this.setPosition(this.percentAt(event.clientX));
  };

  onPointerEnd = (event) => {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    // Tocco senza trascinamento: è un tap, il divisore va nel punto
    if (event.type === 'pointerup' && !pointer.dragging) this.setPosition(this.percentAt(event.clientX), true);
    this.pointer = null;
  };
}

if (!customElements.get('before-after')) {
  customElements.define('before-after', BeforeAfter);
}
