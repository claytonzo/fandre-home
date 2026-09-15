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

const ITERATIONS = 600000;          // above OWASP guidance: the ciphertext is public
const VERSION = 1;

// Short, common, unambiguous words - a passphrase that survives being read
// aloud over the phone to a relative.
const WORDS = ('amber anchor apple apron arbor archer arrow aspen attic autumn bacon badge ' +
  'bagel bakery balcony bamboo banjo barley barn basil basket beacon beetle ' +
  'bellow birch biscuit bishop bison blanket blossom bluff bonfire bottle ' +
  'boulder bramble branch brass bread bridge bristle bronze brook broom bucket ' +
  'buffalo bugle bundle burrow butter button cabin cactus canal candle cannon ' +
  'canoe canvas canyon caramel cardinal carpet carrot cascade castle cavern ' +
  'cedar cellar chapel cheddar cherry chestnut chimney chisel cider cinder ' +
  'cinnamon circus cistern citrus clover cobalt cobble cocoa comet compass ' +
  'copper coral cottage cotton crackle cradle crane crater crayon crimson ' +
  'crocus crystal cypress dagger dairy daisy dampen dandy dawn delta denim ' +
  'desert diamond dogwood dolphin domino donkey drift drummer dunes dusk eagle ' +
  'ember emerald falcon fathom feather fennel fern ferry fiddle fjord flannel ' +
  'flint flutter forest fossil fountain foxglove freckle frost galley garden ' +
  'garnet gazelle ginger glacier glimmer granary granite gravel grotto grove ' +
  'gully gypsum hammock harbor harvest hatchet hazel heather hedge hemlock ' +
  'heron hickory hollow honey hornet hurdle indigo inkwell iris island ivory ' +
  'jasmine jasper jetty juniper kettle kindle lagoon lantern lattice lavender ' +
  'ledger lemon lichen lilac lily linen lobster locket lodge lotus lumber ' +
  'lyric magnet mallard mango manor maple marble marigold marsh meadow medley ' +
  'mercy mesa midden mineral minnow mint mirror mitten mosaic moss mulberry ' +
  'mullet mustard nectar nettle nickel noodle nutmeg oak oasis oatmeal onyx ' +
  'opal orchard oregano osprey otter outpost oyster paddle pantry parcel ' +
  'parsley pasture pebble pelican pepper pewter pigeon pillar pine pocket ' +
  'pollen pond poppy porch portal pottery prairie pumpkin quarry quartz quill ' +
  'quilt radish rafter ragtime rambler rattle raven ribbon ridge ripple river ' +
  'robin rocket rosemary rudder saddle saffron sage sailor salmon sandal ' +
  'sapling sapphire satchel scallop scarlet seagull sesame shadow shale shanty ' +
  'shelter shingle shovel shutter signal silver skillet slate sleigh smolder ' +
  'socket sorrel sparrow spindle spire spruce squash stable starling stencil ' +
  'stirrup stone stork stream stucco sugar summit sunset surf swallow sycamore ' +
  'tabby talon tangerine tapestry teapot tempo tender thicket thimble thistle ' +
  'thorn thunder tidal timber tinder toffee topaz torch tower trellis trestle ' +
  'trolley trout tulip tundra tunnel turnip turret twilight umber valley ' +
  'vanilla velvet vessel village vine violet wagon walnut warble waterfall ' +
  'weaver whistle willow window winter wisteria wombat woodland yarrow yeast ' +
  'yonder').split(' ');

// Six words from this list is ~48 bits. Against an offline attack on the
// published ciphertext at ~15k PBKDF2 guesses/sec that is centuries; four
// words from a short list would have been about an hour.
function makePassphrase(words = 6) {
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
