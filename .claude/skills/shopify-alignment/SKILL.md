---
name: shopify-alignment
description: Garantisce l'allineamento totale di bolt-theme con le funzionalità che Shopify mette a disposizione degli storefront Liquid (ultime Shopify Editions, developer changelog, standard storefront events e actions, nuovi oggetti/filtri/tag Liquid, API dei temi). Usala PRIMA di implementare o modificare qualsiasi funzionalità del negozio (section, template, prodotto, carrello, collezione, ricerca, account, localizzazione, header/footer…), quando l'utente chiede un audit o un controllo di allineamento con Shopify, e dopo l'uscita di una nuova Shopify Edition.
---

# Allineamento con la piattaforma Shopify

Requisito dell'utente: il tema deve sfruttare **praticamente tutte** le funzionalità che Shopify offre agli storefront Liquid implementati a codice, aggiornate all'ultima Edition. Non basta che una feature "funzioni": deve usare le API, gli eventi e i pattern ufficiali più recenti.

Registro dello stato: [docs/shopify-alignment.md](../../../docs/shopify-alignment.md). Va letto all'inizio e aggiornato alla fine.

## Regola d'oro: verifica, non ricordare

La piattaforma cambia ogni pochi mesi (Editions Winter/Spring/Summer/Fall + changelog continuo). **Non affidarti alla memoria del modello**: ogni capability va verificata sulle fonti ufficiali con data. Se una fonte non è raggiungibile, dichiaralo all'utente invece di supporre.

## 1. Inquadra l'area

Individua l'area toccata dal task (prodotto, carrello, collezione, ricerca, account, localizzazione, header/footer, contenuti, trasversale) e leggi nel registro le righe di quell'area, con data dell'ultimo controllo.

## 2. Ricerca (sempre, in parallelo)

1. **Developer changelog, filtro temi**: `https://shopify.dev/changelog?filter=themes` (WebFetch) → tutte le voci successive alla data "Ultimo controllo generale" del registro. Controlla anche le voci "Liquid", "Storefront", "Ajax API".
2. **Shopify Editions**: l'ultima Edition e quella precedente (`https://www.shopify.com/editions`, pagine "for developers"). Cerca annunci su Liquid, temi, storefront, carrello, agenti (WebSearch modalità `extended` se le pagine sono recenti).
3. **Documentazione**: skill `shopify` del plugin Shopify AI Toolkit (`scripts/search_docs.mjs`, topic `liquid` e ricerca senza `--api`) per l'area specifica: oggetti, filtri, tag, best practice.
4. **Standard storefront events and actions** (`https://shopify.dev/docs/api/storefront-events-and-actions`): per ogni interazione commerciale dell'area, quale evento il tema deve emettere e con quale payload; se ci sono nuove azioni da configurare.
5. **Tema di riferimento Shopify (Horizon)** come benchmark dei pattern correnti, quando la documentazione non basta.

## 3. Matrice delle capability

Per l'area, costruisci l'elenco delle capability disponibili partendo dalla checklist qui sotto **e da ciò che hai trovato al punto 2** (la checklist è un punto di partenza, non è esaustiva e può essere superata). Per ognuna decidi:

| Stato | Significato |
|---|---|
| ✅ implementata | presente nel tema, con file di riferimento |
| 🟡 pianificata | da fare, con il task/template in cui verrà fatta |
| ⏳ preview | disponibile solo in developer preview / early access: monitorare |
| 🤖 automatica | fornita da Shopify senza codice del tema (verificare solo di non ostacolarla) |
| ➖ non applicabile | motivazione esplicita (es. non pertinente al tipo di negozio) |

### Checklist di partenza (da verificare sulle fonti)

**Trasversali**: standard events (`shopify:page:view` + eventi dell'area) e actions (`updateCart`, `openCart`, `getCart`); Section Rendering API; app blocks (`@app`) e theme app extensions; theme blocks / blocchi annidati (`blocks/`); section groups; traduzioni negozio + editor; localizzazione (selettori paese/valuta e lingua, form `localization`); SEO (filtro `structured_data`, meta, canonical, dati social); accessibilità; performance (`image_url`/`image_tag`, `preload_tag`, `fetchpriority`, font); consenso privacy (Customer Privacy API / banner Shopify); strumenti per agenti (WebMCP) e nuova architettura dei temi (preview).

**Prodotto**: `option_values` + Section Rendering API; combined listings (`product_option_value.product_url`); prodotti con molte varianti; swatch delle opzioni; selling plan / abbonamenti; prezzo unitario; regole di quantità (min/max/incremento) e prezzi a scaglioni; rate di pagamento (`payment_terms`); disponibilità ritiro in negozio; raccomandazioni (correlati/complementari); destinatario gift card; media video/3D; pulsanti di pagamento rapido; eventi `product:view` e `product:select`.

**Carrello**: eventi `cart:lines-update`, `cart:note-update`, `cart:attributes-update`, `cart:discount-update`, `cart:error`, `cart:view`; azioni configurate; nota e attributi; codici sconto nel carrello; sconti di riga e d'ordine; righe annidate / bundle / add-on; regole di quantità; carrello a cassetto + pagina; pagamento rapido.

**Collezione e ricerca**: filtri Search & Discovery (`collection.filters`, tipi di filtro, swatch), ordinamento, paginazione; ricerca predittiva; eventi `collection:view`, `collection:update`, `search:update`; `product:view` sulle card con il contesto corretto.

**Account e altro**: nuovi customer account (`routes.account_*`), pulsante di login Shop; pagina password; gift card; 404; blog/articoli.

## 4. Implementa

- Segui `CLAUDE.md` (Tailwind/SDS, traduzioni, accessibilità, senza-JS-prima).
- Eventi standard: usa gli helper di `frontend/scripts/standard-events.js` (`withCartEvent`, `withProductSelectEvent`, `<s-view-event>` + filtro `standard_event_data`). Ogni promise di evento deve sempre risolversi o rifiutarsi. Mai emettere eventi cart dopo una chiamata `Shopify.actions.updateCart` (li emette Shopify).
- Ogni modifica al carrello passa da `frontend/scripts/cart-api.js`.

## 5. Verifica

1. `npm run build:check` e `npm run lint` (Theme Check riconosce oggetti e filtri nuovi: un errore su un filtro/oggetto nuovo va investigato sulla documentazione, non aggirato).
2. Eventi: chiedi all'utente di avviare `npm run start:events` (watch + theme dev con `--standard-events-inspector`): il pannello mostra gli eventi emessi, valida i payload (messaggi `[Shopify Standard Events]` in console) e permette di chiamare le azioni a mano.
3. Dichiara cosa non hai potuto verificare nel browser.

## 6. Registro e report

- Aggiorna `docs/shopify-alignment.md`: righe dell'area (stato, file, fonte, data) e, se hai fatto il punto 2.1 completo, la data "Ultimo controllo generale".
- Riporta all'utente una tabella sintetica: capability → stato → cosa è cambiato, con i link alle fonti ufficiali usate.
