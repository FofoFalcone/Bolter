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
- [ ] Lighthouse sul tema di sviluppo: richiede `npm run shopify:push:dev`, da chiedere all'utente

## Galleria prodotto

- [x] Lightbox con zoom, contatore del carosello mobile, griglia senza buchi
- [x] Video, video esterni e modelli 3D caricati al clic, con "Vedi nel tuo spazio"
- [x] Layout scelto dal merchant (griglia oppure foto grande con miniature)
- [ ] Da provare su Shopify con un prodotto che abbia video caricato, video YouTube o Vimeo e modello 3D: l'output dei filtri Liquid e le funzioni `model-viewer-ui` e `shopify-xr` sono stati provati solo con markup e funzioni simulate

## 5. Valutati

- [x] `agents.md.liquid`: si resta sul file gestito da Shopify
- [x] Template `metaobject`: non serve finché lo store non ha metaobject con pagina web
- [x] Barra di lettura nel blog (l'header a scomparsa esisteva già)
- [x] Colori: palette (`color_palette`) e colori per section, al posto degli schemi di colore (scelta dell'utente del 2026-11-05, vedi shopify-alignment.md)
- [x] Attributi del carrello: confezione regalo, messaggio regalo, data di consegna
- [ ] Nuova architettura dei temi Fall '26: ancora in anteprima, da riprendere quando sarà stabile

## Da provare nel browser dell'utente

Non verificabili in Chrome headless o senza dati sullo store. Con `npm run start:watch`:

- Pagine nuove: `/password` da connessi, una URL inesistente per la 404, `/collections`, e il buono regalo dal link di un ordine di prova (o dall'editor, Modelli → Altri)
- `<shopify-account>` nell'header a 375 e 990px, anche sopra una hero con header trasparente
- Aggiornamenti via fetch: varianti, carrello, filtri, anteprima rapida con pagamento rapido
- Con i dati adatti sullo store: selling plan, regole di quantità, ritiro in negozio, buono regalo con destinatario, righe annidate, combined listings
- Card e pagina articolo con la barra di lettura (lo store non ha articoli)
- Galleria prodotto e lightbox su telefono vero, soprattutto iOS: pinch, spostamento con un dito, swipe tra le immagini (provati solo con il touch emulato di Chrome). Con un prodotto da 3 o più foto: griglia, contatore e frecce (lo store ne ha al massimo 2). Cambio variante con foto diverse (il proxy risponde 302 in headless)
- Palette nell'editor (Impostazioni tema → Colori): una palette scura su tutte le pagine, compreso il testo sopra le immagini della hero
- Attributi del carrello nell'editor (Impostazioni tema → Carrello) e con `npm run start:events`; un ordine di prova per vederli in admin
- Section nuove nell'editor, a 375, 750 e 990px: `content` (preset "Testo con immagine", blocchi annidati, aggiunta di un blocco), `columns`, `collection-list`, `newsletter`, `shop-the-look`
- Newsletter: iscrizione vera, email già iscritta, consenso con e senza policy, conferma con `?customer_posted=true`, stessa section anche nel footer
- `shop-the-look`: anteprima rapida da punto e da riga, tastiera, tocco, punti vicini ai bordi, `shopify:product:view` delle righe con `npm run start:events`

## Sullo store

- Al 2026-11-05 tutti i 227 prodotti risultano esauriti ("In stock": 0): il cliente non può aggiungere nulla al carrello. Probabile effetto dell'importazione del 4 novembre, da controllare nelle giacenze
