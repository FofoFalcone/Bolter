# Roadmap del tema

Ordine di lavoro concordato il 2026-11-05. Lo stato delle singole funzionalità Shopify sta in [shopify-alignment.md](shopify-alignment.md): qui solo la sequenza e cosa resta aperto.

## 1. Template mancanti

- [x] Password (`layout/password.liquid` + `templates/password.json`)
- [x] 404
- [x] list-collections
- [x] gift_card

## 2. Privacy e account

- [x] Consenso: lo gestisce il banner di Shopify, il tema non ha tracciamenti propri. Aggiunta l'icona di opt-out nel footer
- [x] Account: `<shopify-account>` nell'header; i template `customers/` non servono più

## 3. Funzioni di acquisto

- [x] Abbonamenti (selling plan) nel form prodotto
- [x] Regole di quantità e prezzi a scaglioni
- [x] Rate (`payment_terms`)
- [x] Ritiro in negozio
- [x] Destinatario della gift card
- [x] Righe annidate e bundle
- [x] Pagamento rapido nell'anteprima rapida

## 4. Controllo finale prima del push

- [x] Changelog temi: voci dal 15 settembre 2026 lette tutte, mesi precedenti con ricerca mirata
- [x] Skill `theme-review` sui file modificati
- [x] `theme.css` sotto la soglia: nuova soglia ~18 KiB in Brotli, decisa con l'utente il 2026-11-06 (17,35 KiB Brotli, 21,35 KiB gzip; Vite, in base 1000, mostra 129,97 kB e 22,09 kB gzip). Utility tenute in un solo file. Simulazioni sul CSS compilato, tutte in KiB (non provate nel browser, Brotli al livello massimo, livello del CDN non verificato):
  - utility usate solo da file di pagina: 639 regole, 5,07 kB Brotli; nessuna section pesa più di 0,7 kB;
  - un foglio per section: home 19,76 kB con 10 richieste, prodotto 16,00 kB con 3, collezione 15,08 kB con 2, oltre al problema dell'ordine della cascata;
  - famiglie di fogli ordinate con cascade layer: servono 91 layer e un plugin di build, `theme.css` resta a 14,29 kB, home 18,20 kB, percorso home → collezione → prodotto 21,59 kB con 4 richieste invece di 17,35 kB con 1;
  - solo `button-glass` e `skeleton` fuori dal file: 0,14 kB in meno e una richiesta in più sulla pagina prodotto.
