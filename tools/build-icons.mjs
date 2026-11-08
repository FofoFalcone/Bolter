/**
 * Genera snippets/icon.liquid dalle icone Heroicons elencate in tools/icons.json.
 *
 * Uso: npm run icons
 * Nel Liquid: {% render 'icon', name: 'chevron-down', class: 'size-5' %}
 *
 * Le icone sono inline (currentColor), con aria-hidden: il testo accessibile va fornito
 * dall'elemento che le contiene (es. un <button> con testo o aria-label).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'tools', 'icons.json'), 'utf8'));
const icons = Object.entries(config).filter(([name]) => !name.startsWith('$'));

const heroiconsDir = join(root, 'node_modules', 'heroicons');

function loadSvg(source) {
  const svg = readFileSync(join(heroiconsDir, `${source}.svg`), 'utf8')
    .trim()
    .replace(/\s*(aria-hidden|data-slot)="[^"]*"/g, '') // evita attributi duplicati
    .replace(/>\s+</g, '><'); // una riga sola
  // Attributi comuni sul tag <svg>; la classe arriva dal parametro dello snippet.
  return svg.replace(
    '<svg ',
    '<svg class="{{ class }}" aria-hidden="true" focusable="false" data-icon="' + source + '" ',
  );
}

const cases = icons
  .map(([name, source]) => `  {%- when '${name}' -%}\n    ${loadSvg(source)}`)
  .join('\n');

const snippet = `{%- comment -%}
  FILE GENERATO da tools/build-icons.mjs — non modificare a mano.
  Icone: Heroicons (https://heroicons.com, licenza MIT). Elenco in tools/icons.json, rigenera con: npm run icons

  Parametri:
  - name: nome dell'icona (${icons.map(([n]) => n).join(', ')})
  - class: classi CSS, es. 'size-5 shrink-0'
{%- endcomment -%}
{%- case name -%}
${cases}
{%- endcase -%}
`;

writeFileSync(join(root, 'snippets', 'icon.liquid'), snippet, 'utf8');
console.log(`snippets/icon.liquid generato con ${icons.length} icone: ${icons.map(([n]) => n).join(', ')}`);
