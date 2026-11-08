# Esempi Motion utilizzabili nel tema

Analisi di tutti gli esempi su [motion.dev/examples](https://motion.dev/examples) (482 esempi JS/React/Vue/Svelte, esclusi i demo 3D Three.js/vgpu), aggiornata al **2026-11-02**.

| Stato | Esempi |
|---|---|
| Codice completo gratuito sulla pagina | **138** (32 JS, 56 React, 50 Vue) |
| Solo scheletro del tutorial (codice completo con Motion+) | 69 |
| Nessun sorgente in pagina (Motion+) | 275 |

- Gli esempi **JS** si adattano quasi direttamente (custom element + section Liquid).
- Gli esempi **React/Vue** vanno **riscritti** in JS vanilla: si riprendono comportamento e parametri di Motion, non il codice del framework.
- Il codice va sempre adattato alle convenzioni del progetto (vedi `CLAUDE.md`): HTML nativo e funzionante senza JS dove possibile, `motion/mini` quando basta, `prefers-reduced-motion`, nessuna animazione above-the-fold, JS caricato solo dove serve.
- URL di un esempio: `https://motion.dev/examples/<slug>` (es. `js-accordion`). Demo live: `https://examples.motion.dev/<framework>/<nome>`.

## Section ricavabili dagli esempi gratuiti

| Section | Esempio | Lavoro | Stato |
|---|---|---|---|
| FAQ accordion | `js-accordion` | adattamento | ✅ `sections/faq-accordion.liquid` |
| Collezioni/contenuti in tab con indicatore animato | `js-tab-select` | adattamento | ✅ `sections/collection-tabs.liquid` |
| Galleria orizzontale guidata dallo scroll verticale (sticky + traslazione) | `js-scroll-pinning` (+ idee da `react-scroll-horizontal`) | adattamento | ✅ `sections/scroll-gallery.liquid` |
| Immagine con testo in parallax | `js-parallax` | adattamento | ✅ `sections/image-with-text-parallax.liquid` |
| Hero con media e profondità allo scorrimento (media più lento, testo che sale e sfuma) | `js-parallax` (concetto) | riscrittura: `scroll()` collegato ad animazioni `motion/mini` → ViewTimeline nativa; ingresso del media solo CSS (`@starting-style`), nulla che ritardi l'LCP | ✅ `sections/main-index.liquid` (`frontend/entrypoints/hero.js`) |
| Frase del brand rivelata parola per parola con lo scroll | `react-text-scroll-word-reveal` | riscrittura | ✅ `sections/scroll-text-reveal.liquid` |
| Griglia che compare a onda dal centro | `js-stagger-grid` | attributo `data-animate-from` + preset `pop` | ✅ `frontend/scripts/animations.js`, cambio tab in `collection-tabs` |
| Scorrimento morbido della pagina (Lenis guidato dal frame loop di Motion) | `js-lenis-smooth-scroll` | adattamento (impostazione del tema, solo puntatore preciso, rispetto di reduced motion, stop con dialog/menu) | ✅ `frontend/scripts/smooth-scroll.js` (globale, da `theme.js`) |

## Section scritte da zero ispirate a esempi Motion+

Codice originale del tema con le API gratuite di Motion: dall'esempio Motion+ si riprendono solo l'idea e l'elenco delle opzioni, mai il codice.

| Section | Esempio di riferimento (Motion+) | Stato |
|---|---|---|
| Galleria 3D con 8 disposizioni (lista, griglia, coverflow, pila, cilindro, anello, spirale, sfera), trascinamento con inerzia, apertura dell'elemento | `react-gallery-playground` (componente `Gallery`, solo React e a pagamento) | ✅ `sections/gallery.liquid` (`frontend/entrypoints/gallery.js` + una disposizione per file in `frontend/entrypoints/gallery-<nome>.js`, caricata solo quella scelta; base comune `frontend/scripts/gallery-arrangements.js`, molla da `frontend/scripts/spring-value.js`) |
| Anteprima rapida con effetto "warp": l'immagine della card vola nel pannello piegandosi in prospettiva, il pannello si espande dalla card | `react-warp-overlay` (sezione Experimental, sorgente solo Motion+: non visto, effetto reinterpretato) | ✅ `snippets/quick-view.liquid` + `frontend/entrypoints/quick-view.js` (molle `motion/mini` + `spring`), aperta dalle card prodotto di `gallery` |
| Transizioni tra pagine: dissolvenza, tendina, tendina diagonale, iride (anche dal punto cliccato), persiane, lamelle, ante; header fermo; immagine della card che diventa quella del prodotto | categoria `page-transitions`: tutti "Curtains" Motion+ (`js-curtains-*`, `react-curtains-*`), codice non usato | ✅ View Transitions native tra documenti (`snippets/page-transitions.liquid`, `frontend/entrypoints/page-transitions.css`), tutto dopo il caricamento della pagina nuova (niente attesa prima della navigazione). Rivelazioni: fade, wipe, clip wipe, iris (anche dal clic), blinds, shutter, doors. Coperture a tessere: pixel e tendina a fasce (tessere create in `pagereveal`, ritardi per tessera generati). Modalità mista (effetto casuale, mai uguale al precedente) |
| Ticker di loghi e testi: base, verticale, guidato dallo scroll, trascinabile, ai bordi dello schermo, da destra a sinistra, cursore, effetto per posizione, testo che diventa striscia al passaggio | categoria `ticker`: tutti componente `Ticker` di Motion+, solo React e Vue, sorgente non usato | ✅ `sections/ticker.liquid` (`frontend/entrypoints/ticker.js`, una sola animazione WAAPI del binario con `motion/mini`, `scroll()` sulla ViewTimeline nativa, `SpringValue` per trascinamento e cursore; `frontend/entrypoints/ticker-rows.js` per l'elenco). Un preset per ogni esempio |
| Carosello con slide miste (prodotti di una collezione, singoli prodotti, immagini con testo): frecce, pallini, pallini che si rimpiccioliscono, contatore, barra di avanzamento, scorrimento libero, fino ai bordi dello schermo, parallasse, coverflow, autoplay | categoria `carousel`: 30 esempi React e Vue, componente `Carousel` di Motion+ (`motion-plus/react`), sorgente non usato | ✅ `sections/carousel.liquid` (`frontend/entrypoints/carousel.js` su scroll-snap nativo; `frontend/entrypoints/carousel-effects.js` con `scroll()` sulle timeline native, caricato solo se serve). Non fatti: loop infinito (rinuncerebbe allo scorrimento nativo), verticale, RTL, miniature, lightbox e barra trascinabile: da aggiungere se servono |

## Section di contenuto con il sistema dichiarativo

Nessun codice dagli esempi: `data-animate-stagger` e `data-animate` (`frontend/scripts/animations.js`), che riprendono gli esempi gratuiti `js-scroll-triggered`, `js-stagger` e `js-stagger-grid`. Mai nella prima section della pagina.

| Section | Movimento | Stato |
|---|---|---|
| Contenuto libero con theme blocks | blocchi in sequenza (`fade-up`) | ✅ `sections/content.liquid`, `blocks/{heading,text,button,image,group}.liquid` |
| Colonne | colonne in sequenza (`fade-up`), freccia del link all'hover | ✅ `sections/columns.liquid` |
| Elenco collezioni | card in sequenza (`fade-up`), zoom all'hover | ✅ `sections/collection-list.liquid` |
| Newsletter | ingresso `fade-up`, tre puntini durante l'invio, comparsa della conferma con `starting:` | ✅ `sections/newsletter.liquid` |
| Punti sull'immagine | punti in sequenza (`pop`), tre impulsi all'ingresso (`motion/mini` con `repeat`), volo verso l'anteprima rapida | ✅ `sections/shop-the-look.liquid`, `frontend/entrypoints/shop-the-look.js` |

> Nota: `js-scroll-pinning`, nonostante il nome, è una galleria orizzontale (non uno storytelling con immagine fissa e paragrafi). Uno storytelling di quel tipo non ha un esempio gratuito: andrebbe scritto da zero con `scroll()` di Motion.

## Componenti per i template

| Dove | Esempio | Uso |
|---|---|---|
| Template prodotto | `js-add-to-basket` | ✅ Immagine che "vola" nel carrello dell'header + sobbalzo (`frontend/entrypoints/product.js`, con `motion/mini` e traiettoria calcolata invece di `arc`) |
| Pulsanti ATC / carrello / invio form | `js-loading-three-dots-pulse` (ritmo: 1,2s, sfasamento 0,2s, scala 1 → 1,5) | ✅ Puntini su `button[aria-busy]` in solo CSS (`frontend/styles/components.css`) |
| Immagini e blocchi in caricamento | `react-skeleton-shimmer` (riscritto: `translate` sul compositor invece di `background-position`) | ✅ `media-loading` e `skeleton` (`frontend/styles/loading.css`) |
| Barra tra le pagine | `js-loading-progress-bar` (solo Motion+: codice non visto, solo l'idea) | ✅ `navigation-progress` (`frontend/styles/loading.css`, `frontend/scripts/loading-states.js`), non indica un avanzamento reale |
| Header | `vue-scroll-hide-header`, `react-scroll-hide-header` | Header che si nasconde scorrendo giù e riappare risalendo |
| Cart drawer / quick view | `vue-radix-dialog`, `react-animate-presence-modes`, `js-layout-animation` | ✅ Cassetto: `<dialog>` nativo con transizioni CSS (`cart.css`); ✅ rimozione articoli con chiusura animata della riga (`cart.js`, `motion/mini`). ✅ Quick view: `quick-view.js` (effetto warp, vedi sopra) |
| Card prodotto → quick view | `react-animate-view-app-store` | Espansione della card nel dettaglio |
| Blog / articolo | `react-scroll-linked` | ✅ Barra di avanzamento lettura, solo CSS con view timeline nativa (`frontend/entrypoints/reading-progress.css`, impostazione di `main-article`) |
| Pulsanti CTA | `react-rolling-text-button` | Testo che scorre all'hover |
| Campi di testo | `js-characters-remaining` | Contatore caratteri (messaggio regalo, contatti) |
| Icone | `js-svg-path-morphing` | Hamburger → X |
| Caricamenti | `react-skeleton-shimmer` | Placeholder shimmer (ricerca predittiva, carrello) |

## Categoria Radix (`motion.dev/examples?category=radix`)

Radix Primitives è una libreria di componenti React (e porting Vue) senza stile: nel tema non si può usare e in gran parte la sostituisce l'HTML nativo. Dei 30 esempi (15 componenti, React e Vue) è gratuito solo `vue-radix-dialog`: gli altri sono Motion+, quindi riscritti da zero con le API gratuite, senza vederne il codice.

| Componente | Nel tema | Stato |
|---|---|---|
| Accordion, Tabs, Dialog, Dropdown | `accordion-item`, `collection-tabs`, `<dialog>` (cassetto, anteprima rapida, lightbox), popover nativi dell'header | ✅ |
| Progress | Barra della spedizione gratuita (`snippets/cart-free-shipping.liquid`), riempimento a molla senza rimbalzo | ✅ |
| Toast | `snippets/toast.liquid` + `frontend/scripts/toast.js`: popover, uno alla volta | ✅ |
| Tooltip | Utility `tooltip` (solo CSS, Esc in `frontend/scripts/tooltips.js`): campioni colore, ricerca dell'header, comandi del lightbox. Non sulle card: la riga dei colori scorre e lo taglierebbe, resta `title` | ✅ |
| Checkbox | Utility `checkbox` + `check-tick`: icona Heroicons che si scopre con `clip-path` (è una forma piena, non un tratto da disegnare), pressione | ✅ |
| Radio Group | Chip, campioni e piani di acquisto: colori già in transizione, aggiunta la pressione | ✅ |
| Slider con `AnimateNumber` | Etichetta col valore sopra la maniglia di `<price-range>`: niente cifre animate, resterebbero indietro rispetto al dito (e `AnimateNumber` è Motion+) | ✅ |
| Switch, Toggle Group | Solo con un caso d'uso reale (filtro on/off, griglia o lista) | Non fatti |
| Select | Il `<select>` nativo funziona meglio su mobile | Scartato |
| Context Menu, Toolbar | Sostituire il clic destro ostacola "apri in nuova scheda"; nessun punto del tema ha bisogno di una toolbar | Scartati |

## Esempi gratuiti completi (elenco)

**JS (32):** accordion, add-to-basket, bounce-easing, characters-remaining, color-interpolation, drag-constraints, drag-lock-direction, gestures, html-content, layout-animation, lenis-smooth-scroll, loading-circle-spinner, loading-jumping-dots, options, page-wipe, parallax, press, reorder-items, scroll-fade, scroll-pinning, scroll-triggered, shared-layout-animation, shared-view-animation, stagger, stagger-from-edges, stagger-grid, stagger-random, svg-loading-spinner, svg-path-morphing, tab-select, use-transform, view-animation

**React (56):** accordion, add-to-basket, animate-presence-modes, animate-view-app-store, animate-view-clip-path, animate-view-reorder, animate-view-toggle, animate-view-types, aspect-ratio, bounce-easing, characters-remaining, clerk-card-stack, clerk-conditional-field, clerk-sign-in, clerk-user-button, color-interpolation, color-picker¹, conic-gradient-pointer, css-spring, cursor-floating-target¹, drag-constraints, drag-lock-direction, enter-animation, exit-animation, follow-pointer-with-spring, html-content, keyframes, keyframes-wildcards, layout-anchor, layout-animation, lenis-smooth-scroll, loading-circle-spinner, loading-jumping-dots, motion-path, path-drawing, path-morphing, reorder-grid, reorder-items, rolling-text-button, scroll-container, scroll-hide-header, scroll-horizontal, scroll-linked, scroll-linked-with-spring, scroll-track-element-in-viewport, scroll-triggered, shared-layout-animation, skeleton-shimmer, state-updates, text-scroll-word-reveal, transition, use-animation-frame, use-presence-data, use-time, use-transform, variants

**Vue (50):** accordion, animate-presence-modes, animate-view-app-store, animate-view-clip-path, animate-view-reorder, animate-view-skeleton, animate-view-toggle, animate-view-types, aspect-ratio, bounce-easing, characters-remaining, color-picker¹, conic-gradient-pointer, css-spring, drag-constraints, drag-lock-direction, enter-animation, exit-animation, follow-pointer-with-spring, html-content, keyframes, keyframes-wildcards, layout-animation, loading-circle-spinner, loading-jumping-dots, motion-path, number-formatting¹, parallax, path-drawing, path-morphing, radix-dialog, reorder-grid, reorder-items, scale-correction, scroll-container, scroll-hide-header, scroll-horizontal, scroll-linked, scroll-linked-with-spring, scroll-track-element-in-viewport, scroll-triggered, shared-layout-animation, split-text¹, split-text-wavy¹, state-updates, transition, use-animation-frame, use-time, use-transform, variants

¹ Il codice è visibile ma importa il pacchetto a pagamento `motion-plus`.

## Solo con Motion+ (non gratuiti)

Carousel (tutte le varianti: autoplay, coverflow, thumbnail gallery, lightbox, loop, parallax…), Ticker/marquee, Image reveal slider (prima/dopo), Scroll zoom hero, Scroll image reveal, Hero stagger, Footer reveal, Mega menu, Split text / Text reveal / Typewriter / Scramble text, Number counter / Price switcher / Number trend, Tilt card, Cursor (follow, magnetic, trail…), Curtains, Gallery (tutte), Lightbox, Modal / Sheet modal, Smooth tabs, Toast stack, Scroll highlight, Scroll text lines.

Opzioni: acquistare [Motion+](https://motion.dev/plus) (pagamento unico, codice MIT; prezzi da verificare su [motion.dev/pricing](https://motion.dev/pricing)), oppure implementare da zero i componenti standard (carousel, marquee, slider prima/dopo) con le API pubbliche di Motion, **senza copiare** il codice Motion+.
