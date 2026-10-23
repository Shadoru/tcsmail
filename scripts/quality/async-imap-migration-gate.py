#!/usr/bin/env python3
"""Fail closed until async-imap completely replaces legacy IMAP paths."""
import argparse, pathlib, re, sys, tomllib
parser = argparse.ArgumentParser()
parser.add_argument('--root', type=pathlib.Path)
args = parser.parse_args()
ROOT = args.root.resolve() if args.root else pathlib.Path(__file__).resolve().parents[2]
core=tomllib.loads((ROOT/'crates/tcs-core/Cargo.toml').read_text(encoding="utf-8"))
manifest=core['dependencies']
found=[]
if 'imap' in manifest: found.append('Direct legacy dependency: imap')
if 'imap-proto' in manifest: found.append('Direct legacy dependency: imap-proto')
ai=manifest.get('async-imap')
if not isinstance(ai,dict) or ai.get('version') not in ('=0.11.3', '=0.12.0'): found.append('async-imap must be pinned to a reviewed release (=0.11.3 or =0.12.0)')
if isinstance(ai,dict) and ai.get('optional',False): found.append('async-imap still optional, not production backend')
for p in sorted((ROOT/'crates').rglob('*.rs')):
    s=p.read_text(encoding="utf-8")
    for pattern in (r'\buse imap::',r'\bimap::',r'(?<![\w:])imap_proto::',r'\buse imap_proto::'):
        n=len(re.findall(pattern,s))
        if n: found.append(f'{p.relative_to(ROOT)} contains {n} legacy references for {pattern}')
lock_path = ROOT / 'Cargo.lock'
if not lock_path.exists():
    found.append('Cargo.lock missing: dependency resolution not verified')
else:
    try:
        lock = tomllib.loads(lock_path.read_text(encoding="utf-8"))
        packages = lock.get('package', [])
        legacy_imap = sorted({p['version'] for p in packages if p.get('name') == 'imap'})
        proto_versions = sorted({p['version'] for p in packages if p.get('name') == 'imap-proto'})
        async_versions = sorted({p['version'] for p in packages if p.get('name') == 'async-imap'})
        if legacy_imap:
            found.append(f'Cargo.lock retains legacy imap: {", ".join(legacy_imap)}')
        if proto_versions != ['0.17.0']:
            found.append(f'Cargo.lock must contain exactly imap-proto 0.17.0; found: {", ".join(proto_versions) or "none"}')
        if async_versions != ['0.12.0']:
            found.append(f'Cargo.lock must contain exactly async-imap 0.12.0; found: {", ".join(async_versions) or "none"}')
    except (ValueError, KeyError, TypeError) as exc:
        found.append(f'Cargo.lock unreadable or malformed: {exc}')
if found:
    print('FAIL: async-imap migration incomplete:')
    for line in found: print(' - '+line)
    sys.exit(1)
print('PASS static migration prerequisites; this does not prove compilation or operational compatibility')
