#!/usr/bin/env node
// Encrypt the tree dataset for publication on a public host.
//
//   node tree/build/encrypt.mjs <plaintext.json> <out.json> [passphrase]
//
// AES-256-GCM with a PBKDF2-SHA256 derived key. Uses the same WebCrypto API
// the browser decrypts with, so the two cannot drift apart. Without the
// passphrase the published file is an opaque blob: the ciphertext is public,
// the contents are not.

import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const ITERATIONS = 310000;          // OWASP guidance for PBKDF2-SHA256
const VERSION = 1;

// Short, common, unambiguous words - a passphrase that survives being read
// aloud over the phone to a relative.
const WORDS = ('amber anchor apple arrow autumn bacon badge basket beacon birch ' +
  'bishop bramble bridge bronze butter canyon cedar cellar cherry chimney cider ' +
  'cinder clover cobalt copper coral cottage crimson crystal dagger dawn delta ' +
  'diamond ember falcon fern forest fossil garnet ginger granite harbor harvest ' +
  'hazel heron hollow indigo island ivory jasper juniper kettle lantern lilac ' +
  'linen maple marble meadow mercy mineral mint mosaic nectar nettle nickel ' +
  'nutmeg oak onyx opal orchard otter pebble pepper pewter pine pocket poppy ' +
  'prairie quartz quill raven ribbon river rosemary saffron sage salmon sandal ' +
  'sapphire shadow silver slate sparrow spruce sugar summit sunset thistle ' +
  'thunder timber topaz trellis tulip velvet walnut willow window winter').split(' ');

function makePassphrase(words = 4) {
  const picks = new Uint32Array(words);
  crypto.getRandomValues(picks);
  return Array.from(picks, n => WORDS[n % WORDS.length]).join('-');
}

const b64 = buf => Buffer.from(buf).toString('base64');

async function main() {
  const [src, dest, given] = process.argv.slice(2);
  if (!src || !dest) {
    console.error('usage: node encrypt.mjs <plaintext.json> <out.json> [passphrase]');
    process.exit(2);
  }

  const plaintext = readFileSync(src);
  JSON.parse(plaintext);                          // fail early on bad input

  const passphrase = given || process.env.TREE_PASSPHRASE || makePassphrase();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, plaintext);

  writeFileSync(dest, JSON.stringify({
    v: VERSION,
    kdf: 'PBKDF2-SHA256',
    iter: ITERATIONS,
    salt: b64(salt),
    iv: b64(iv),
    ct: b64(ciphertext),
  }));

  const grew = ((ciphertext.byteLength / plaintext.length - 1) * 100).toFixed(0);
  console.log(`encrypted ${plaintext.length.toLocaleString()} bytes -> ${dest}`);
  console.log(`AES-256-GCM, PBKDF2-SHA256 x${ITERATIONS.toLocaleString()} (+${grew}% before base64)`);
  if (!given && !process.env.TREE_PASSPHRASE) {
    console.log(`\n  PASSPHRASE:  ${passphrase}\n`);
    console.log('  Write this down. It is not stored anywhere and cannot be recovered');
    console.log('  from the published file - losing it means re-encrypting from the GEDCOM.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
