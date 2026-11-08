---
name: theme-review
description: Revisione di qualità del tema bolter-theme prima di un push o di un commit — performance (Core Web Vitals), accessibilità, compatibilità con il theme editor, traduzioni, regole del progetto e Theme Check. Usala quando l'utente chiede una review, un controllo prima del deploy, "è pronto per il push?", o dopo modifiche estese a section/template.
---

# Review del tema

Obiettivo: un report affidabile, non una lista di sospetti. Ogni problema riportato deve avere file e riga e un motivo concreto. **Non correggere nulla durante la review**: alla fine proponi le correzioni e chiedi se applicarle.

## 1. Perimetro

- Di default: i file modificati rispetto all'ultimo commit (`git status`, `git diff`), più i file nuovi non tracciati.
- Se l'utente chiede una review completa: tutto `layout/`, `sections/`, `snippets/` (escluso `vite-tag.liquid`), `templates/`, `blocks/` (se presente), `frontend/`.

## 2. Controlli automatici

1. `npm run build:check` (per le dimensioni dei bundle; mai `npm run build` durante una review) e `npm run lint`: riporta gli errori Theme Check, distinguendo quelli **preesistenti** (vedi "Stato noto" in `CLAUDE.md`) da quelli nuovi.
2. Dall'output della build annota le dimensioni gzip dei bundle. Segnala:
   - `theme.js` o `theme.css` oltre ~15 kB gzip (sono caricati su ogni pagina);
   - nuovi chunk oltre ~30 kB gzip;
   - dipendenze npm che finiscono nel bundle globale invece che in un chunk o entrypoint dedicato.

## 3. Controlli manuali (leggi i file nel perimetro)

**Performance**
- Immagini: `image_url` + `image_tag` con `widths`/`sizes`; `loading: 'lazy'` sotto la piega; immagine LCP con `loading: 'eager'` + `fetchpriority: 'high'`. Segnala `img_url` e `<img>` senza dimensioni.
- `data-animate` su elementi above-the-fold o sull'elemento LCP.
- JS/CSS specifici di una pagina caricati dal layout o importati staticamente in `theme.js`.
- Script di terze parti bloccanti nel `<head>`.

**Accessibilità**
- Un solo `h1` per pagina e gerarchia dei titoli coerente.
- Immagini senza `alt` appropriato (decorative con `alt=""`).
- Azioni con `<div>`/`<a>` invece di `<button>`; elementi interattivi non raggiungibili da tastiera; focus nascosto (`outline: none` senza alternativa).
- Form senza `label`; icone-pulsante senza testo accessibile.
- Animazioni/transizioni che ignorano `prefers-reduced-motion`.

**Theme editor e merchant**
- Blocchi senza `{{ block.shopify_attributes }}`.
- Setting senza `default` sensato; testi visibili hardcoded invece che da setting o `| t`.
- JS che non si reinizializza dopo `shopify:section:load` (preferire custom element con guard su `customElements.get`).
- Section aggiungibili senza `presets`, o `main-*` con `presets` non voluti.

**Traduzioni**
- Stringhe UI hardcoded nel Liquid; chiavi `| t` non presenti in `locales/it.default.json` o `locales/en.json`.
- Testi letterali negli schema (non `t:…`): `npm run schema:i18n` deve riportare 0 testi convertiti e 0 chiavi mancanti in inglese.

**Design system e Tailwind**
- Colori, dimensioni del testo, raggi o ombre fuori dai token SDS (hex, `text-[18px]`, `rounded-[10px]`…).
- Classi composte dinamicamente nel Liquid (non vengono generate da Tailwind).
- Richtext del merchant senza `prose prose-theme`.
- Icone non Heroicons o SVG inline invece dello snippet `icon`.
- CSS di section che prova a sovrascrivere una utility (non funziona: le utility sono in un layer superiore).

**Regole del progetto (`CLAUDE.md`)**
- Modifiche a `assets/`, `snippets/vite-tag.liquid` o `config/settings_data.json`.
- URL hardcoded invece di `routes.*`; `include` invece di `render`; `console.log` rimasti.

## 4. Report

Struttura del report all'utente:

1. **Esito**: pronto per il push / da correggere prima del push.
2. **Problemi bloccanti**: errori Theme Check nuovi, regressioni di performance o accessibilità evidenti, violazioni delle regole del progetto.
3. **Da migliorare**: il resto, in ordine di impatto.
4. Per ogni voce: `file:riga`, problema, correzione proposta (in una frase).
5. **Cosa non è stato verificato** (es. resa visiva, comportamento nel browser, Lighthouse) e come verificarlo.

Poi chiedi se applicare le correzioni, tutte o una selezione.
