#!/usr/bin/env node
/*
 Attach photos to the tree.

   node tree/build/add_photos.mjs <photo-folder> <tree-data.json> [passphrase]

 Reads every image in <photo-folder>, works out who each one belongs to from
 its filename, shrinks it, encrypts it, and writes it to tree/photos/. The
 person -> photo map is injected into <tree-data.json> so it ends up inside the
 encrypted payload: which relatives have a photo is itself private.

 Naming a file:
   I35.jpg  /  @I35@.jpg      the GEDCOM record id (most precise)
   Thomas Ervin Fandre.jpg    the person's name, as it appears in the tree
   thomas-fandre.jpg          loose match on given + surname
   Helen Meirose 1912.jpg     add a birth year to break a tie

 Anything it cannot place is reported and skipped; nothing is guessed silently.
 HEIC from an iPhone is fine — macOS `sips` converts it.
*/

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { deriveKey, sealWith, randomBytes, makePassphrase } from './crypto.mjs';

const MAX_EDGE = 640;           // plenty for a 54px avatar on a retina screen
const JPEG_QUALITY = 70;
const OUT_DIR = 'tree/photos';
const EXT = /\.(jpe?g|png|heic|heif|tiff?|webp|gif)$/i;

const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const squash = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Index the tree so a filename can be resolved to exactly one person. */
function buildIndex(people) {
  const byXref = new Map(), byName = new Map(), byLoose = new Map();
  const add = (map, key, person) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(person);
  };
  for (const p of people) {
    if (p.xref) add(byXref, squash(p.xref.replace(/@/g, '')), p);
    add(byName, squash(p.n), p);
    const parts = norm(p.n).split(' ').filter(Boolean);
    if (parts.length) add(byLoose, squash(parts[0] + (p.s || parts[parts.length - 1])), p);
    if (p.b?.y) {
      add(byName, squash(p.n) + p.b.y, p);
      if (parts.length) add(byLoose, squash(parts[0] + (p.s || '')) + p.b.y, p);
    }
  }
  return { byXref, byName, byLoose };
}

function resolve(filename, idx) {
  const stem = basename(filename, extname(filename)).replace(/[_]+/g, ' ').trim();
  const key = squash(stem);
  for (const map of [idx.byXref, idx.byName, idx.byLoose]) {
    const hit = map.get(key);
    if (hit?.length === 1) return { person: hit[0] };
    if (hit?.length > 1) return { ambiguous: hit };
  }
  return {};
}

/** Shrink and re-encode with sips, which ships with macOS. */
function shrink(src) {
  const out = join(tmpdir(), `tree-photo-${process.pid}-${Math.random().toString(36).slice(2)}.jpg`);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(JPEG_QUALITY),
                        '-Z', String(MAX_EDGE), src, '--out', out], { stdio: 'pipe' });
  return out;
}

async function main() {
  const [dir, dataPath, given] = process.argv.slice(2);
  if (!dir || !dataPath) {
    console.error('usage: node add_photos.mjs <photo-folder> <tree-data.json> [passphrase]');
    process.exit(2);
  }
  if (process.platform !== 'darwin') {
    console.error('this script uses macOS `sips` to resize; on another platform, '
                + 'resize to ~640px yourself and adjust shrink()');
    process.exit(2);
  }

  const data = JSON.parse(readFileSync(dataPath, 'utf8'));
  const idx = buildIndex(data.people);
  const files = readdirSync(dir).filter(f => EXT.test(f) && !f.startsWith('.')).sort();
  if (!files.length) {
    console.error(`no images in ${dir}`);
    process.exit(1);
  }

  const passphrase = given || process.env.TREE_PASSPHRASE || makePassphrase();
  // One salt and one derived key for the whole set: 600k PBKDF2 rounds per
  // photo would make the page crawl. Every file still gets its own IV.
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt);

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const photos = {}, placed = [], skipped = [];
  let slot = 0, bytesIn = 0, bytesOut = 0;

  for (const file of files) {
    const src = join(dir, file);
    const { person, ambiguous } = resolve(file, idx);
    if (!person) {
      skipped.push(`${file} — ${ambiguous
        ? `matches ${ambiguous.length} people (${ambiguous.map(p => p.n).join(', ')}); add a birth year`
        : 'no match in the tree'}`);
      continue;
    }
    if (photos[person.i] !== undefined) {
      skipped.push(`${file} — ${person.n} already has a photo`);
      continue;
    }

    let small;
    try { small = shrink(src); }
    catch { skipped.push(`${file} — could not be read as an image`); continue; }

    const bytes = readFileSync(small);
    rmSync(small, { force: true });
    bytesIn += readFileSync(src).length;
    bytesOut += bytes.length;

    const n = slot++;
    writeFileSync(join(OUT_DIR, `${n}.enc`), JSON.stringify(await sealWith(key, salt, bytes)));
    photos[person.i] = n;
    placed.push(`${file}  ->  ${person.n}${person.b?.y ? ` (b. ${person.b.y})` : ''}`);
  }

  data.photos = photos;
  data.photoSalt = Buffer.from(salt).toString('base64');
  writeFileSync(dataPath, JSON.stringify(data));

  const kb = n => `${(n / 1024).toFixed(0)} KB`;
  console.log(`\n${placed.length} photo(s) attached, ${skipped.length} skipped`);
  for (const line of placed) console.log(`  ${line}`);
  if (skipped.length) {
    console.log('\nskipped:');
    for (const line of skipped) console.log(`  ${line}`);
  }
  if (placed.length) {
    console.log(`\n${kb(bytesIn)} of originals -> ${kb(bytesOut)} encrypted in ${OUT_DIR}/`);
    console.log(`manifest written into ${dataPath} (it ships inside the encrypted payload)`);
  }
  if (!given && !process.env.TREE_PASSPHRASE) {
    console.log(`\n  PASSPHRASE USED:  ${passphrase}`);
    console.log('  Pass the SAME one to encrypt.mjs or the photos will not open.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
