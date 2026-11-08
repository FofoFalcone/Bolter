/**
 * Valore numerico animato con la molla di Motion (generatore `spring` + frame loop di Motion),
 * con la velocità sempre disponibile: permette di passare dal trascinamento all'inerzia senza
 * scatti e di interrompere una molla afferrando di nuovo.
 *
 * Usato da frontend/entrypoints/gallery.js al posto di motionValue + animate, che includono
 * l'intero motore di animazione del DOM (circa 25 KB gzip in più nel bundle).
 */

import { cancelFrame, frame, spring } from 'motion';

const VELOCITY_WINDOW = 100; // ms di campioni usati per stimare la velocità

export class SpringValue {
  /** @param {number} value  @param {() => void} onChange chiamata a ogni variazione */
  constructor(value, onChange) {
    this.value = value;
    this.onChange = onChange;
    this.samples = [];
  }

  get() {
    return this.value;
  }

  /** Destinazione della molla in corso, altrimenti il valore attuale. */
  getTarget() {
    return this.target ?? this.value;
  }

  /** Nuovo valore che fa parte di un movimento continuo (trascinamento): conta per la velocità. */
  set(value, time = performance.now()) {
    this.value = value;
    this.samples.push({ value, time });
    while (this.samples.length > 2 && time - this.samples[0].time > VELOCITY_WINDOW) this.samples.shift();
    this.onChange();
  }

  /** Salto immediato: ferma la molla e azzera la velocità. */
  jump(value) {
    this.stop();
    this.samples = [];
    this.value = value;
    this.onChange();
  }

  /** Velocità in unità al secondo; 0 se l'ultimo movimento è troppo vecchio (es. dito fermo). */
  getVelocity() {
    const first = this.samples[0];
    const last = this.samples.at(-1);
    if (!first || first === last || performance.now() - last.time > VELOCITY_WINDOW / 2) return 0;
    return ((last.value - first.value) / (last.time - first.time)) * 1000;
  }

  /** Molla verso `target`, partendo dalla velocità attuale. La promise si risolve a fine corsa o se interrotta. */
  animateTo(target, options) {
    const velocity = this.getVelocity();
    this.stop();
    if (this.value === target && velocity === 0) return Promise.resolve();

    const generator = spring({ ...options, keyframes: [this.value, target], velocity });
    this.target = target;
    let start = null;
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.step = ({ timestamp }) => {
        start ??= timestamp;
        const { value, done } = generator.next(timestamp - start);
        this.set(done ? target : value, timestamp);
        if (done) this.stop();
      };
      frame.update(this.step, true);
    });
  }

  stop() {
    if (this.step) cancelFrame(this.step);
    this.step = null;
    this.target = null;
    this.resolve?.();
    this.resolve = null;
  }
}
