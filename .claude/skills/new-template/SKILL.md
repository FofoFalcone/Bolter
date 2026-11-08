---
name: new-template
description: Crea un template Shopify per bolt-theme (product, collection, cart, page, 404, search, blog, article, list-collections, password, gift_card o un template alternativo come product.landing) insieme alla sua section principale `main-*`, seguendo le convenzioni del progetto. Usala quando l'utente chiede di creare/aggiungere un template o una pagina di tipo Shopify, o quando una pagina dello store non ha ancora un template.
---

# Nuovo template

Le regole generali sono in `CLAUDE.md`. Per la section principale applica anche la skill `new-section` (schema, asset Vite, animazioni, accessibilità).

## 1. Verifica le fonti prima di scrivere

Gli oggetti Liquid disponibili, i form e i requisiti cambiano per ogni template: **non andare a memoria**. Usa la skill `shopify` del plugin Shopify AI Toolkit (topic `liquid`) per cercare nella documentazione ufficiale il template richiesto, ad esempio:

- "product template product form variant selection"
- "collection template filters sort_by paginate"
- "cart template cart form checkout"

Controlla anche `templates/` e `sections/` esistenti per riutilizzare snippet e section già presenti.

## 2. Struttura dei file

| Template | File template | Section principale | Note |
|---|---|---|---|
| product | `templates/product.json` | `sections/main-product.liquid` | `{% form 'product', product %}`, variante con `product.selected_or_first_available_variant`, prezzi con `| money`, media con `image_url` + `image_tag` |
| collection | `templates/collection.json` | `sections/main-collection.liquid` | `{% paginate collection.products by N %}`, filtri `collection.filters`, ordinamento `collection.sort_options` |
| cart | `templates/cart.json` | `sections/main-cart.liquid` | form verso `routes.cart_url`, pulsante `name="checkout"`, stato vuoto |
| page | `templates/page.json` | `sections/main-page.liquid` | `page.title`, `page.content` |
| 404 | `templates/404.json` | `sections/main-404.liquid` | testi da `locales` (`general.404.*`) |
| search | `templates/search.json` | `sections/main-search.liquid` | `search.results`, `paginate`, form verso `routes.search_url` |
| blog / article | `templates/blog.json`, `templates/article.json` | `main-blog`, `main-article` | paginazione articoli, commenti se abilitati |
| list-collections | `templates/list-collections.json` | `main-list-collections` | `collections` |
| password | `templates/password.json` | `main-password` | richiede `layout/password.liquid` |
| gift_card | `templates/gift_card.liquid` | — | template Liquid, non JSON; layout dedicato |

Template alternativi (es. `product.landing.json`) riusano le stesse section con impostazioni o ordine diversi.

Formato JSON:

```json
{
  "sections": {
    "main": { "type": "main-product", "settings": {} }
  },
  "order": ["main"]
}
```

## 3. Regole

- Usa sempre `routes.*` per gli URL dello store (mai percorsi hardcoded come `/cart`).
- Ogni testo fisso dell'interfaccia va in `locales/it.default.json` **e** `locales/en.json` e si usa con `| t`. Aggiungi le chiavi mancanti nello stesso task. Per gli schema delle section `main-*`: `npm run schema:i18n` + traduzioni in `locales/en.schema.json`.
- Above-the-fold (titolo prodotto, immagine principale, titolo collezione): nessun `data-animate`; immagine LCP con `loading: 'eager'` e `fetchpriority: 'high'`.
- Logica interattiva (selettore varianti, filtri, carrello) come custom element in un entrypoint dedicato (`frontend/entrypoints/product.js`, `collection.js`, `cart.js`), caricato dalla section con `{% render 'vite-tag', entry: '…' %}`. Mai in `theme.js`.
- Le section `main-*` di solito non hanno `presets` (non devono essere aggiungibili altrove) e possono avere `"enabled_on"` o restrizioni coerenti con il template.
- Mantieni il comportamento senza JS: form nativi funzionanti (aggiunta al carrello, filtri via GET) e JS come miglioramento progressivo.

## 4. Verifica

1. `npm run build:check` riuscito e `npm run lint` senza **nuovi** errori Theme Check (in particolare `MissingTemplate`, `UndefinedObject`, `TranslationKeyExists`).
2. Riporta all'utente: file creati, chiavi di traduzione aggiunte, setting disponibili per il merchant, cosa non hai verificato e come provarlo (`npm run start:watch` e apertura della pagina corrispondente nell'anteprima).
