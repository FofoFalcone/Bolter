/**
 * Consegna del tema su un branch del repository GitHub di consegna (privato, del Fornitore), collegato al negozio
 * con l'integrazione GitHub di Shopify. Un branch per negozio o destinazione (es. cliente-x, cliente-x-staging).
 *
 * Preparazione, una volta: git clone <url del repository di consegna> .deploy   (cartella ignorata da git)
 *
 * Uso:
 *   npm run deploy:branch -- <branch>                      prepara il commit sul branch, non pubblica
 *   npm run deploy:branch -- <branch> --push               ...e lo invia a GitHub (Shopify aggiorna il tema collegato)
 *   npm run deploy:branch -- <branch> --reset <percorso>   sovrascrive un file del negozio con quello del progetto
 *   npm run deploy:branch -- <branch> --export <cartella>  esporta impostazioni, template e testi del negozio, senza codice
 * Opzioni: --dir <cartella> (default .deploy), --allow-dirty (consegna anche con modifiche non committate).
 *
 * Cosa fa:
 * 1. Allinea il branch a GitHub: contiene anche i commit con cui Shopify salva le modifiche fatte dall'editor.
 * 2. Build di produzione direttamente nel branch (BOLTER_THEME_ROOT, vite.config.js): assets/ e vite-tag.liquid
 *    del progetto non vengono toccati, quindi è sicura anche con `shopify theme dev` attivo.
 * 3. Copia il codice (layout, sections, snippets, blocks, config, locales, templates) e toglie i file non più presenti.
 * 4. File del negozio, che Shopify modifica dall'editor: config/settings_data.json, templates/**\/*.json,
 *    sections/*.json (gruppi di section). Se esistono già sul branch restano come sono: sono del cliente (art. 2 del
 *    contratto) e cambiano da negozio a negozio. Il progetto li fornisce solo alla prima consegna o con --reset.
 *    Stessa regola che Shopify applica agli aggiornamenti dei temi.
 * 5. Testi del negozio (locales/*.json, non .schema.json): unione chiave per chiave. Le chiavi nuove arrivano dal
 *    progetto; i testi cambiati dal merchant (diversi dall'ultima consegna) restano i suoi.
 * 6. Commit "bolter-deploy: …" e, solo con --push, invio a GitHub. Senza --push nulla arriva allo store.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const THEME_DIRS = ['layout', 'sections', 'snippets', 'blocks', 'config', 'locales', 'templates'];
const GENERATED = new Set(['snippets/vite-tag.liquid']); // scritto dalla build nel branch
const COMMIT_PREFIX = 'bolter-deploy:';

// ---------------------------------------------------------------------------------------------- argomenti

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const values = (name) => args.flatMap((arg, i) => (arg === name && args[i + 1] ? [args[i + 1]] : []));
const branch = args.find((arg, i) => !arg.startsWith('--') && !['--reset', '--export', '--dir'].includes(args[i - 1]));
const worktree = path.resolve(root, values('--dir')[0] ?? '.deploy');
const resets = new Set(values('--reset').map(toPosix));
const exportDir = values('--export')[0];

if (!branch) fail('Indica il branch: npm run deploy:branch -- <branch> [--push]');
if (!/^[\w./-]+$/.test(branch) || branch.startsWith('-')) fail(`Nome di branch non valido: ${branch}`);
if (!fs.existsSync(path.join(worktree, '.git'))) {
  fail(`${worktree} non è un repository git. Una volta sola: git clone <url del repository di consegna> .deploy`);
}

// ---------------------------------------------------------------------------------------------- utilità

function toPosix(file) {
  return file.split(path.sep).join('/').replace(/^\.\//, '');
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function run(command, commandArgs, { cwd = root, env, allowFail = false } = {}) {
  const result = spawnSync(command, commandArgs, { cwd, env, encoding: 'utf8' });
  if (result.status !== 0 && !allowFail) {
    fail(`${command} ${commandArgs.join(' ')}\n${result.stderr || result.stdout}`);
  }
  return result.status === 0 ? result.stdout.trim() : null;
}

const git = (gitArgs, options) => run('git', ['-C', worktree, ...gitArgs], options);

function listFiles(base, dir) {
  const start = path.join(base, dir);
  if (!fs.existsSync(start)) return [];
  return fs.readdirSync(start, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== '.gitkeep')
    .map((entry) => toPosix(path.relative(base, path.join(entry.parentPath, entry.name))));
}

const isStoreOwned = (file) =>
  file === 'config/settings_data.json' ||
  (file.startsWith('templates/') && file.endsWith('.json')) ||
  /^sections\/[^/]+\.json$/.test(file);

const isStorefrontLocale = (file) => /^locales\/[^/]+\.json$/.test(file) && !file.endsWith('.schema.json');

// I file scritti da Shopify iniziano con un commento "auto-generated": JSON.parse non lo accetta
const parseJson = (text) => JSON.parse(text.replace(/^﻿?\s*\/\*[\s\S]*?\*\/\s*/, ''));

