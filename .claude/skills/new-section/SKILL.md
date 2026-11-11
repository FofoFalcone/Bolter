---
name: new-section
description: Crea una nuova section Shopify per bolter-theme seguendo le convenzioni del progetto (schema completo, asset Vite dedicati, animazioni Motion, accessibilità, verifica con Theme Check). Usala quando l'utente chiede di creare/aggiungere una section, un blocco di pagina o un componente della homepage/template.
---

# Nuova section

Segui questi passi in ordine. Le regole generali sono in `CLAUDE.md`.

## 1. Chiarisci prima di scrivere

Se non è già chiaro dalla richiesta, stabilisci: contenuto e campi editabili dal merchant, se servono blocchi ripetibili, comportamento interattivo (JS), comportamento responsive. Se l'utente ha fornito un design (es. Figma), usalo come riferimento.

Per tipi di setting, attributi dello schema o oggetti Liquid su cui non sei certo, consulta la documentazione ufficiale con la skill `shopify` del plugin Shopify AI Toolkit (topic `liquid`) invece di andare a memoria.

## 2. File Liquid: `sections/<nome-kebab>.liquid`

Struttura:

```liquid
{%- comment -%} Breve descrizione della section (+ componente SDS di riferimento, se esiste) {%- endcomment -%}

<div class="page-width py-8 md:py-16">
  {% render 'section-header',
    heading: section.settings.heading,
    intro: section.settings.intro,
    class: 'mb-8 md:mb-12'
  %}

  <ul class="grid gap-4 md:grid-cols-3" role="list">
    {%- for block in section.blocks -%}
      <li class="<nome>__item rounded-lg border border-border bg-surface p-6" {{ block.shopify_attributes }}>
        <h3 class="text-heading text-foreground">{{ block.settings.title | escape }}</h3>
        <div class="prose prose-theme max-w-none text-body">{{ block.settings.text }}</div>
        <a class="button button-primary" href="{{ block.settings.link }}">…</a>
      </li>
    {%- endfor -%}
  </ul>
</div>

{% render 'vite-tag-deferred', entry: '<nome>.js', section_index: section.index %}    {# solo se ha JS dedicato: si carica quando la section si avvicina alla vista #}

{% schema %}
{
  "name": "…",
  "tag": "section",
  "class": "section-<nome>",
  "disabled_on": {
    "groups": ["header", "footer"]
  },
  "settings": [
    { "type": "text", "id": "heading", "label": "Titolo", "default": "…" }
  ],
  "blocks": [],
  "presets": [{ "name": "…" }]
}
{% endschema %}
```

Regole:
- **Dove si può aggiungere**: senza `enabled_on`/`disabled_on` Shopify rende la section aggiungibile ovunque, anche nei gruppi header e footer. Section di contenuto → `"disabled_on": { "groups": ["header", "footer"] }`; section dell'header → `"enabled_on": { "groups": ["header"] }` (idem per il footer); section principali di un template → `"enabled_on": { "templates": ["<tipo>"] }`. Solo uno dei due attributi per section.
- Ogni testo visibile al merchant viene da un setting (con `default` sensato) o da `| t` (chiave sia in `it.default.json` sia in `en.json`).
- Scrivi lo schema in italiano, poi `npm run schema:i18n` e completa `locales/en.schema.json` con le chiavi elencate (vedi "Traduzioni" in `CLAUDE.md`).
- Immagini con `image_url` + `image_tag` (`widths`, `sizes`, `loading`); placeholder con `placeholder_svg_tag` quando l'immagine non è impostata.
- `{{ block.shopify_attributes }}` su ogni blocco.
- Titoli: `h2` di default (l'`h1` appartiene al contenuto principale della pagina).
- Se è above-the-fold (es. hero), nessun `data-animate` e immagine principale con `loading: 'eager'`, `fetchpriority: 'high'`.

## 3. Stili e script (solo se servono)

- **Design**: se esiste un componente corrispondente nel file Figma Simple Design System (vedi `CLAUDE.md` → Design system), usalo come riferimento di layout e token: Figma MCP `create_session`, poi `get_design_context` sul nodo del componente (carica prima la guida `figma-design-to-code`). Non scaricare icone o asset da Figma.
- **Stili con Tailwind nel Liquid**: solo token SDS (`text-heading`, `text-body`, `bg-surface`, `text-muted`, `border-border`, `rounded-md`, `shadow-300`…), componenti `button*` e `prose prose-theme`, varianti `js:` / `js-motion:` per gli stati legati al JS. Niente nomi di classe composti dinamicamente (vedi `CLAUDE.md`).
- **Icone**: `{% render 'icon', name: '…' %}` (Heroicons); se manca, aggiungila a `tools/icons.json` e lancia `npm run icons`.
- CSS dedicato `frontend/entrypoints/<nome>.css` **solo** se le utility non bastano (stati `:not(:defined)`, `[data-state]`, variabili calcolate): dentro `@layer components { … }`, classi con prefisso `<nome>__` come hook. Si carica inline con `{% render 'inline-css', entry: '<nome>.css' %}` (mai `vite-tag`: un `<link>` nel body blocca il rendering; dopo un nuovo entrypoint il watch si riavvia da solo). Altrimenti niente file CSS.
- JS dedicato: `frontend/entrypoints/<nome>.js` che definisce un custom element:

  ```js
  class NomeSection extends HTMLElement {
    connectedCallback() { /* init */ }
    disconnectedCallback() { /* cleanup listener/observer */ }
  }
  if (!customElements.get('nome-section')) customElements.define('nome-section', NomeSection);
  ```

  e nel Liquid il wrapper diventa `<nome-section>`. Così funziona anche quando il theme editor ricarica la section.
- Stili/JS molto piccoli e usati ovunque possono andare nei globali (`theme.css`/`theme.js`) — motivane la scelta.

## 4. Animazioni

Usa gli attributi esistenti (`data-animate`, `data-animate-stagger`, `data-animate-delay`, …) invece di JS custom. Mai sull'elemento LCP o above-the-fold.

## 5. Rendila disponibile

- Se la section deve comparire di default in un template, aggiungila al relativo `templates/*.json` (`sections` + `order`).
- Altrimenti i `presets` bastano per aggiungerla dal theme editor.

## 6. Verifica

1. `npm run build:check` → la build deve riuscire (non usare `npm run build`: tocca `assets/` e il tema remoto se theme dev è attivo); poi `npm run lint` → Theme Check non deve riportare **nuovi** errori sui file creati. (È lo stesso motore del validatore Liquid del plugin Shopify, che qui non serve.)
2. Controlla nell'output della build la dimensione dei nuovi bundle.
3. Riporta all'utente: file creati, setting disponibili per il merchant, cosa non hai potuto verificare (es. resa visiva nel browser) e come provarla (`npm run start:watch` → anteprima del tema `local`).
