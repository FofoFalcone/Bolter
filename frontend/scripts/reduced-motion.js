/**
 * Preferenza "riduci movimento" del sistema operativo, letta al momento della chiamata (l'utente può cambiarla
 * con la pagina aperta). Per reagire al cambio con un listener serve invece il MediaQueryList (matchMedia).
 */
export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
