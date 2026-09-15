#!/usr/bin/env node
// Encrypt an arbitrary file (an HTML fragment, say) for a gated page.
//
//   node tree/build/encrypt_page.mjs <source> <out.json> [passphrase]
//
// Same envelope the tree data uses, so one passphrase opens both.

import { readFileSync, writeFileSync } from 'node:fs';
import { seal, makePassphrase } from './crypto.mjs';
import { stampAssets } from './stamp.mjs';

const [src, dest, given] = process.argv.slice(2);
if (!src || !dest) {
  console.error('usage: node encrypt_page.mjs <source> <out.json> [passphrase]');
  process.exit(2);
}

const bytes = readFileSync(src);
const passphrase = given || process.env.TREE_PASSPHRASE || makePassphrase();
writeFileSync(dest, JSON.stringify(await seal(passphrase, bytes)));

stampAssets('research/index.html', ['research.css', 'research.js']);

console.log(`encrypted ${bytes.length.toLocaleString()} bytes -> ${dest}`);
if (!given && !process.env.TREE_PASSPHRASE) {
  console.log(`\n  PASSPHRASE:  ${passphrase}\n`);
}
