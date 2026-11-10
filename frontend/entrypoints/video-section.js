/**
 * Video — custom element <video-section> (sections/video.liquid).
 *
 * - "Al clic": il player (video Shopify o iframe YouTube/Vimeo) sta in un <template> e si inserisce al clic sul
 *   pulsante, che sparisce; il focus passa al player. Uscendo dalla vista si ferma (YouTube e Vimeo con postMessage:
 *   l'iframe di YouTube ha enablejsapi=1, Vimeo accetta i comandi di default).
 * - "Sfondo" (data-ambient): video muto in loop, parte solo con movimento consentito, senza risparmio dati e quando è
 *   in vista; il pulsante pausa/riproduzione (WCAG 2.2.2) mette data-paused sul riquadro per scegliere l'icona.
 *   La scelta del cliente vale finché resta sulla pagina.
 *
 * Caricato dalla section con {% render 'vite-tag', entry: 'video-section.js' %} solo se ha un video.
 */

const MOTION_QUERY = '(prefers-reduced-motion: no-preference)';
const YOUTUBE_PAUSE = '{"event":"command","func":"pauseVideo","args":""}';
const VIMEO_PAUSE = '{"method":"pause"}';
const VISIBLE_RATIO = 0.5; // Sotto questa quota in vista, il video si ferma

function pausePlayer(element) {
  if (element.matches('video')) {
    element.pause();
    return;
  }
  const { origin, hostname } = new URL(element.src);
  if (hostname.includes('youtube')) element.contentWindow?.postMessage(YOUTUBE_PAUSE, origin);
  else if (hostname.includes('vimeo')) element.contentWindow?.postMessage(VIMEO_PAUSE, origin);
}

class VideoSection extends HTMLElement {
  connectedCallback() {
    this.abort = new AbortController();
    const { signal } = this.abort;
    this.holder = this.querySelector('[data-video-holder]');
    this.addEventListener('click', this.onClick, { signal });
    if (this.hasAttribute('data-ambient')) this.setupAmbient(signal);
  }

  disconnectedCallback() {
    this.abort.abort();
    this.observer?.disconnect();
  }

  onClick = (event) => {
    const play = event.target.closest('[data-video-play]');
    if (play) {
      this.activate(play);
      return;
    }
    if (event.target.closest('[data-video-toggle]') && this.video) {
      this.wantsPlay = this.video.paused;
      this.syncAmbient();
    }
  };

  /* ---------------------------------------------------------------- Al clic */

  activate(button) {
    const player = this.querySelector('template[data-video-player]')?.content.firstElementChild?.cloneNode(true);
    const element = player?.querySelector('video, iframe');
    if (!element) return;

    this.holder.append(player);
    button.remove();
    element.focus({ preventScroll: true });
    // Rifiutato dal browser (politiche di autoplay): restano i controlli nativi
    if (element.matches('video')) element.play().catch(() => {});

    this.observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio < VISIBLE_RATIO) pausePlayer(element);
      },
      { threshold: [0, VISIBLE_RATIO] },
    );
    this.observer.observe(element);
  }

  /* ----------------------------------------------------------------- Sfondo */

  setupAmbient(signal) {
    this.video = this.holder.querySelector('video');
    this.toggle = this.querySelector('[data-video-toggle]');
    if (!this.video) return;

    this.motionQuery = window.matchMedia(MOTION_QUERY);
    this.wantsPlay = this.canAutoplay();
    this.inView = false;

    this.video.addEventListener(
      'playing',
      () => {
        this.video.setAttribute('data-ready', '');
        this.setPaused(false);
      },
      { signal },
    );
    this.video.addEventListener('pause', () => this.setPaused(true), { signal });
    this.motionQuery.addEventListener(
      'change',
      () => {
        this.wantsPlay = this.canAutoplay();
        this.syncAmbient();
      },
      { signal },
    );

    this.observer = new IntersectionObserver(([entry]) => {
      this.inView = entry.isIntersecting;
      this.syncAmbient();
    });
    this.observer.observe(this.holder);
    this.setPaused(!this.wantsPlay);
  }

  canAutoplay() {
    return this.motionQuery.matches && !navigator.connection?.saveData;
  }

  syncAmbient() {
    const { video } = this;
    if (this.wantsPlay && this.inView) {
      // play() può essere rifiutato (autoplay, risparmio energetico): resta la copertina
      video.play()?.catch(() => this.setPaused(true));
    } else if (!video.paused) {
      video.pause();
    } else {
      this.setPaused(true);
    }
  }

  setPaused(paused) {
    this.holder.toggleAttribute('data-paused', paused);
    if (!this.toggle) return;
    this.toggle.setAttribute('aria-label', paused ? this.toggle.dataset.labelPlay : this.toggle.dataset.labelPause);
  }
}

if (!customElements.get('video-section')) {
  customElements.define('video-section', VideoSection);
}
