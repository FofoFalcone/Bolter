# bolter-theme

Tema Shopify moderno con pipeline di build basata su [Vite](https://vitejs.dev/) e [vite-plugin-shopify](https://github.com/barrel/shopify-vite/tree/main/packages/vite-plugin-shopify) (noto anche come **Volt** nella documentazione del plugin).

Il plugin collega Vite al tema Shopify: compila JavaScript e CSS, genera automaticamente lo snippet Liquid `vite-tag` e pubblica gli asset compilati in `assets/` (serviti dal CDN Shopify).

---

## Perché Vite / Volt?

`vite-plugin-shopify` (Volt) collega una toolchain frontend moderna al tema Shopify. I vantaggi principali:

- **Sorgenti organizzati** in `frontend/` invece di JS/CSS sparsi in `assets/`
- **Moduli ES**, import, alias (`@/`, `~/`), TypeScript, Sass, PostCSS, Tailwind
- **Build in watch** — ogni salvataggio ricompila JS/CSS e `shopify theme dev` li carica sul tema di sviluppo
- **Build ottimizzata** — minificazione, hash per cache busting, gestione dipendenze npm
- **Snippet `vite-tag` automatico** — niente gestione manuale di `asset_url` e nomi file

Volt **non impone** un unico bundle JS e un unico CSS. Il template di partenza carica `theme.js` e `theme.css` dal layout su ogni pagina per semplicità, ma puoi (e, su temi reali, dovresti) suddividere il caricamento per pagina, template o section. Vedi [Strategia di caricamento asset](#strategia-di-caricamento-asset).

---

## Requisiti

- **Node.js** 22.12+ (richiesto da `vite-plugin-shopify` 5.x)
- **Shopify CLI** 3.77+ — [Installazione](https://shopify.dev/docs/api/shopify-cli)
- Accesso a uno store Shopify (development store o store di produzione)

---

## Struttura del progetto

```
bolter-theme/
├── frontend/                  # Sorgenti gestiti da Vite (NON caricati su Shopify)
│   ├── entrypoints/           # Entry point del bundle (uno per file)
│   │   ├── theme.js
│   │   └── theme.css
│   ├── scripts/               # Moduli JS riutilizzabili
│   ├── styles/                # Fogli CSS parziali (@import da theme.css)
│   ├── assets/                # Immagini, font, SVG importati da CSS/JS (output con hash)
│   └── public/                # File copiati così come sono in assets/ (es. richiamati con asset_url)
├── assets/                    # ⚠️ Output generato da Vite — non modificare, non in git
│   └── .vite/manifest.json
├── layout/
│   └── theme.liquid           # Layout principale con vite-tag
├── sections/                  # Sezioni Liquid del tema
├── snippets/
│   └── vite-tag.liquid        # ⚠️ Generato dal plugin — non modificare, non in git
├── vite.config.js             # Configurazione Vite + vite-plugin-shopify
├── shopify.theme.toml         # Ambienti Shopify CLI (local / development / production)
├── .theme-check.yml           # Configurazione linter Liquid (Theme Check)
├── .shopifyignore             # File esclusi dal push al tema remoto
└── package.json
```

---

## Come funziona

### 1. Entry point automatici

`vite-plugin-shopify` rileva automaticamente i file in `frontend/entrypoints/` come entry point di Vite. Ogni file diventa un bundle separato:

| Sorgente                         | Output (esempio)          |
| -------------------------------- | ------------------------- |
| `frontend/entrypoints/theme.js`  | `assets/theme.[hash].js`  |
| `frontend/entrypoints/theme.css` | `assets/theme.[hash].css` |

Puoi aggiungere altri entry point (es. `product.js`, `collection.js`) e caricarli dove serve nel tema.

> **Nota:** avere pochi entry point nel layout non è un vincolo di Volt, ma una scelta del template iniziale. Vedi [Strategia di caricamento asset](#strategia-di-caricamento-asset).

### 2. Snippet `vite-tag`

Il plugin genera `snippets/vite-tag.liquid`. **Non modificarlo a mano**: viene sovrascritto ad ogni build.

Nel layout lo usi così (sintassi compatibile con il parser Liquid strict di Shopify):

```liquid
{% render 'vite-tag', entry: 'theme.css' %}
{% render 'vite-tag', entry: 'theme.js' %}
```

Il JS delle section passa invece da `snippets/vite-tag-deferred.liquid` (scritto a mano, non generato): mette i tag di `vite-tag` in un `<template>` che `frontend/scripts/deferred-scripts.js` inserisce a priorità bassa quando la section si avvicina alla vista, o a pagina caricata con `when: 'idle'`. Così gli script delle section sotto la piega non competono con CSS, font e immagine LCP.

```liquid
{% render 'vite-tag-deferred', entry: 'carousel.js', section_index: section.index %}
```

### 3. Modalità sviluppo vs produzione

| Modalità                      | Comportamento                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Watch** (`npm run watch`)   | Build non minificata con sourcemap inline, ricompilata ad ogni salvataggio. `vite-tag.liquid` usa `asset_url`. |
| **Build** (`npm run build`)   | Build di produzione: svuota `assets/`, compila con hash, aggiorna `vite-tag.liquid` con `asset_url`.       |

In sviluppo avvia **Vite e Shopify CLI insieme**:

```bash
npm run start:watch  # vite build --watch, poi shopify theme dev dopo la prima build
```

Gli asset sono file reali in `assets/` (come in produzione), quindi la preview funziona su qualsiasi dispositivo e browser. `shopify theme dev` usa l'ambiente **`local`** (tema development personale e nascosto), mai il tema condiviso.

> Il dev server con HMR (`vite` + `vite-tag` che punta a `localhost`) è stato rimosso di proposito: funzionava solo sul browser della macchina che esegue Vite e richiedeva una seconda modalità da mantenere.

#### Modifiche fatte nel theme editor

Di base `shopify theme dev` sincronizza in **una sola direzione** (file locali → tema di sviluppo) e all'avvio sostituisce il tema remoto con i file locali: le modifiche fatte nel theme editor del tema di sviluppo restano solo sul tema remoto e vanno perse al riavvio.

Per lavorare anche dall'editor usa:

```bash
npm run start:sync                 # come start:watch + --theme-editor-sync
npm run start:sync -- --events     # in più l'inspector degli standard events
npm run start:sync -- -- --reconciliation-strategy keep-remote   # flag extra per theme dev dopo il secondo --
```

Con `--theme-editor-sync` la CLI salva nei file locali i JSON modificati dall'editor: `templates/*.json`, `sections/*-group.json`, `config/settings_data.json`. Se all'avvio un JSON locale è diverso da quello remoto, la CLI chiede quale tenere (`keep-local` / `keep-remote`).

- Le modifiche dell'editor diventano **modifiche in git**: rivedile e committale (o scartale) come il resto del codice.
- `npm run shopify:push:dev` invia anche `config/settings_data.json` e i template JSON: sovrascrive le personalizzazioni del tema condiviso. La produzione esclude `settings_data.json` (`ignore` in `shopify.theme.toml`), ma non i template JSON.
- Ogni salvataggio nell'editor che tocca `templates/*.json` fa ricompilare il CSS (Tailwind legge anche quei file): è normale vedere una build nel terminale.

> **Nota sul watch:** in watch `assets/` non viene svuotata ad ogni rebuild (eviterebbe cancellazioni/ricaricamenti continui su `shopify theme dev`), quindi i file con hash vecchi si accumulano durante la sessione. Li rimuove la successiva `npm run build`.

### 4. Cosa viene pushato su Shopify

`.shopifyignore` esclude dal push file di sviluppo (`frontend/`, `node_modules/`, `vite.config.js`, `shopify.theme.toml`, `assets/.vite/`, ecc.). Su Shopify arrivano solo i file Liquid e gli asset compilati in `assets/`.

Gli script `shopify:push:*` eseguono **automaticamente `npm run build` prima del push** (hook `preshopify:push:*` in `package.json`): non è possibile pushare per errore asset non minificati o non aggiornati.

> **Nota:** `shopify theme push` cancella dal tema remoto i file che non esistono in locale: è così che spariscono anche dal tema gli asset con hash obsoleti.

---

## Configurazione iniziale

### 1. Installare le dipendenze

```bash
npm install
```

### 2. Configurare `shopify.theme.toml`

Tre ambienti, ognuno con un ruolo preciso:

```toml
[environments.local]            # usato da `shopify theme dev`
store = "il-tuo-store.myshopify.com"
# nessun theme: la CLI usa un tema "development" personale e nascosto

[environments.development]      # tema condiviso (QA/cliente): riceve solo build
store = "il-tuo-store.myshopify.com"
theme = "123456789"

[environments.production]
store = "il-tuo-store.myshopify.com"
theme = "987654321"
ignore = ["config/settings_data.json"]
```

| Ambiente      | Usato da                  | Tema                                                      |
| ------------- | ------------------------- | --------------------------------------------------------- |
| `local`       | `start:watch`, `start:events`, `start:sync` | Tema development personale creato dalla CLI (per utente)  |
| `development` | `shopify:push:dev`, `shopify:pull` | Tema condiviso, solo build di produzione         |
| `production`  | `shopify:push:prod`       | Tema live                                                 |

- **store**: dominio `.myshopify.com` dello store
- **theme**: ID numerico del tema (Admin → Online Store → Themes → … → Edit code → URL contiene l'ID)
- **ignore**: evita di sovrascrivere le impostazioni del merchant in `settings_data.json`

### 3. Autenticazione Shopify CLI

```bash
shopify auth login
```

### 4. (Opzionale) Scaricare un tema esistente

```bash
npm run shopify:pull
```

---

## Script npm

| Comando                     | Descrizione                                                     |
| --------------------------- | --------------------------------------------------------------- |
| `npm run start:watch`       | Avvia la build in watch, poi `shopify theme dev` dopo la prima build (evita asset non sincronizzati sullo store) |
| `npm run start:events`      | Come `start:watch`, con l'inspector degli standard storefront events (eventi `shopify:*` e azioni) |
| `npm run start:sync`        | Come `start:watch`, e le modifiche fatte nel theme editor vengono salvate nei file JSON locali (`--theme-editor-sync`) |
| `npm run watch`             | Solo build in watch (non minificata, sourcemap inline); si riavvia da solo se aggiungi/rimuovi un entrypoint |
| `npm run build`             | Build produzione → svuota e rigenera `assets/` + `vite-tag.liquid`   |
| `npm run build:check`       | Build di verifica in `.build-check/`: non tocca `assets/` né `vite-tag` (sicura con theme dev attivo) |
| `npm run lint`              | Theme Check (esegue la build solo se `vite-tag.liquid` manca)        |
| `npm run icons`             | Rigenera `snippets/icon.liquid` dalle Heroicons in `tools/icons.json` |
| `npm run deploy:branch -- <branch> [--push]` | Consegna il tema compilato su un branch del repository di consegna (`.deploy/`, vedi `tools/deploy-branch.mjs`): conserva impostazioni, template e testi salvati dall'editor del negozio |
| `npm run license`           | Rigenera `snippets/license.liquid` da `LICENSE` e `THIRD_PARTY_NOTICES.md` (le licenze che viaggiano con il tema) |
| `npm run schema:i18n`       | Sposta i testi degli schema in `locales/*.schema.json` (chiavi `t:`) ed elenca le traduzioni inglesi mancanti |
| `npm run lint:fix`          | Esegue Theme Check con correzione automatica (`--auto-correct`)      |
| `npm run shopify:pull`      | Scarica il tema remoto (ambiente development)                        |
| `npm run shopify:push:dev`  | Build + push verso il tema condiviso di sviluppo                     |
| `npm run shopify:push:prod` | Build + push verso il tema di produzione                             |

---

## Workflow consigliato

### Sviluppo locale

```bash
# 1. Configura shopify.theme.toml
# 2. Avvia tutto
npm run start:watch

# 3. Modifica sorgenti in frontend/ e file Liquid
# 4. Le modifiche CSS/JS vengono ricompilate dal watch e caricate da theme dev
# 5. Le modifiche Liquid si sincronizzano sul tuo tema development personale
```

### Deploy su tema development (condiviso)

```bash
npm run lint
npm run shopify:push:dev     # esegue la build in automatico
```

### Deploy in produzione

```bash
npm run lint
npm run shopify:push:prod    # esegue la build in automatico
```

---

## Installazione per un nuovo cliente

Il tema arriva al negozio del cliente da un **repository GitHub privato di consegna, tuo**, con un branch per negozio collegato tramite l'integrazione GitHub di Shopify. Il cliente non ha mai accesso a GitHub né ai sorgenti (`frontend/`): riceve solo il tema compilato, e quello che salva dall'editor del tema resta sul suo branch. È la procedura prevista dalla clausola "Repository di consegna" (articolo 4) dei contratti di licenza.

```
progetto Bolter (sorgenti, privato)
   └─ npm run deploy:branch ─▶ repository di consegna (privato, tuo)
                                 ├─ branch cliente-x          ─▶ tema pubblicato del negozio X
                                 ├─ branch cliente-x-staging  ─▶ tema di prova del negozio X
                                 └─ branch cliente-y          ─▶ negozio Y
```

### 0. Una volta sola

1. **Account Shopify Partner** con accesso al Dev Dashboard (se Shopify la chiede, completa la verifica dell'identità: serve per inviare richieste di accesso ai negozi).
2. **Repository di consegna**: crea su GitHub un repository **privato** nel tuo account o in una tua organizzazione (es. `bolter-consegne`), separato da questo. Mai nell'account del cliente: chi possiede l'account può toglierti l'accesso e ripristinare un repository cancellato per 90 giorni.
3. **App GitHub di Shopify** ([documentazione](https://shopify.dev/docs/api/github-app)): installala sullo stesso account e, quando GitHub lo chiede, limitane l'accesso al solo repository di consegna.
4. **Clone locale** nella cartella `.deploy/` del progetto (è esclusa da git, Shopify CLI e Theme Check):

   ```bash
   git clone git@github.com:<tuo-account>/bolter-consegne.git .deploy
   ```

### 1. Prima di toccare il negozio

- [ ] Contratto firmato, con la seconda firma sulle clausole da approvare specificamente, e allegati A (consegna), B (GDPR) e C (impegno per sviluppatori terzi, se servirà). Cliente estero: variante bilingue e partita IVA verificata nel [VIES](https://ec.europa.eu/taxation_customs/vies/).
- [ ] Pagati attivazione e primo canone: da lì la licenza è efficace (articolo 6).
- [ ] Dal cliente: indirizzo **permanente** `negozio.myshopify.com` (non il dominio personalizzato) e **codice di richiesta collaboratore** a 4 cifre (Impostazioni → Utenti → Sicurezza; *Settings → Users → Security*).
- [ ] Personalizzazioni dell'Allegato A sviluppate e provate sul **tuo** store di sviluppo, come sempre (`npm run start:watch`), e committate.

### 2. Accesso collaboratore al negozio

Dal [Dev Dashboard](https://shopify.dev/docs/storefronts/themes/tools/collaborator-accounts): **Stores** → **Request store access** → indirizzo `myshopify.com` → codice di richiesta → permessi → **Send request**. Il cliente approva dalla mail o dalla Home del suo admin; il negozio compare tra i tuoi con stato **Active**.

- Permessi: quelli sui **temi** sono indispensabili (servono per collegare il branch); aggiungi solo ciò che serve per configurare il negozio (es. prodotti e navigazione in sola lettura per provarlo).
- L'accesso **scade dopo 90 giorni senza accessi** da parte tua: entra almeno una volta ogni tre mesi. Il contratto chiede al cliente di mantenerlo fino alla verifica di fine rapporto.

### 3. Prima consegna sul branch

Un branch per negozio, con nomi stabili: `cliente-x` per il tema pubblicato, `cliente-x-staging` per provare gli aggiornamenti.

```bash
git status                                    # tutto committato: lo script si ferma se non lo è
npm run lint                                  # 0 errori
npm run deploy:branch -- cliente-x            # prepara il commit nel branch, non invia nulla
git -C .deploy show --stat                    # controlla cosa parte
npm run deploy:branch -- cliente-x --push     # invia a GitHub
```

Alla prima consegna impostazioni (`config/settings_data.json`), template e gruppi di section arrivano dal progetto: sono il punto di partenza del cliente, con stile e schemi di colori del tuo store di sviluppo. Collezioni, menu, prodotti e immagini scelti lì non esistono nel negozio del cliente: nelle section restano vuoti finché non li riassegni dall'editor (passo 5).

### 4. Collegare il branch al negozio

Nell'admin del cliente, con il tuo accesso collaboratore: **Negozio online → Temi** (*Online Store → Themes*) → nella **Libreria temi** **Aggiungi tema → Collega da GitHub** (*Add theme → Connect from GitHub*) → il tuo account → il repository di consegna → il branch `cliente-x`.

Il tema compare nella libreria con repository, branch e ora dell'ultimo commit. Da quel momento:

- ogni `npm run deploy:branch -- cliente-x --push` aggiorna il tema nel negozio;
- ogni modifica fatta dall'editor del tema viene salvata da Shopify come commit sul branch (non si può disattivare): lo script la ritrova e la conserva.

Per il tema di prova ripeti i passi 3 e 4 con `cliente-x-staging` e lascialo **non pubblicato**.

### 5. Configurare e pubblicare

1. Dall'editor del tema: logo, menu, collezioni e prodotti delle section, immagini, schema di colori, testi; app del cliente con app block ed embed (le app che modificano i file del tema richiedono il tuo consenso, articolo 4).
2. Controlli prima di pubblicare: anteprima su telefono e computer, ricerca, filtri, carrello e checkout, lingue e mercati attivi, pagine legali (privacy, cookie, condizioni di vendita: responsabilità del cliente).
3. Pubblica il tema collegato (**Azioni → Pubblica**): resta collegato al branch anche dopo la pubblicazione.

### 6. Aggiornamenti

```bash
npm run deploy:branch -- cliente-x-staging --push   # prima sul tema di prova
npm run deploy:branch -- cliente-x --push           # poi su quello pubblicato
```

Ogni consegna aggiorna il codice e lascia sul branch quello che è del negozio:

| File sul branch | Cosa succede a ogni consegna |
|---|---|
| Codice (Liquid, CSS/JS compilati, `settings_schema.json`, `*.schema.json`) | sostituito con quello del progetto; i file non più presenti vengono tolti |
| `config/settings_data.json`, `templates/**/*.json`, `sections/*.json` | restano quelli del negozio (con le modifiche dell'editor); il progetto li fornisce solo se mancano |
| `locales/*.json` (testi del negozio) | uniti chiave per chiave: arrivano le chiavi nuove, restano i testi cambiati dal merchant |

- Una section nuova in un template **esistente** non arriva da sola (il template è del negozio): aggiungila dall'editor, oppure sovrascrivi il file con `--reset templates/product.json`, sapendo che si perde la disposizione scelta dal cliente.
- Lo script riparte sempre dal branch su GitHub: non fare commit a mano in `.deploy/` e non modificare i file su GitHub. Se l'invio viene rifiutato perché nel frattempo Shopify ha salvato una modifica dall'editor, rilancia il comando.
- Gli avvisi `⚠` dicono quali testi del merchant hanno vinto su un testo cambiato anche nel progetto: controllali.

### 7. Fine del rapporto

Segue l'articolo 8 del contratto (30 giorni, 7 in caso di risoluzione per inadempimento).

1. Se il cliente la chiede, esporta le sue impostazioni, template e testi, senza codice, in una cartella **fuori** dal progetto e mandagliela:

   ```bash
   npm run deploy:branch -- cliente-x --export ../consegne/cliente-x
   ```

2. Il cliente pubblica un altro tema, elimina il tuo e tutte le copie, e ti manda la dichiarazione firmata con la schermata della pagina Temi. Verifica con il tuo accesso collaboratore che la libreria non contenga più il tema né sue copie.
3. Cancella i branch del cliente dal repository di consegna:

   ```bash
   git -C .deploy push origin --delete cliente-x cliente-x-staging
   git -C .deploy checkout --detach
   git -C .deploy branch -D cliente-x cliente-x-staging
   ```

4. Rimuovi il tuo accesso dal Dev Dashboard: **Stores** → menu **⋯** del negozio → **Remove access**.

Se il tema resta in uso oltre il termine, non cancellare nulla prima di aver raccolto le prove (schermate della pagina Temi e del sito pubblico, dove gli avvisi `/*! Bolter Theme … */` nei file CSS/JS lo identificano): servono per le penali e le azioni dell'articolo 9.

---

## Gestione degli asset

**Regola:** `frontend/` è l'unica sorgente. `assets/` e `snippets/vite-tag.liquid` sono **output generato**: non si modificano a mano e non sono versionati in git (vedi `.gitignore`). Ogni `npm run build` svuota e rigenera `assets/`.

| Cosa                                                             | Dove                                    | Come arriva in `assets/`               |
| ---------------------------------------------------------------- | --------------------------------------- | -------------------------------------- |
| JS/CSS caricati dal Liquid                                       | `frontend/entrypoints/`                 | bundle con hash, via `vite-tag`        |
| Moduli JS / partial CSS                                          | `frontend/scripts/`, `frontend/styles/` | importati da un entrypoint             |
| Font, immagini usati in CSS/JS                                   | `frontend/assets/`                      | `url()` / `import` → copiati con hash  |
| File richiamati direttamente dal Liquid (`'logo.svg' \| asset_url`, favicon) | `frontend/public/`          | copiati così come sono                 |
| Icone SVG                                                        | `snippets/icon-*.liquid`                | inline, nessun file in `assets/`       |
| Immagini modificabili dal merchant                               | setting `image_picker`                  | non vanno in `assets/`                 |

> **Nota:** un clone appena fatto non contiene `snippets/vite-tag.liquid`: esegui `npm run build` (o `npm run lint`, che la esegue in automatico) prima di lavorare con Theme Check.

---

## Strategia di caricamento asset

### Setup attuale (punto di partenza)

Il layout carica sempre:

```liquid
{% render 'vite-tag', entry: 'theme.css' %}
{% render 'vite-tag', entry: 'theme.js' %}
```

`theme.css` importa tutti i partial (`variables`, `base`, `utilities`, …) → **un unico CSS globale**.
Tutto ciò che importi in `theme.js` finisce nello **stesso bundle JS**.

Va bene per prototipi e stili/script veramente globali (header, cart, tipografia). Su un tema in produzione conviene evitare di mettere qui logiche e stili specifici di singole pagine.

### Bundle globale minimo + bundle per pagina

Pattern consigliato:

```
frontend/entrypoints/
├── theme.css      → reset, variabili, layout base
├── theme.js       → header, cart, util condivise
├── product.css    → stili pagina prodotto
├── product.js     → variant picker, gallery
└── collection.js  → filtri, infinite scroll
```

**Layout** — solo ciò che serve ovunque:

```liquid
{% render 'vite-tag', entry: 'theme.css' %}
{% render 'vite-tag', entry: 'theme.js' %}
```

**Template o layout condizionale** — codice solo dove serve:

```liquid
{% if template.name == 'product' %}
  {% render 'inline-css', entry: 'product.css' %}
  {% render 'vite-tag', entry: 'product.js' %}
{% endif %}
```

Ogni file in `frontend/entrypoints/` diventa un bundle separato referenziato da `vite-tag`.

### Caricamento da section

Per codice legato a una section specifica:

```liquid
{# sections/product-gallery.liquid #}
{% render 'vite-tag', entry: 'product-gallery.js' %}
```

Il bundle viene caricato solo dove la section è presente.

### Code splitting con dynamic import

Per logiche pesanti, carica on-demand da JS:

```js
if (document.querySelector("[data-product-form]")) {
  import("../scripts/product-form.js");
}
```

Vite genera chunk separati caricati solo quando la condizione è vera. Utile per JS; per CSS critico above-the-fold preferisci entry point dedicati.

### Cosa mettere dove

| Contenuto                                | Dove                                        |
| ---------------------------------------- | ------------------------------------------- |
| Reset, variabili CSS, font, header, cart | `theme.css` / `theme.js` (layout)           |
| Variant picker, gallery prodotto         | `product.js` / `product.css`                |
| Filtri collection                        | `collection.js`                             |
| Logica di una section                    | entry point dedicato o import dalla section |

### Importare moduli riutilizzabili

I file in `frontend/scripts/` e `frontend/styles/` **non** diventano bundle da soli: vanno importati da un entry point.

```js
// frontend/entrypoints/theme.js
import { initSmoothScroll } from "@/scripts/smooth-scroll.js";
```

```css
/* frontend/entrypoints/theme.css */
@import "tailwindcss" source(none);
@import "../styles/tokens.css";
@import "../styles/base.css";
```

### Alias di import

```js
import Component from "@/components/Component.js"; // → frontend/
import styles from "~/styles/foo.css";
```

---

## Animazioni (Motion)

Le animazioni usano [Motion](https://motion.dev) (la versione vanilla JS di Framer Motion) in modo **dichiarativo tramite attributi HTML**: non serve scrivere JS per animare una section.

```liquid
<div data-animate="fade-up">…</div>

<ul data-animate-stagger="fade-up" data-animate-interval="0.1">
  <li>…</li>
  <li>…</li>
</ul>
```

| Attributo                 | Descrizione                                                         |
| ------------------------- | ------------------------------------------------------------------- |
| `data-animate="preset"`   | Anima l'elemento quando entra nel viewport (una volta)               |
| `data-animate-stagger="preset"` | Anima in sequenza i figli diretti del contenitore             |
| `data-animate-delay`      | Ritardo iniziale in secondi                                          |
| `data-animate-duration`   | Durata in secondi (default `0.6`)                                    |
| `data-animate-interval`   | Intervallo tra i figli in secondi, solo stagger (default `0.08`)     |
| `data-animate-from`       | Origine dello stagger: `first` (default), `center`, `last`. Su un contenitore `display: grid` l'onda è calcolata in 2D sulla griglia |

Preset: `fade`, `fade-up`, `fade-down`, `fade-left`, `fade-right`, `zoom-in`, `pop` (definiti in `frontend/scripts/animations.js`).

Esempio "griglia a onda dal centro":

```liquid
<ul class="grid" data-animate-stagger="pop" data-animate-from="center" data-animate-interval="0.05">…</ul>
```

Le section animate disponibili e gli esempi Motion da cui derivano sono elencati in [docs/motion-examples.md](docs/motion-examples.md).

Come funziona:

- `theme.js` carica `frontend/scripts/animations.js` con un **dynamic import** solo se la pagina contiene elementi animati → chunk separato (~4.5 kB gzip, usa `motion/mini`).
- Lo stato iniziale nascosto è in CSS (`frontend/styles/animations.css`) ed è attivo solo con la classe `.js` su `<html>` (impostata da uno script inline nel layout): senza JS il contenuto resta visibile.
- Con `prefers-reduced-motion: reduce` nessuna animazione: gli elementi sono visibili e statici.
- Nel theme editor le section aggiunte/ricaricate vengono inizializzate tramite l'evento `shopify:section:load`.

> **⚠️ Non usare `data-animate` su elementi above-the-fold** (hero, immagine principale, titolo della pagina): resterebbero invisibili finché il JS non è caricato, peggiorando LCP.

Per animazioni personalizzate importa direttamente Motion in uno script:

```js
import { animate } from "motion/mini";        // leggero (WAAPI)
import { animate, scroll, inView } from "motion"; // completo (spring, scroll-linked, sequenze)
```

---

## Configurazione Vite (`vite.config.js`)

Opzioni attuali del progetto:

```js
export default defineConfig(({ mode }) => {
  const isWatch = mode === "development"; // npm run watch

  return {
    publicDir: "frontend/public",
    plugins: [
      shopify({
        sourceCodeDir: "frontend",
        entrypointsDir: "frontend/entrypoints",
      }),
    ],
    build: {
      emptyOutDir: !isWatch, // la build di produzione elimina gli asset obsoleti
      sourcemap: isWatch ? "inline" : false,
      minify: !isWatch,
      // ...
    },
  };
});
```

- **`publicDir`**: il plugin lo disattiva di default; qui punta a `frontend/public/`, così tutti i file di `assets/` nascono da `frontend/`.
- **`emptyOutDir`**: attivo solo nella build di produzione. In watch Vite svuoterebbe `assets/` ad ogni rebuild.
- **`sourcemap: 'inline'`**: in watch le sourcemap sono incluse nei file, così funzionano anche dal CDN Shopify.

Opzioni aggiuntive disponibili nel plugin:

| Opzione                 | Default             | Descrizione                                          |
| ----------------------- | ------------------- | ---------------------------------------------------- |
| `themeRoot`             | `'./'`              | Root del tema Shopify                                |
| `snippetFile`           | `'vite-tag.liquid'` | Nome dello snippet generato                          |
| `versionNumbers`        | `false`             | Aggiunge version query string agli URL in produzione |
| `tunnel`                | `false`             | Tunnel Cloudflare per preview da dispositivi esterni |
| `themeHotReload`        | `true`              | Integrazione con `@shopify/theme-hot-reload`         |
| `additionalEntrypoints` | `[]`                | Entry point extra (glob o path)                      |

---

## Theme Check (`.theme-check.yml`)

[Theme Check](https://shopify.dev/docs/storefronts/themes/tools/theme-check) è il linter ufficiale Shopify per i file Liquid del tema. Nel progetto è configurato tramite `.theme-check.yml`.

### Configurazione attuale

```yaml
extends: theme-check:recommended

ignore:
  - node_modules/**
  - frontend/**

MissingTemplate:
  enabled: true
UnusedAssign:
  severity: suggestion
```

- **`theme-check:recommended`**: set di regole consigliato da Shopify.
- **`ignore`**: esclude `node_modules/` e `frontend/` (sorgenti Vite, non Liquid).
- **`MissingTemplate`**: segnala template o snippet referenziati ma assenti.
- **`UnusedAssign`**: variabili Liquid non usate come suggerimento, non errore.

Il file è in `.shopifyignore` e non viene pushato sullo store.

### Esecuzione

```bash
npm run lint
npm run lint:fix
```

Comandi CLI equivalenti (utili in CI o per opzioni avanzate):

```bash
shopify theme check --list
shopify theme check --fail-level error
```

### Integrazione IDE

Con l'estensione [Shopify Liquid](https://shopify.dev/docs/storefronts/themes/tools/cli/cli-liquid) per VS Code/Cursor, gli avvisi compaiono direttamente nell'editor usando la stessa configurazione.

---

## Note importanti

- **`snippets/vite-tag.liquid`** e **`assets/`** non sono in git: vengono rigenerati dalla build, che gli script di push eseguono in automatico. Se colleghi il tema a un branch con l'integrazione GitHub di Shopify, quel branch dovrà contenere i file compilati (es. prodotti da una GitHub Action).
- **`config/settings_data.json`** è ignorato in produzione: le personalizzazioni del merchant non vengono sovrascritte.
- Il **`README.md`** è in `.shopifyignore` e non viene caricato sullo store.
- **Design system**: token dal file Figma "Simple Design System" in `frontend/styles/tokens.css` (colori semantici, scala tipografica `text-title-hero` → `text-body-sm`, raggi, ombre), componenti `button*` e `prose-theme` in `frontend/styles/components.css`. Font scelti dal merchant in Impostazioni tema → Tipografia (default Inter).
- **Icone**: Heroicons via `{% render 'icon', name: '…' %}`; elenco in `tools/icons.json`, rigenera lo snippet con `npm run icons`.
- **Tailwind CSS v4** (+ `@tailwindcss/typography`) è configurato in modalità CSS-first: token in `frontend/styles/tokens.css` (`@theme`), sorgenti scansionate con `@source` in `frontend/entrypoints/theme.css`, plugin `@tailwindcss/vite` in `vite.config.js`. Non esiste `tailwind.config.js`. Usa le utility nel Liquid; il CSS delle section va in `@layer components`. Consigliata l'estensione VS Code "Tailwind CSS IntelliSense".
- Per TypeScript, Sass o React aggiungi i plugin Vite corrispondenti e configurali in `vite.config.js`.
- **Claude Code**: `CLAUDE.md` contiene le istruzioni di progetto, `.claude/skills/` le procedure ricorrenti (`new-section`, `new-template`, `theme-review`) e `.claude/settings.json` blocca a Claude push in produzione, `publish`, `delete` e `rename` del tema (il push sul tema di sviluppo richiede conferma). Questi file sono esclusi dal push su Shopify.
- **Plugin Shopify AI Toolkit**: abilitato a livello di progetto in `.claude/settings.json` (Claude Code lo propone a chi apre il repo). Il plugin invia telemetria a Shopify, inclusi i prompt quando si attivano le sue skill: ogni sviluppatore dovrebbe disattivarla creando un file vuoto `%APPDATA%\shopify-ai-toolkit\opt-out` (Windows) o `~/.config/shopify-ai-toolkit/opt-out` (macOS/Linux).
- **Lingua di default**: italiano (`locales/it.default.json`). I testi fissi dell'interfaccia vanno lì e si usano con il filtro `| t`.

---

## Risorse

- [vite-plugin-shopify](https://github.com/barrel/shopify-vite/tree/main/packages/vite-plugin-shopify) — [documentazione](https://shopify-vite.barrelny.com/)
- [Esempi ufficiali](https://github.com/barrel/shopify-vite/tree/main/examples)
- [Shopify CLI — Theme commands](https://shopify.dev/docs/api/shopify-cli/theme)
- [Theme Check](https://shopify.dev/docs/storefronts/themes/tools/theme-check)
- [Documentazione temi Shopify](https://shopify.dev/docs/storefronts/themes)
