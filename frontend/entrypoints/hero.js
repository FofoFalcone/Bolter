/**
 * Hero — custom element <hero-banner> (sections/main-index.liquid).
 * Caricato dalla section solo se ha un video o l'effetto di profondità attivo.
 *
 * Video di sfondo:
 * - parte da solo solo con movimento consentito e senza "risparmio dati"; altrimenti resta l'immagine e il
 *   pulsante permette di avviarlo;
 * - è trasparente finché non riproduce (data-ready → dissolvenza sopra l'immagine, nessun salto);
 * - pulsante pausa/riproduzione (WCAG 2.2.2), stato in data-paused su <hero-banner> per le icone;
 * - si ferma fuori dallo schermo e riprende al rientro (se l'utente non l'ha messo in pausa).
 *
 * Profondità allo scorrimento (data-scroll-effect): mentre la hero esce dallo schermo il media scorre più
 * lentamente della pagina e il contenuto sale e sfuma. scroll() di Motion collegato ad animazioni WAAPI di
 * transform/opacity: dove il browser supporta le ViewTimeline l'animazione gira sulla timeline nativa,
 * fuori dal main thread (altrimenti Motion la aggiorna a ogni frame). Con prefers-reduced-motion: reduce
 * la hero è statica.
 * L'aggancio allo scroll si fa dopo il primo layout (afterLayout): scroll() di Motion misura in modo sincrono
 * la hero e la viewport (clientHeight), e in connectedCallback, durante il caricamento, forzava il layout.
 */

// motion/mini: animazioni WAAPI native (scroll() le aggancia alla ViewTimeline del browser)
import { animate } from 'motion/mini';
import { scroll, GroupAnimation } from 'motion';

const MOTION_QUERY = '(prefers-reduced-motion: no-preference)';
const SCROLL_OFFSET = ['start start', 'end start']; // da hero in cima allo schermo a hero uscita

/**
 * Esegue `callback` nel primo callback di un ResizeObserver su `element`, che arriva subito dopo il layout del
 * fotogramma e prima del paint: lì le letture di layout non forzano nulla. Restituisce la funzione che annulla.
 * Non scatta finché l'elemento non è visualizzato (display: none), e allora non serve.
 * Va bene solo perché con SCROLL_OFFSET scroll() non registra ResizeObserver di Motion (a * b = 0 in
 * attach-animation.mjs). Con un offset come 'start start'/'end end' li registrerebbe su hero e <html> durante la
 * consegna delle osservazioni ("ResizeObserver loop completed with undelivered notifications" su window): in
 * quel caso aggancio nel fotogramma dopo, come in scroll-text-reveal.js.
 */
function afterLayout(element, callback) {
  const observer = new ResizeObserver(() => {
    observer.disconnect();
    callback();
  });
  observer.observe(element);
  return () => observer.disconnect();
}

class HeroBanner extends HTMLElement {
  connectedCallback() {
    this.media = this.querySelector('[data-hero-media]');
    this.content = this.querySelector('[data-hero-content]');
    this.video = this.querySelector('video');
    this.toggle = this.querySelector('[data-hero-toggle]');
    this.motionQuery = window.matchMedia(MOTION_QUERY);

    this.onMotionChange = this.onMotionChange.bind(this);
    this.motionQuery.addEventListener('change', this.onMotionChange);

    if (this.video) this.setupVideo();
    if (this.hasAttribute('data-scroll-effect')) this.cancelSetup = afterLayout(this, () => this.setupScroll());
  }

  disconnectedCallback() {
    this.motionQuery?.removeEventListener('change', this.onMotionChange);
    this.visibilityObserver?.disconnect();
    this.cancelSetup?.();
    this.teardownScroll();
  }

  onMotionChange() {
    this.setupScroll();
    if (!this.video) return;
    this.wantsPlay = this.canAutoplay();
    this.syncPlayback();
  }

  // ---------- Video ----------

  canAutoplay() {
    return this.motionQuery.matches && !navigator.connection?.saveData;
  }

  setupVideo() {
    const { video } = this;
    this.wantsPlay = this.canAutoplay();
    this.inView = false;

    video.addEventListener('playing', () => {
      video.setAttribute('data-ready', '');
      this.setPaused(false);
    });
    video.addEventListener('pause', () => this.setPaused(true));

    this.toggle?.addEventListener('click', () => {
      this.wantsPlay = video.paused;
      this.syncPlayback();
    });

    this.visibilityObserver = new IntersectionObserver(([entry]) => {
      this.inView = entry.isIntersecting;
      this.syncPlayback();
    });
    this.visibilityObserver.observe(this);

    this.setPaused(!this.wantsPlay);
  }

  syncPlayback() {
    const { video } = this;
    if (this.wantsPlay && this.inView) {
      // play() può essere rifiutato (politiche di autoplay, risparmio energetico): resta l'immagine
      video.play()?.catch(() => this.setPaused(true));
    } else if (!video.paused) {
      video.pause();
    }
  }

  setPaused(paused) {
    this.toggleAttribute('data-paused', paused);
    if (!this.toggle) return;
    this.toggle.setAttribute('aria-label', paused ? this.toggle.dataset.labelPlay : this.toggle.dataset.labelPause);
  }

  // ---------- Profondità allo scorrimento ----------

  setupScroll() {
    this.teardownScroll();
    if (!this.hasAttribute('data-scroll-effect') || !this.motionQuery.matches) return;

    // Prima tutte le animazioni (scritture), poi un solo scroll(): Motion misura hero e viewport una volta sola
    const animations = [];
    // Media: scende del 30% della propria altezza mentre la hero sale → si muove più lentamente della pagina
    if (this.media) {
      animations.push(animate(this.media, { transform: ['translateY(0%)', 'translateY(30%)'] }, { ease: 'linear' }));
    }
    // Contenuto: sale un po' più veloce della pagina e sfuma entro il 60% del percorso
    if (this.content) {
      animations.push(
        animate(
          this.content,
          { transform: ['translateY(0%)', 'translateY(-15%)'], opacity: [1, 0, 0] },
          { ease: 'linear', opacity: { ease: 'linear', times: [0, 0.6, 1] } },
        ),
      );
    }
    if (animations.length === 0) return;

    const animation = new GroupAnimation(animations);
    this.scrollLink = { animation, stop: scroll(animation, { target: this, offset: SCROLL_OFFSET }) };
  }

  teardownScroll() {
    if (!this.scrollLink) return;
    const { animation, stop } = this.scrollLink;
    // cancel() prima di stop(): rimuove gli stili applicati e la hero torna statica. Nell'ordine opposto stop()
    // di Motion scriverebbe i valori correnti negli stili inline (commitStyles, che ricalcola anche gli stili).
    animation.cancel();
    stop();
    this.scrollLink = null;
  }
}

if (!customElements.get('hero-banner')) {
  customElements.define('hero-banner', HeroBanner);
}
