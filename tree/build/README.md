# Rebuilding the tree data

The page ships `tree/data.enc.json` — the whole family tree, AES-256-GCM
encrypted. The plaintext and the GEDCOM it comes from are **never** committed
to this repository, which is public.

## Steps

The GEDCOM and its tooling live in a separate private repo (`fandre-ged`).

```bash
# 1. export the web dataset from the GEDCOM
python3 ../fandre-ged/tools/export_tree.py -o /tmp/tree-data.json

# 2. encrypt it with the family passphrase
node tree/build/encrypt.mjs /tmp/tree-data.json tree/data.enc.json 'the-passphrase'

# 3. check it in and push
git add tree/data.enc.json && git commit -m "Update tree data"
```

Omit the passphrase argument and `encrypt.mjs` generates a fresh four-word one
and prints it. `TREE_PASSPHRASE` in the environment works too.

## What the exporter drops

`export_tree.py` never emits addresses, phone numbers or email addresses, and
it aborts rather than write a file where a contact detail or an internal record
id slipped through. That is a backstop, not the main protection — the real
protection is the encryption.

## Crypto

PBKDF2-SHA256, 600,000 iterations, random 16-byte salt → AES-256-GCM with a
random 12-byte IV. Both sides use WebCrypto (`node:crypto` webcrypto in the
build, `crypto.subtle` in the browser) so they cannot drift apart. GCM is
authenticated, so a wrong passphrase fails cleanly instead of returning junk.
The browser reads the iteration count out of the file, so raising it here does
not break older links.

## Passphrase strength — the part that actually matters

The ciphertext is public, so the only thing standing between it and a reader is
the passphrase, and an attacker can grind it offline as fast as their hardware
allows. Assume roughly 15,000 PBKDF2 guesses/second for a determined attacker
with a handful of GPUs at 600k iterations.

| Passphrase | Entropy | Time to break |
| --- | --- | --- |
| 4 words from a 108-word list | 27 bits | **~1 hour** |
| 6 words from this 368-word list | 51 bits | ~5,000 years |

The generator defaults to six words for that reason. If you choose your own,
choose it on that basis: length and unpredictability, not cleverness. A
memorable sentence of six or more uncommon words is fine; a name and a birth
year is not — this file is a genealogy, so those are the first guesses.

Anyone who downloaded the published file keeps that copy forever, so changing
the passphrase later protects future versions, not past ones.