// Unione a tre vie dei testi: base = ultima consegna, theirs = branch (con le modifiche dell'editor), ours = progetto
function mergeLocale(ours, theirs, base, keyPath, report) {
  if (ours && typeof ours === 'object' && !Array.isArray(ours)) {
    const result = {};
    for (const key of Object.keys(ours)) {
      result[key] = mergeLocale(ours[key], theirs?.[key], base?.[key], [...keyPath, key], report);
    }
    return result;
  }
  const merchantChanged = theirs !== undefined && base !== undefined && typeof theirs === typeof ours && theirs !== base;
  if (!merchantChanged) return ours;
  report.push({ key: keyPath.join('.'), conflict: ours !== base });
  return theirs;
}

// ---------------------------------------------------------------------------------------------- esportazione

if (exportDir) {
  git(['fetch', 'origin', branch]);
  const ref = `origin/${branch}`;
  const files = git(['ls-tree', '-r', '--name-only', ref]).split('\n')
    .filter((file) => isStoreOwned(file) || isStorefrontLocale(file));
  const target = path.resolve(root, exportDir);
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    fs.writeFileSync(path.join(target, file), git(['show', `${ref}:${file}`]) + '\n');
  }
  console.log(`\n✔ Esportati ${files.length} file del negozio (impostazioni, template, testi; nessun codice) in ${target}\n`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------- 1. branch

const sourceDirty = run('git', ['status', '--porcelain']);
if (sourceDirty && !flag('--allow-dirty')) {
  fail('Il progetto ha modifiche non committate: committale prima (o usa --allow-dirty).');
}
if (git(['status', '--porcelain'])) {
  fail(`${worktree} ha modifiche non committate: controllale e annullale prima di una nuova consegna.`);
}

git(['fetch', 'origin'], { allowFail: true }); // un repository appena creato non ha ancora nulla da scaricare
const remoteExists = git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`], { allowFail: true });
if (remoteExists) {
  // Si riparte sempre da GitHub: un commit locale non inviato (consegna preparata senza --push) viene rifatto
  const unpushed = git(['rev-list', '--count', `origin/${branch}..${branch}`], { allowFail: true });
  if (Number(unpushed) > 0) console.log(`⚠ ${unpushed} commit locali di ${branch} non inviati: vengono sostituiti da questa consegna.`);
  git(['checkout', '-B', branch, `origin/${branch}`]);
} else {
  git(['checkout', '--orphan', branch], { allowFail: true }) ?? git(['checkout', branch]);
  const tracked = git(['ls-files']);
  if (tracked) git(['rm', '-r', '-q', '--cached', '.']);
  for (const entry of fs.readdirSync(worktree)) {
    if (entry !== '.git') fs.rmSync(path.join(worktree, entry), { recursive: true, force: true });
  }
  console.log(`Branch ${branch} nuovo: prima consegna.`);
}

// Base dell'unione dei testi: i testi del PROGETTO all'ultima consegna (commit indicato nel messaggio
// "bolter-deploy: <sha> → <branch>"), non il branch, che contiene già i testi del merchant mantenuti: confrontati
// con sé stessi sembrerebbero non modificati e tornerebbero quelli del progetto alla consegna successiva.
const lastDeploySubject = git(['log', '-1', `--grep=^${COMMIT_PREFIX}`, '--format=%s'], { allowFail: true }) || '';
const lastDeploySha = lastDeploySubject.match(/^bolter-deploy: ([0-9a-f]+)(-dirty)?/);
if (lastDeploySha?.[2]) {
  console.log('⚠ L\'ultima consegna veniva da modifiche non committate: per i testi si usa il commit di partenza.');
}
const lastDeploy = lastDeploySha && run('git', ['cat-file', '-e', `${lastDeploySha[1]}^{commit}`], { allowFail: true }) !== null
  ? lastDeploySha[1]
  : null;
if (lastDeploySha && !lastDeploy) {
  console.log(`⚠ Il commit ${lastDeploySha[1]} dell'ultima consegna non è in questo progetto: i testi del merchant non si distinguono.`);
}

