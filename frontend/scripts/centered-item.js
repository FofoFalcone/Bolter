/**
 * Segnala quale figlio di un elenco a scorrimento orizzontale sta al centro: l'area osservata è una striscia
 * verticale a metà dell'elenco, quindi nessun gestore di scroll e nessun calcolo per fotogramma.
 *
 * @param {HTMLElement} list contenitore che scorre
 * @param {(index: number) => void} onChange indice del figlio arrivato al centro
 * @returns {IntersectionObserver} da scollegare con disconnect()
 */
export function watchCenteredItem(list, onChange) {
  const items = Array.from(list.children);
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onChange(items.indexOf(entry.target));
      }
    },
    { root: list, rootMargin: '0px -49% 0px -49%' },
  );
  items.forEach((item) => observer.observe(item));
  return observer;
}