- [x] Lighthouse sul tema di sviluppo (2026-11-11, home `/en-it`, mobile, simulazione): Performance 75, FCP 2,9 s e LCP 5,0 s stimati contro 0,54 s e 0,59 s misurati, TBT 45 ms, CLS 0. Il divario veniva dai 26 script del tema con priorità alta prima del primo disegno → JS delle section con `snippets/vite-tag-deferred.liquid`.
- [x] Rimisurato dopo `vite-tag-deferred` (2026-11-11, una esecuzione): Performance 79 (da 75), FCP 3,0 s e LCP 4,5 s stimati contro 0,48 s misurati, TBT 50 ms, CLS 0. HTML della home 444 KB (84 KB trasferiti): nella simulazione ogni risorsa parte solo a documento scaricato.
- [x] Interventi dello stesso giorno: preload del font 600 (pulsanti, barra annunci; scoperto dal CSS con priorità massima, contato come bloccante); CSS delle section inlinato (`snippets/inline-css.liquid`, `gallery.css` da 115 byte era tra le risorse bloccanti); `hero.js` dopo il load con il solo effetto allo scroll (`when: 'idle'`, via tre moduli ad alta priorità dalla prima ondata); segnaposto SVG di `scroll-gallery` solo nel theme editor; link del carosello senza titolo con il nome del prodotto o della collezione invece di "Scopri di più".
- [x] Traccia Performance di DevTools (2026-11-11, home `/it-it`, CPU 4×, con statistiche dei selettori attive): LCP 653 ms, CLS 0,0005, ma 3,5 s di ricalcolo stili, con ricalcoli dell'intera pagina (~850 elementi, ~540 ms gonfiati dalla strumentazione) a ogni nodo aggiunto, anche dagli script di Shopify. Cause: `html:has(site-header[data-sticky]) :is(:focus, :target)`, varianti `overlay:`/`under-header:` ancorate su `body:has(…)` con `*` finale, e `cssTarget` predefinito di Vite che univa in un `:is()` le 41 regole dei colori derivati. Corretto (regole in CLAUDE.md); misura sull'HTML della traccia in Chrome headless senza rallentamento: da ~5,5 a ~0,2 ms per nodo aggiunto in `body`, da ~5,8 a ~0,8 ms in `main`, stili calcolati identici sui 959 elementi a 412 e 1280 px. Confermato con una traccia delle 18:07 (Moto G Power, CPU 4× reale, cache disabilitata, statistiche spente): ricalcolo stili 342 ms in tutto, 6 task oltre 50 ms (il più lungo 130 ms, pixel `wpm` di Shopify), TBT ~165 ms; i prefetch del checkout di Shopify (`checkout-web/assets/c1/*.js`) non generano task. Il Lighthouse in modalità simulata dello stesso pomeriggio dava invece TBT 4.660 ms per ~90 task "non attribuibili" da ~24 ms dopo ciascuno di quei prefetch, assenti nella traccia reale: per il TBT usare il throttling applicato da DevTools (impostazioni di Lighthouse), non quello simulato. Nei 15 report Lighthouse del 2026-11-11 la catena di prefetch c'è sempre (68-140 file, `preloads.js` di `content_for_header`), ma i task dopo ogni prefetch compaiono solo dalle 16:55 (38/43, poi 83/89 alle 17:58), mai dalle 00:39 alle 10:15. Non riprodotti con la home attuale completa (tema + script di Shopify + vero `preloads.js`, 140 prefetch) in Chrome pulito con emulazione mobile e screenshot come Lighthouse, 3 giri: 0 task. Ipotesi aperta: stato del browser/DevTools durante quei giri; se ricompare, salvare la traccia del giro Lighthouse stesso ("View Trace" nel report) per vedere cosa c'è nei task.
- [x] Lighthouse 2026-11-12 (home `/it-it`, mobile, simulazione, una esecuzione): Performance 64, FCP 2,1 s, LCP 4,3 s, TBT 740 ms, CLS 0; misurati FCP 1,04 s e LCP 1,19 s. Il calo rispetto al 79 dell'11/11 viene dal TBT: 4 task da 55-68 ms reali (×4 in simulazione) attorno al login con Shop che `<shopify-account>` prepara subito nel suo dialog (`login-form.js`, `shop-login`, iframe `shop.app/accounts/pre_auth` con ~30 script e un font da 65 KB), più `wpm` e `perf-kit` di Shopify. Corretto `contact-form.js` del footer, che partiva con priorità alta perché nel gruppo footer `section.index` vale 1. Hero: richiesta solo a HTML finito (996 ms, documento a 991 ms) nonostante `preload: true`; sorgente PNG servita come WebP da 56 KB (Lighthouse stima 41 KB in meno con più compressione). `Server-Timing` del documento: `processing` 69 ms, quindi il server non è il collo di bottiglia. Sorgente 1536 × 864 px: con la hero a tutta altezza su un telefono da 412 × 823 se ne vede il 28% centrale, ingrandito circa 3,4 volte, e il soggetto (stampante) resta sul bordo. Preparati per il merchant un JPEG intero e un ritaglio 9:16 (486 × 864) da caricare come immagine per smartphone; `srcset` mobile di `main-index` ora include la larghezza originale (prima un ritaglio da 486 px offriva solo 375w). Login con Shop rimandato: `<shopify-account>` per i non connessi montato all'intenzione (`frontend/scripts/account-deferred.js`), provato in Chrome headless con un componente finto (clic prima della definizione, ripiego senza `open`, mouse sopra, Ctrl+clic) e con il vero `account.js` (il foglio si apre); non ancora provato sullo store né rimisurato con Lighthouse. Rimisurato (Lighthouse mobile del 2026-11-12, una esecuzione): Performance 82, TBT 78 ms (da 740), FCP 1,4 s, CLS 0, LCP simulato 4,7 s contro 0,64 s osservati. L'LCP simulato viene dalla banda divisa: nei primi ~640 ms partono ~500 KB, di cui ~220 KB di Shopify (`content_for_header`: pixel, webmcp, perf-kit, banner privacy, shop-js), 3 font da ~40 KB, HTML 75 KB compressi (355 KB), hero 56 KB (ancora il PNG). Moduli Motion e `product-card.js` ora importati da `theme.js` con `loadWhenNeeded` (`frontend/scripts/deferred-scripts.js`: section a meno di uno schermo dalla vista o pagina caricata), non più insieme alla foto LCP; provato in Chrome headless (sotto la piega: dopo load; in vista: subito; scorrendo prima del load: allo scroll).
- [ ] Da rimisurare (mediana di 3-5 esecuzioni, tema caricato con `npm run shopify:push:dev`). Aperti: peso dell'HTML della home (12 card nelle tab di `collection-tabs` più 6 nella galleria, da misurare sull'HTML reale), contrasto di `scroll-text-reveal` per axe (parole a opacità 15%: scelta di design), meta description della home (Preferenze del negozio, non il tema), foto hero con sorgente PNG e ritaglio mobile non impostato, `theme.css` a 19,39 KiB Brotli il 2026-11-11 (sopra la soglia di ~18; era 18,94, poi 19,48 prima della correzione dei `:has()`).

## Galleria prodotto

- [x] Lightbox con zoom, contatore del carosello mobile, griglia senza buchi
- [x] Video, video esterni e modelli 3D caricati al clic, con "Vedi nel tuo spazio"
- [x] Layout scelto dal merchant (griglia oppure foto grande con miniature)
- [ ] Da provare su Shopify con un prodotto che abbia video caricato, video YouTube o Vimeo e modello 3D: l'output dei filtri Liquid e le funzioni `model-viewer-ui` e `shopify-xr` sono stati provati solo con markup e funzioni simulate

