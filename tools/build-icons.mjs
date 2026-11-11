/**
 * Genera snippets/icon.liquid (e icon-16/20/24.liquid, un file per griglia) dalle icone Heroicons elencate in
 * tools/icons.json.
 *
 * Uso: npm run icons
 * Nel Liquid: {% render 'icon', name: 'chevron-down', size: 16, class: 'shrink-0' %}
 *
 * Nitidezza: Heroicons disegna ogni set su una griglia (16 micro, 20 mini, 24 outline/solid) e a quella misura i
 * bordi cadono su pixel interi. Ridotta (es. una 20 a 16px) l'icona finisce tra due pixel e sugli schermi a densità 1
 * si vede sgranata. Per questo la misura non va nella classe: il parametro `size` sceglie insieme il disegno e la
 * classe size-*. Sotto i 24px Heroicons esiste solo pieno, quindi le icone "outline" diventano piene a 16 e 20px
 * (stesso criterio del set ufficiale). Sopra i 24px si usa il disegno da 24.
 *
 * Un file per griglia: in un solo snippet le condizioni superavano il limite di complessità di Theme Check, e così
 * ogni render analizza solo i disegni della sua misura.
 *
 * Le icone sono inline (currentColor), con aria-hidden: il testo accessibile va fornito
 * dall'elemento che le contiene (es. un <button> con testo o aria-label).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'tools', 'icons.json'), 'utf8'));
const heroiconsDir = join(root, 'node_modules', 'heroicons');

const icons = Object.entries(config)
  .filter(([name]) => !name.startsWith('$'))
  .map(([name, value]) => {
    const [style, heroicon] = value.split('/');
    if (!['solid', 'outline'].includes(style) || !heroicon) {
      throw new Error(`tools/icons.json, "${name}": il formato è "solid/<nome-heroicon>" o "outline/<nome-heroicon>"`);
    }
    return { name, style, heroicon };
  });
const names = icons.map(({ name }) => name).join(', ');

// Misure ammesse: valore del parametro size → griglia del disegno e classe Tailwind (scritta per intero: Tailwind legge
// questo file generato, snippets/ è in @source)
const SIZES = [
  { size: '16', grid: 16, className: 'size-4' },
  { size: '20', grid: 20, className: 'size-5' },
  { size: '24', grid: 24, className: 'size-6' },
  { size: '32', grid: 24, className: 'size-8' },
  { size: '48', grid: 24, className: 'size-12' },
  { size: "'full'", grid: 24, className: 'size-full' },
];

function loadSvg(source) {
  const file = join(heroiconsDir, `${source}.svg`);
  if (!existsSync(file)) throw new Error(`Heroicons non ha ${source}: controlla tools/icons.json`);
  const svg = readFileSync(file, 'utf8')
    .trim()
    .replace(/\s*(aria-hidden|data-slot)="[^"]*"/g, '') // evita attributi duplicati
    .replace(/>\s+</g, '><'); // una riga sola
  // Attributi comuni sul tag <svg>; la classe (misura + parametro class) arriva da snippets/icon.liquid.
  return svg.replace(
    '<svg ',
    '<svg class="{{ icon_class }}" aria-hidden="true" focusable="false" data-icon="' + source + '" ',
  );
}

function gridSnippet(grid) {
  const cases = icons.map(({ name, style, heroicon }) => {
    const body =
      grid === 24 && style === 'outline'
        ? [
            `{%- if style == 'solid' -%}${loadSvg(`24/solid/${heroicon}`)}`,
            `{%- else -%}${loadSvg(`24/outline/${heroicon}`)}`,
            '{%- endif -%}',
          ].join('\n    ')
        : loadSvg(`${grid}/solid/${heroicon}`);
    return `  {%- when '${name}' -%}\n    ${body}`;
  });
  const params = grid === 24 ? 'name, icon_class, style' : 'name, icon_class';
  return `{%- comment -%}
  FILE GENERATO da tools/build-icons.mjs — non modificare a mano.
  Disegni Heroicons della griglia da ${grid}px, resi solo da snippets/icon.liquid (parametri: ${params}).
{%- endcomment -%}
{%- case name -%}
${cases.join('\n')}
{%- endcase -%}
`;
}

const sizeCases = SIZES.map(
  ({ size, grid, className }) => `    when ${size}\n      assign icon_grid = ${grid}\n      assign icon_class = '${className}'`,
).join('\n');

const snippet = `{%- comment -%}
  FILE GENERATO da tools/build-icons.mjs — non modificare a mano.
  Icone: Heroicons (https://heroicons.com), Copyright (c) Tailwind Labs, Inc., licenza MIT (testo in snippets/license.liquid).
  Elenco in tools/icons.json, rigenera con: npm run icons

  Parametri:
  - name: nome dell'icona (${names})
  - size: 16, 20 (predefinita), 24, 32, 48 o 'full'. Sceglie il disegno nitido per quella misura e la classe size-*:
    non mettere la misura di base in class (solo varianti, es. lg:size-6). npm run lint lo controlla.
  - style: 'solid' per le icone a contorno da 24px in su che devono essere piene (es. header). Sotto i 24px sono
    sempre piene.
  - class: altre classi CSS, es. 'shrink-0'
{%- endcomment -%}
{%- liquid
  assign icon_grid = 20
  assign icon_class = 'size-5'
  case size
${sizeCases}
  endcase
  if class != blank
    assign icon_class = icon_class | append: ' ' | append: class
  endif

  case icon_grid
    when 16
      render 'icon-16', name: name, icon_class: icon_class
    when 24
      render 'icon-24', name: name, icon_class: icon_class, style: style
    else
      render 'icon-20', name: name, icon_class: icon_class
  endcase
-%}
`;

for (const grid of [16, 20, 24]) {
  writeFileSync(join(root, 'snippets', `icon-${grid}.liquid`), gridSnippet(grid), 'utf8');
}
writeFileSync(join(root, 'snippets', 'icon.liquid'), snippet, 'utf8');
console.log(`snippets/icon.liquid (+ icon-16, icon-20, icon-24) generato con ${icons.length} icone: ${names}`);
