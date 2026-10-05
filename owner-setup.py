#!/usr/bin/env python3
"""One-time setup for the Hook & Ring owner panel.

Creates an owner signing key, locks it with your password, and writes owner-key.json with:
  - the locked (encrypted) key, which only your password can open
  - the public key that every player's game uses to check owner commands
Your password is never stored anywhere. Re-running this makes a new key and replaces the old one.

Run:  python3 ~/src/hook-and-ring/owner-setup.py
"""
import base64, getpass, json, os, sys
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ITER = 600_000
b64 = lambda b: base64.b64encode(b).decode()

pw = getpass.getpass('Choose an owner password (12+ characters, not one you use elsewhere): ')
if len(pw) < 12:
    sys.exit('Too short. Anyone can download the locked key and guess offline, so use at least 12 characters.')
if getpass.getpass('Type it again: ') != pw:
    sys.exit('The two passwords did not match. Nothing was changed.')

key = ec.generate_private_key(ec.SECP256R1())
pkcs8 = key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
spki = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)

salt, iv = os.urandom(16), os.urandom(12)
aes = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(pw.encode())
locked = AESGCM(aes).encrypt(iv, pkcs8, None)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'owner-key.json')
with open(out, 'w') as f:
    json.dump(dict(v=1, iter=ITER, salt=b64(salt), iv=b64(iv), locked=b64(locked), pub=b64(spki)), f)
print(f'Done. Wrote {out}')
print('It contains only the locked key and the public key, so it is safe to publish. Tell Claude it is ready.')