## 5. Valutati

- [x] `agents.md.liquid`: si resta sul file gestito da Shopify
- [x] Template `metaobject`: non serve finché lo store non ha metaobject con pagina web
- [x] Barra di lettura nel blog (l'header a scomparsa esisteva già)
- [x] Colori: schemi di colori (`color_scheme_group` + `color_scheme` in 34 section), al posto della palette usata dal 2026-11-05 (scelta dell'utente del 2026-11-10, vedi shopify-alignment.md)
- [x] Attributi del carrello: confezione regalo, messaggio regalo, data di consegna
- [ ] Nuova architettura dei temi Fall '26: ancora in anteprima, da riprendere quando sarà stabile

## Da provare nel browser dell'utente

Non verificabili in Chrome headless o senza dati sullo store. Con `npm run start:watch`:

- Pagine nuove: `/password` da connessi, una URL inesistente per la 404, `/collections`, e il buono regalo dal link di un ordine di prova (o dall'editor, Modelli → Altri)
- `<shopify-account>` nell'header a 375 e 990px, anche sopra una hero con header trasparente
- Aggiornamenti via fetch: varianti, carrello, filtri, anteprima rapida con pagamento rapido
- Con i dati adatti sullo store: selling plan, regole di quantità, ritiro in negozio, buono regalo con destinatario, righe annidate, combined listings
- Card e pagina articolo con la barra di lettura (lo store non ha articoli)
- Galleria prodotto e lightbox su telefono vero, soprattutto iOS: pinch, spostamento con un dito, swipe tra le immagini (provati solo con il touch emulato di Chrome). Con un prodotto da 3 o più foto: griglia, contatore e frecce (al 2026-11-10 solo "Selling Plans Ski Wax" ne ha 3). Cambio variante con foto diverse (il proxy risponde 302 in headless)
- Schemi di colori nell'editor (Impostazioni tema → Colori): uno schema scuro come schema della pagina, compreso il testo sopra le immagini della hero; aggiunta, modifica ed eliminazione di uno schema; card e badge su `scheme-4` (arancione), che seguono la section
- Attributi del carrello nell'editor (Impostazioni tema → Carrello) e con `npm run start:events`; un ordine di prova per vederli in admin
- Section nuove nell'editor, a 375, 750 e 990px: `content` (preset "Testo con immagine", blocchi annidati, aggiunta di un blocco), `columns`, `collection-list`, `newsletter`, `shop-the-look`
- Newsletter: iscrizione vera, email già iscritta, consenso con e senza policy, conferma con `?customer_posted=true`, stessa section anche nel footer
- `shop-the-look`: anteprima rapida da punto e da riga, tastiera, tocco, punti vicini ai bordi, `shopify:product:view` delle righe con `npm run start:events`
- Modifiche al carrello da agenti e app (2026-11-09), con `npm run start:events`: `updateCart` chiamata dall'inspector con il cassetto chiuso (toast "Carrello aggiornato", "Vai al carrello" apre il cassetto), con il cassetto aperto e sulla pagina carrello (solo annuncio, niente toast); con carrello "Pagina" il link porta a `/cart`. Se possibile, un agente WebMCP vero in Chrome
- Section del 2026-11-10 nell'editor, a 375, 750 e 990px: `featured-product` (cambio variante, aggiunta al carrello, pagamento rapido; "Selling Plans Ski Wax" ha 3 foto e piani di acquisto; anche con lo stesso prodotto della pagina prodotto), `video` (Shopify, YouTube, Vimeo, modalità sfondo), `testimonials`, `before-after` (telefono vero: tap, trascinamento orizzontale, scorrimento verticale sopra l'immagine), `comparison-table` (scorrimento sotto i 750px), `countdown` (anche nel gruppo header; scadenza con la pagina aperta), selettori di paese e lingua nel footer (compaiono solo con più di un paese o lingua)
- Politica di reso nei dati strutturati della home: Rich Results Test dopo `npm run shopify:push:dev`

## Sullo store

- Catalogo ricontrollato il 2026-11-10 (`/en-it/products.json` dal proxy di `theme dev`): 13 prodotti pubblicati il 9 novembre (dati di esempio Shopify, snowboard), al posto dei 227 esauriti del 5 novembre. Disponibili 10 prodotti, 16 varianti su 22. Esauriti: "The Out of Stock Snowboard" (voluto dai dati di esempio), "The 3p Fulfilled Snowboard" e "Gift Card" (motivo non verificato, forse mercato Italia o buoni regalo non attivi). Per le prove: "Selling Plans Ski Wax" (3 foto, piani di acquisto), "The Complete Snowboard" (5 varianti), "The Compare at Price Snowboard" (prezzo barrato), "The Videographer Snowboard" (forse un video), "The Multi-location Snowboard" (ritiro in negozio). Gli altri hanno 1 sola foto
