#!/usr/bin/env python3
"""Bit-for-bit source-resource contract; no claims about native GUI runtime."""
from pathlib import Path
from hashlib import sha256
import json
import struct
import zlib
root=Path(__file__).resolve().parents[2]
m=json.loads((root/'scripts/quality/rc8-branding-manifest.json').read_text(encoding='utf-8'))
for name,expected in m['files'].items():
    path=root/name
    assert path.is_file(), f'Missing approved brand resource: {name}'
    assert sha256(path.read_bytes()).hexdigest()==expected, f'Brand resource diverged: {name}'
def verify_png(path):
    raw = path.read_bytes()
    assert raw[:8] == b'\x89PNG\r\n\x1a\n', f'Invalid PNG signature: {path}'
    assert len(raw) >= 33 and raw[12:16] == b'IHDR', f'Invalid PNG header: {path}'
    assert struct.unpack('>I', raw[8:12])[0] == 13, f'Invalid IHDR size: {path}'
    w,h=struct.unpack('>II',raw[16:24])
    assert 1 <= w <= 4096 and 1 <= h <= 4096, f'Invalid PNG dimensions: {path}'
    pos=8
    seen_iend=False
    while pos + 12 <= len(raw):
        n=struct.unpack('>I', raw[pos:pos+4])[0]
        end=pos+12+n
        assert end <= len(raw), f'Truncated PNG: {path}'
        kind=raw[pos+4:pos+8]
        assert zlib.crc32(raw[pos+4:pos+8+n]) & 0xffffffff == struct.unpack('>I',raw[pos+8+n:end])[0], f'PNG CRC mismatch: {path}'
        pos=end
        if kind == b'IEND':
            assert n == 0 and pos == len(raw), f'Bad IEND: {path}'
            seen_iend=True
            break
    assert seen_iend, f'Missing PNG IEND: {path}'
    return w,h
for name in m['files']:
    if name.lower().endswith('.png'):
        verify_png(root/name)

conf=json.loads((root/'src-tauri/tauri.conf.json').read_text(encoding='utf-8'))
assert conf['version']=='0.8.3'
assert m['version']=='0.8.2-rc8'
assert len(m['files']) == 13
assert (root/'src-tauri/icons/icon.icns').is_file() and (root/'src-tauri/icons/icon.ico').is_file()
assert (root/'frontend/index.html').read_text(encoding='utf-8').count('assets/tcs-mail-logo.png')>=1
print('PASS: approved raster-derived source logo SHA-256 across 13 runtime and packaging assets')