// Stato del branch prima di toccarlo (con le modifiche fatte dall'editor)
const branchFiles = new Set(THEME_DIRS.flatMap((dir) => listFiles(worktree, dir)));
const readBranch = (file) => fs.readFileSync(path.join(worktree, file), 'utf8');
const readAtLastDeploy = (file) => (lastDeploy ? run('git', ['show', `${lastDeploy}:${file}`], { allowFail: true }) : null);

// ---------------------------------------------------------------------------------------------- 2. build

console.log('Build di produzione nel branch di consegna…');
fs.mkdirSync(path.join(worktree, 'snippets'), { recursive: true }); // vite-plugin-shopify ci scrive vite-tag.liquid
const build = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: root,
  env: { ...process.env, BOLTER_THEME_ROOT: worktree },
  stdio: 'inherit',
});
if (build.status !== 0) fail('Build non riuscita: il branch non è stato modificato oltre agli asset.');
fs.rmSync(path.join(worktree, 'assets/.vite'), { recursive: true, force: true }); // manifest: escluso da .shopifyignore

// ---------------------------------------------------------------------------------------------- 3-5. file del tema

const sourceFiles = new Set(THEME_DIRS.flatMap((dir) => listFiles(root, dir)).filter((file) => !GENERATED.has(file)));
const kept = [];
const localeReport = {};

for (const file of branchFiles) {
  if (!sourceFiles.has(file) && !GENERATED.has(file) && !isStoreOwned(file)) {
    fs.rmSync(path.join(worktree, file));
  }
}

for (const file of sourceFiles) {
  const from = path.join(root, file);
  const to = path.join(worktree, file);
  const onBranch = branchFiles.has(file);

  if (onBranch && isStoreOwned(file) && !resets.has(file)) {
    if (readBranch(file) !== fs.readFileSync(from, 'utf8')) kept.push(file);
    continue;
  }

  if (onBranch && isStorefrontLocale(file) && !resets.has(file)) {
    const base = readAtLastDeploy(file);
    const branchText = readBranch(file);
    const theirs = parseJson(branchText);
    const report = [];
    const merged = mergeLocale(parseJson(fs.readFileSync(from, 'utf8')), theirs, base ? parseJson(base) : undefined, [], report);
    // Nessuna differenza di contenuto: il file resta com'è (niente modifiche di sola formattazione nella cronologia)
    if (JSON.stringify(merged) !== JSON.stringify(theirs)) {
      const header = branchText.match(/^﻿?\s*\/\*[\s\S]*?\*\/\s*/)?.[0] ?? ''; // commento "auto-generated" di Shopify
      fs.writeFileSync(to, header + JSON.stringify(merged, null, 2) + '\n');
    }
    if (report.length) localeReport[file] = report;
    continue;
  }

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

// ---------------------------------------------------------------------------------------------- 6. commit

git(['add', '-A']);
const changes = git(['status', '--porcelain']);

if (kept.length) {
  console.log(`\nFile del negozio lasciati come sono sul branch (diversi dal progetto, --reset per sovrascriverli):\n  ${kept.join('\n  ')}`);
}
for (const [file, report] of Object.entries(localeReport)) {
  console.log(`\nTesti modificati dal merchant mantenuti in ${file}:`);
  for (const { key, conflict } of report) {
    console.log(`  ${key}${conflict ? '  ⚠ cambiato anche nel progetto: resta il testo del merchant' : ''}`);
  }
}
if (!lastDeploy && branchFiles.size) {
  console.log('\n⚠ Nessuna consegna precedente sul branch: i testi del negozio sono quelli del progetto.');
}

if (!changes) {
  console.log(`\n✔ Nessuna modifica da consegnare su ${branch}.\n`);
  process.exit(0);
}

const sourceSha = run('git', ['rev-parse', '--short', 'HEAD']) + (sourceDirty ? '-dirty' : '');
git(['commit', '-q', '-m', `${COMMIT_PREFIX} ${sourceSha} → ${branch}`]);
console.log(`\n✔ Commit pronto su ${branch} (${changes.split('\n').length} file cambiati, progetto ${sourceSha}).`);

if (flag('--push')) {
  git(['push', 'origin', `${branch}:${branch}`]);
  console.log(`✔ Inviato a GitHub: Shopify aggiorna il tema collegato a ${branch}.\n`);
} else {
  console.log(`  Controlla con: git -C ${path.relative(root, worktree) || '.'} show --stat`);
  console.log(`  Per pubblicarlo: npm run deploy:branch -- ${branch} --push  (oppure git -C ${path.relative(root, worktree)} push origin ${branch})\n`);
}
