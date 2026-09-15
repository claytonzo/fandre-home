// Stamp asset URLs in a page with a hash of each asset's contents.
//
// GitHub Pages serves CSS/JS with a ten-minute max-age while encrypted payloads
// are fetched no-store and are always current. Without this, a returning
// visitor can run yesterday's script against today's data — which is exactly
// how the first photo silently failed to appear.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

export function stampAssets(pagePath, assets) {
  const dir = dirname(pagePath);
  let html = readFileSync(pagePath, 'utf8');
  let changed = false;
  for (const asset of assets) {
    const hash = createHash('sha256')
      .update(readFileSync(join(dir, asset))).digest('hex').slice(0, 8);
    const pattern = new RegExp(`(["'])${asset.replace('.', '\\.')}(\\?v=[a-f0-9]+)?\\1`, 'g');
    const next = html.replace(pattern, `$1${asset}?v=${hash}$1`);
    if (next !== html) { html = next; changed = true; }
  }
  if (changed) {
    writeFileSync(pagePath, html);
    console.log(`stamped ${assets.join(' / ')} in ${pagePath}`);
  }
  return changed;
}
