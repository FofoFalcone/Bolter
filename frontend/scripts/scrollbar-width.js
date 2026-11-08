/**
 * Larghezza della barra di scorrimento della pagina in --scrollbar-width su <html>, usata per compensarne la
 * scomparsa quando un pannello blocca lo scroll (frontend/styles/scroll-lock.css). Vale 0 con le barre sovrapposte
 * (touch, macOS) e nelle pagine che non scorrono.
 *
 * ResizeObserver: la misura arriva dopo il layout, senza forzarlo all'avvio, e si ripete quando cambiano finestra,
 * zoom o altezza della pagina. A pagina bloccata la barra non c'è: resta valida l'ultima misura.
 *
 * Layout: nella callback prima tutte le letture, poi al più una scrittura, e solo se il valore cambia (con le barre
 * sovrapposte, come sui telefoni, non si scrive mai: 0px è già il ripiego del CSS). L'observer va creato prima di
 * quello di scroll-regions.js (ordine delle chiamate in theme.js).
 *
 * Niente CSS.registerProperty da qui: registrare una proprietà a pagina già stilizzata segna per il ricalcolo lo
 * stile di tutti gli elementi (anche dove poi non si scrive nulla, come sui telefoni). Se la proprietà va resa non
 * ereditata, perché la scrittura ricalcoli il solo <html>, si dichiara con @property nel CSS (scroll-lock.css),
 * letto prima del primo calcolo degli stili.
 */

export function initScrollbarWidth() {
  const root = document.documentElement;
  new ResizeObserver(() => {
    // Letture
    if (getComputedStyle(root).overflowY === 'hidden') return;
    const width = `${window.innerWidth - root.clientWidth}px`;
    const current = root.style.getPropertyValue('--scrollbar-width') || '0px';
    // Scrittura
    if (current !== width) root.style.setProperty('--scrollbar-width', width);
  }).observe(root);
}
