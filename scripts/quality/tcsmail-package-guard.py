#!/usr/bin/env python3
"""Preflight and bundle manifest; does not claim to verify runtime behavior."""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
REQ = {
    'linux': ['.deb', '.rpm'],
    'windows': ['.exe', '.msi'],
    'mac_intel': ['.dmg', '.app'],
    'mac_arm': ['.dmg', '.app'],
}

def check_source():
    conf = json.loads((ROOT / 'src-tauri/tauri.conf.json').read_text(encoding='utf-8'))
    assert conf.get('version') == '0.8.2-rc6', 'Version is not 0.8.2-rc6'
    assert conf.get('identifier') == 'com.thecreativesolver.TCSMail', 'Unexpected Tauri ID'
    assert conf.get('bundle', {}).get('active'), 'Tauri bundle disabled'
    paths = ['Cargo.toml', 'Cargo.lock', 'frontend/main.js', 'src-tauri/icons/icon.ico',
             'src-tauri/icons/icon.icns', 'scripts/quality/rc2-presentation-verify.py']
    for name in paths:
        assert (ROOT / name).is_file(), f'Missing source: {name}'
    conf_wix=conf.get('bundle',{}).get('windows',{}).get('wix',{})
    assert conf_wix.get('version') == '0.8.206', 'MSI internal version wrong'
    rpm_files=conf['bundle']['linux']['rpm']['files']
    for sz in (32,128,256,512):
        alias=f'/usr/share/icons/hicolor/{sz}x{sz}/apps/tcs-mail.png'
        assert alias not in rpm_files, f'RPM duplicate icon alias: {alias}'
    main=(ROOT/'src-tauri/src/main.rs').read_text(encoding='utf-8')
    assert 'windows_subsystem' in main, 'Windows GUI subsystem missing'
    secrets=(ROOT/'crates/tcs-core/src/secrets.rs').read_text(encoding='utf-8')
    assert '"-EncodedCommand"' in secrets and '.creation_flags(0x0800_0000)' in secrets, 'Windows credential command or console protection missing'
    assert 'mod windows_credential_tests' in secrets, 'Windows credential regression test missing'
    rust = (ROOT / 'src-tauri/src/lib.rs').read_text(encoding='utf-8')
    assert 'pub fn write_support_view()' not in rust, 'Old Clippy dead-code fix not incorporated'
    print('PASS: RC5 source, metadata, icons and Clippy fix')

def bundle(args):
    basedir = pathlib.Path(args.bundles)
    if not basedir.is_dir():
        raise RuntimeError(f'Bundle directory missing: {basedir}')
    collected = [p for p in basedir.rglob('*') if (p.is_file() and p.suffix.lower() in ('.deb','.rpm','.exe','.msi','.dmg')) or (p.is_dir() and p.suffix.lower()=='.app')]
    selected = []
    for ext in REQ[args.kind]:
        matches = [p for p in collected if p.suffix.lower() == ext]
        if len(matches) != 1:
            raise RuntimeError(f'Expected exactly 1 {ext}, found {len(matches)}: {matches}')
        selected.append(matches[0])
    # Verify actual embedded Debian/RPM versions; never accept stale outputs.
    if args.kind == 'linux':
        for p in selected:
            if p.suffix == '.deb':
                version = subprocess.check_output(['dpkg-deb','-f',str(p),'Version'],text=True).strip()
                if not (version == '0.8.2-rc6' or version.startswith('0.8.2-rc6-')):
                    raise RuntimeError(f'DEB version mismatch: {version}')
            elif p.suffix == '.rpm':
                version = subprocess.check_output(['rpm','-qp','--queryformat','%{VERSION}-%{RELEASE}',str(p)],text=True).strip()
                if version != '0.8.2-0.rc6.1':
                    raise RuntimeError(f'RPM version mismatch: {version}')
    # linux deeper inspection using package checker
    if args.kind == 'linux':
        script = ROOT / 'scripts/quality/rc2-presentation-verify.py'
        for p in selected:
            subprocess.run([sys.executable, str(script), '--deb' if p.suffix=='.deb' else '--rpm', str(p)], check=True)
    out = pathlib.Path('delivery') / args.label
    out.mkdir(parents=True, exist_ok=True)
    package = out / f'tcsmail-0.8.2-rc6-{args.label}.zip'
    manifest = []
    with zipfile.ZipFile(package, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as z:
        for p in selected:
            if p.is_dir():
                # Preserve .app symlinks/resources/codesign in a native macOS ZIP;
                # Python zipfile recursively following files would alter the bundle.
                if sys.platform != 'darwin' or shutil.which('ditto') is None:
                    raise RuntimeError('Mac .app must be archived by ditto on a macOS runner')
                appzip = out / (p.name + '.zip')
                subprocess.run(['ditto','-c','-k','--sequesterRsrc','--keepParent',str(p),str(appzip)],check=True)
                z.write(appzip, appzip.name)
                appzip.unlink()
            else:
                z.write(p, p.name)
            manifest.append({'name':p.name,'kind':'app' if p.is_dir() else p.suffix[1:]})
    sha = hashlib.sha256(package.read_bytes()).hexdigest()
    (out / (package.name+'.sha256')).write_text(f'{sha}  {package.name}\n',encoding='utf-8')
    (out / 'build-info.json').write_text(json.dumps({'version':'0.8.2-rc6','github_sha':args.sha,'platform':args.label,'files':manifest,'zip_sha256':sha}, indent=2),encoding='utf-8')
    print('PASS:', package, 'SHA-256', sha)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    mode=ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--source', action='store_true')
    mode.add_argument('--bundles')
    ap.add_argument('--kind', choices=REQ)
    ap.add_argument('--label')
    ap.add_argument('--sha', default='local')
    a=ap.parse_args()
    try:
        check_source() if a.source else bundle(a)
    except (RuntimeError, ValueError, AssertionError) as e:
        sys.exit(f'FAIL: {e}')
