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

PBKDF2-SHA256, 310,000 iterations, random 16-byte salt → AES-256-GCM with a
random 12-byte IV. Both sides use WebCrypto (`node:crypto` webcrypto in the
build, `crypto.subtle` in the browser) so they cannot drift apart. GCM is
authenticated, so a wrong passphrase fails cleanly instead of returning junk.

The ciphertext is public. Its contents are not — but anyone who downloaded the
file keeps that copy forever, so changing the passphrase later protects future
versions, not past ones.
