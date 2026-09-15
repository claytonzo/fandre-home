// Shared crypto for the build scripts. The browser decrypts with the same
// WebCrypto primitives, so the two sides cannot drift apart.
import { webcrypto as crypto } from 'node:crypto';

export const ITERATIONS = 600000;   // above OWASP guidance: the ciphertext is public
export const VERSION = 1;

// Curated so a passphrase survives being read aloud over the phone.
export const WORDS = ('amber anchor apple apron arbor archer arrow aspen attic autumn bacon ' +
  'badge bagel bakery balcony bamboo banjo barley barn basil basket beacon beetle bellow ' +
  'birch biscuit bishop bison blanket blossom bluff bonfire bottle boulder bramble branch ' +
  'brass bread bridge bristle bronze brook broom bucket buffalo bugle bundle burrow butter ' +
  'button cabin cactus canal candle cannon canoe canvas canyon caramel cardinal carpet ' +
  'carrot cascade castle cavern cedar cellar chapel cheddar cherry chestnut chimney chisel ' +
  'cider cinder cinnamon circus cistern citrus clover cobalt cobble cocoa comet compass ' +
  'copper coral cottage cotton crackle cradle crane crater crayon crimson crocus crystal ' +
  'cypress dagger dairy daisy dampen dandy dawn delta denim desert diamond dogwood dolphin ' +
  'domino donkey drift drummer dunes dusk eagle ember emerald falcon fathom feather fennel ' +
  'fern ferry fiddle fjord flannel flint flutter forest fossil fountain foxglove freckle ' +
  'frost galley garden garnet gazelle ginger glacier glimmer granary granite gravel grotto ' +
  'grove gully gypsum hammock harbor harvest hatchet hazel heather hedge hemlock heron ' +
  'hickory hollow honey hornet hurdle indigo inkwell iris island ivory jasmine jasper jetty ' +
  'juniper kettle kindle lagoon lantern lattice lavender ledger lemon lichen lilac lily ' +
  'linen lobster locket lodge lotus lumber lyric magnet mallard mango manor maple marble ' +
  'marigold marsh meadow medley mercy mesa midden mineral minnow mint mirror mitten mosaic ' +
  'moss mulberry mullet mustard nectar nettle nickel noodle nutmeg oak oasis oatmeal onyx ' +
  'opal orchard oregano osprey otter outpost oyster paddle pantry parcel parsley pasture ' +
  'pebble pelican pepper pewter pigeon pillar pine pocket pollen pond poppy porch portal ' +
  'pottery prairie pumpkin quarry quartz quill quilt radish rafter ragtime rambler rattle ' +
  'raven ribbon ridge ripple river robin rocket rosemary rudder saddle saffron sage sailor ' +
  'salmon sandal sapling sapphire satchel scallop scarlet seagull sesame shadow shale ' +
  'shanty shelter shingle shovel shutter signal silver skillet slate sleigh smolder socket ' +
  'sorrel sparrow spindle spire spruce squash stable starling stencil stirrup stone stork ' +
  'stream stucco sugar summit sunset surf swallow sycamore tabby talon tangerine tapestry ' +
  'teapot tempo tender thicket thimble thistle thorn thunder tidal timber tinder toffee ' +
  'topaz torch tower trellis trestle trolley trout tulip tundra tunnel turnip turret ' +
  'twilight umber valley vanilla velvet vessel village vine violet wagon walnut warble ' +
  'waterfall weaver whistle willow window winter wisteria wombat woodland yarrow yeast ' +
  'yonder').split(' ');

/** Six words is ~51 bits; four from a short list would be about an hour to break. */
export function makePassphrase(count = 6) {
  const picks = new Uint32Array(count);
  crypto.getRandomValues(picks);
  return Array.from(picks, n => WORDS[n % WORDS.length]).join('-');
}

export const b64 = buf => Buffer.from(buf).toString('base64');

/** Derive the AES key for a given salt. Reused across every photo in a build. */
export async function deriveKey(passphrase, salt, usage = ['encrypt']) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, usage);
}

export const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));

/** Encrypt one payload. Returns the envelope the browser expects. */
export async function seal(passphrase, bytes, salt = randomBytes(16)) {
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { v: VERSION, kdf: 'PBKDF2-SHA256', iter: ITERATIONS,
           salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

/** Encrypt with a key that was already derived — for many files under one salt. */
export async function sealWith(key, salt, bytes) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { v: VERSION, kdf: 'PBKDF2-SHA256', iter: ITERATIONS,
           salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
