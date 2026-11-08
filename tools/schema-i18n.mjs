/**
 * Traduzioni dell'editor del tema: sposta i testi degli schema in locales/*.schema.json.
 *
 * Uso: npm run schema:i18n
 *
 * Per ogni sections/*.liquid e blocks/*.liquid ({% schema %}) e per config/settings_schema.json:
 * - sostituisce i testi letterali (name, label, info, content, placeholder, opzioni, default dei
 *   campi di testo, valori dei preset) con chiavi "t:…";
 * - salva i testi originali (italiano, lingua di default) in locales/it.default.schema.json;
 * - elenca le chiavi che mancano in locales/en.schema.json (da tradurre a mano).
 *
 * Idempotente: i testi che iniziano già con "t:" non vengono toccati.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LOCALE = join(root, 'locales', 'it.default.schema.json');
const EN_LOCALE = join(root, 'locales', 'en.schema.json');

// Il sync del theme editor può aggiungere un commento "auto-generated" in testa ai file: non è JSON valido
const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '')) : {});
const it = readJson(DEFAULT_LOCALE);
const en = readJson(EN_LOCALE);

// Tipi di setting il cui "default" è testo da tradurre (negli altri è un valore tecnico)
const TEXT_DEFAULT_TYPES = new Set(['text', 'textarea', 'richtext', 'inline_richtext']);
const TEXT_FIELDS = ['label', 'info', 'content', 'placeholder', 'unit'];

const slug = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

function setKey(obj, path, value) {
  const parts = path.split('.');
  let node = obj;
  for (const part of parts.slice(0, -1)) node = node[part] ??= {};
  if (node[parts.at(-1)] === undefined) node[parts.at(-1)] = value;
}

function getKey(obj, path) {
  return path.split('.').reduce((node, part) => node?.[part], obj);
}

let converted = 0;
function translate(value, key) {
  if (typeof value !== 'string' || value === '' || value.startsWith('t:')) return value;
  setKey(it, key, value);
  converted++;
  return `t:${key}`;
}

function convertSettings(settings = [], base) {
  const counters = {};
  for (const setting of settings) {
    const id = setting.id ?? `${setting.type}_${(counters[setting.type] = (counters[setting.type] ?? 0) + 1)}`;
    const key = `${base}.${id}`;
    for (const field of TEXT_FIELDS) if (field in setting) setting[field] = translate(setting[field], `${key}.${field}`);
    if (TEXT_DEFAULT_TYPES.has(setting.type) && 'default' in setting) {
      setting.default = translate(setting.default, `${key}.default`);
    }
    for (const option of setting.options ?? []) {
      option.label = translate(option.label, `${key}.options.${slug(option.value)}`);
    }
  }
}

function convertPresetSettings(values = {}, settingsDef = [], base) {
  for (const [id, value] of Object.entries(values)) {
    const def = settingsDef.find((s) => s.id === id);
    if (def && TEXT_DEFAULT_TYPES.has(def.type)) values[id] = translate(value, `${base}.${id}`);
  }
}

function convertSectionSchema(schema, base) {
  schema.name = translate(schema.name, `${base}.name`);
  convertSettings(schema.settings, `${base}.settings`);
  for (const block of schema.blocks ?? []) {
    if (block.type?.startsWith('@')) continue; // app/theme blocks
    block.name = translate(block.name, `${base}.blocks.${block.type}.name`);
    convertSettings(block.settings, `${base}.blocks.${block.type}.settings`);
  }
  (schema.presets ?? []).forEach((preset, i) => {
    const presetBase = `${base}.presets.preset_${i + 1}`;
    preset.name = translate(preset.name, `${presetBase}.name`);
    convertPresetSettings(preset.settings, schema.settings, `${presetBase}.settings`);
    (preset.blocks ?? []).forEach((block, j) => {
      const def = schema.blocks?.find((b) => b.type === block.type);
      convertPresetSettings(block.settings, def?.settings, `${presetBase}.blocks.block_${j + 1}`);
    });
  });
}

// --- Section e theme blocks (blocks/: chiavi "blocks.<nome>", es. _header-mega-menu → blocks.header_mega_menu) ---
const SCHEMA_RE = /(\{%-?\s*schema\s*-?%\})([\s\S]*?)(\{%-?\s*endschema\s*-?%\})/;

for (const folder of ['sections', 'blocks']) {
  const dir = join(root, folder);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.liquid'))) {
    const path = join(dir, file);
    const source = readFileSync(path, 'utf8');
    const match = source.match(SCHEMA_RE);
    if (!match) continue;
    const schema = JSON.parse(match[2]);
    const before = converted;
    convertSectionSchema(schema, `${folder}.${slug(basename(file, '.liquid'))}`);
    if (converted > before) {
      const json = JSON.stringify(schema, null, 2);
      writeFileSync(path, source.replace(SCHEMA_RE, `$1\n${json}\n$3`), 'utf8');
      console.log(`${folder}/${file}: ${converted - before} testi convertiti`);
    }
  }
}

// --- Impostazioni del tema ---
const settingsPath = join(root, 'config', 'settings_schema.json');
const settingsSchema = JSON.parse(readFileSync(settingsPath, 'utf8'));
const beforeSettings = converted;
for (const group of settingsSchema) {
  if (group.name === 'theme_info') continue;
  // Chiave del gruppo: quella già usata (se convertito), altrimenti il prefisso del primo setting
  // (es. cart_type → "cart"), così le chiavi restano in inglese anche se il nome è in italiano.
  const existingKey = group.name.startsWith('t:') ? group.name.slice(2).split('.')[1] : null;
  const firstId = group.settings?.find((s) => s.id)?.id;
  const base = `settings_schema.${existingKey ?? (firstId ? slug(firstId.split('_')[0]) : slug(group.name))}`;
  group.name = translate(group.name, `${base}.name`);
  convertSettings(group.settings, `${base}.settings`);
}
if (converted > beforeSettings) {
  writeFileSync(settingsPath, JSON.stringify(settingsSchema, null, 2) + '\n', 'utf8');
  console.log(`config/settings_schema.json: ${converted - beforeSettings} testi convertiti`);
}

writeFileSync(DEFAULT_LOCALE, JSON.stringify(it, null, 2) + '\n', 'utf8');

// --- Chiavi da tradurre in inglese ---
const missing = [];
(function walk(node, prefix) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') walk(v, key);
    else if (getKey(en, key) === undefined) missing.push(`${key} = ${JSON.stringify(v)}`);
  }
})(it, '');

console.log(`\nTesti convertiti: ${converted}. Chiavi in it.default.schema.json senza traduzione in en.schema.json: ${missing.length}`);
missing.forEach((line) => console.log('  ' + line));
