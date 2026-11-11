/**
 * Genera snippets/license.liquid da LICENSE e THIRD_PARTY_NOTICES.md: npm run license.
 *
 * Shopify carica solo le cartelle del tema, quindi i due file della radice restano nel repository e chi scarica
 * il tema dall'admin non li riceve. Lo snippet li porta nel tema come commento Liquid: non viene mai reso, non
 * pesa sulle pagine e soddisfa la condizione della licenza MIT (avviso incluso nelle copie distribuite).
 * Esclusa da @source in theme.css (il testo libero genererebbe classi Tailwind).
 *
 * Con --check non scrive: esce con codice 1 se lo snippet non corrisponde ai sorgenti (usato da prelint).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'snippets', 'license.liquid');

const read = (name) => readFileSync(join(root, name), 'utf8').replace(/\r\n/g, '\n').trim();
const license = read('LICENSE');
const notices = read('THIRD_PARTY_NOTICES.md');

for (const [name, text] of [['LICENSE', license], ['THIRD_PARTY_NOTICES.md', notices]]) {
  if (/endcomment/i.test(text)) throw new Error(`${name} contiene "endcomment": chiuderebbe il commento Liquid.`);
}

export const snippet = `{%- comment -%}
FILE GENERATO da tools/build-license.mjs a partire da LICENSE e THIRD_PARTY_NOTICES.md: non modificarlo a mano,
rigeneralo con: npm run license. Lo snippet non va mai reso: serve solo a far viaggiare le licenze con il tema.

${license}

------------------------------------------------------------------------------

${notices}
{%- endcomment -%}
`;

if (process.argv.includes('--check')) {
  const current = existsSync(target) ? readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== snippet) {
    console.warn(
      '\n⚠️  snippets/license.liquid non corrisponde a LICENSE / THIRD_PARTY_NOTICES.md: esegui `npm run license`.\n',
    );
    process.exitCode = 1;
  }
} else {
  writeFileSync(target, snippet);
  console.log('snippets/license.liquid aggiornato.');
}
