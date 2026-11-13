#!/usr/bin/env python3
"""Resolve Cargo's actual target_directory from workspace metadata (not src-tauri/target).

No build, publication or private key access. Compatible with Linux/macOS/Windows.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def paths(root: Path = ROOT):
    root = Path(root).resolve()
    manifest = root / 'src-tauri' / 'Cargo.toml'
    if not manifest.is_file():
        raise RuntimeError('Cargo.toml ausente: ' + str(manifest))
    command = ['cargo', 'metadata', '--format-version', '1', '--no-deps',
               '--manifest-path', str(manifest)]
    out = subprocess.run(command, cwd=root, check=True, capture_output=True, text=True)
    meta = json.loads(out.stdout)
    raw = meta.get('target_directory')
    if not isinstance(raw, str) or not raw:
        raise RuntimeError('Cargo metadata nao informou target_directory')
    target = Path(raw)
    if not target.is_absolute():
        raise RuntimeError('Cargo metadata informou target_directory relativo')
    target = target.resolve()
    return {
        'TCS_CARGO_TARGET': str(target),
        'TCS_CARGO_RELEASE': str(target / 'release'),
        'TCS_CARGO_BUNDLE': str(target / 'release' / 'bundle'),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--github-env', action='store_true')
    args = parser.parse_args()
    result = paths(args.root)
    print('Cargo workspace alvo:', result['TCS_CARGO_TARGET'])
    if args.github_env:
        envpath = os.environ.get('GITHUB_ENV')
        if not envpath:
            raise SystemExit('FALHA: GITHUB_ENV nao definido')
        with open(envpath, 'a', encoding='utf-8') as stream:
            for name, value in result.items():
                if '\n' in value or '\r' in value:
                    raise SystemExit('FALHA: caminho Cargo invalido')
                stream.write(name + '=' + value + '\n')
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
