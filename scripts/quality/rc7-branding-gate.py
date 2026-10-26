#!/usr/bin/env python3
"""Bit-for-bit source-resource contract; no claims about native GUI runtime."""
from pathlib import Path
from hashlib import sha256
import json
from PIL import Image
root=Path(__file__).resolve().parents[2]
m=json.loads((root/'scripts/quality/rc7-branding-manifest.json').read_text(encoding='utf-8'))
for name,expected in m['files'].items():
    path=root/name
    assert path.is_file(), f'Missing approved brand resource: {name}'
    assert sha256(path.read_bytes()).hexdigest()==expected, f'Brand resource diverged: {name}'
for name in ('frontend/assets/tcs-mail-logo.png','src-tauri/icons/icon.png'):
    with Image.open(root/name) as im: im.verify()
conf=json.loads((root/'src-tauri/tauri.conf.json').read_text(encoding='utf-8'))
assert conf['version']=='0.8.2-rc7'
assert (root/'src-tauri/icons/icon.icns').is_file() and (root/'src-tauri/icons/icon.ico').is_file()
assert (root/'frontend/index.html').read_text(encoding='utf-8').count('assets/tcs-mail-logo.png')>=1
print('PASS: approved raster-derived source logo SHA-256 across 13 runtime and packaging assets')
