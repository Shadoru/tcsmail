#!/usr/bin/env python3
"""Collect one new EXE (NSIS) and one MSI using Cargo metadata on Windows.

Avoid POSIX find/MSYS path conversion and silent success with missing artifacts.
"""
import argparse
import json
from pathlib import Path
import shutil
from cargo_layout import paths

ROOT = Path(__file__).resolve().parents[2]


def collect_windows(root: Path, destination: Path):
    root = Path(root).resolve()
    config = json.loads((root / 'src-tauri' / 'tauri.conf.json').read_text(encoding='utf-8'))
    if config.get('version') != '0.8.3':
        raise RuntimeError('Versao TCS Mail alterada; esperado exatamente 0.8.3')
    bundle = Path(paths(root)['TCS_CARGO_BUNDLE'])
    if not bundle.is_dir():
        raise FileNotFoundError(f'Bundle Cargo ausente: {bundle}')
    result = []
    for name, relative, suffix in (
        ('NSIS', 'nsis', '.exe'), ('MSI', 'msi', '.msi')
    ):
        folder = bundle / relative
        matches = sorted(p for p in folder.rglob('*') if p.is_file() and
                         not p.is_symlink() and p.suffix.lower() == suffix) if folder.is_dir() else []
        if len(matches) != 1 or matches[0].stat().st_size == 0:
            raise RuntimeError(f'Esperado exatamente 1 {name} novo em {folder}; encontrados: {len(matches)}')
        result.append(matches[0])
    destination = Path(destination).resolve()
    if any((destination / p.name).exists() for p in result):
        raise RuntimeError('A pasta de saida ja contem um instalador com o mesmo nome')
    if len({p.name.lower() for p in result}) != len(result):
        raise RuntimeError('Colisao entre nomes de instaladores')
    destination.mkdir(parents=True, exist_ok=True)
    for source in result:
        target = destination / source.name
        shutil.copy2(source, target)
        print(f'COPIADO: {source} -> {target}')
    return [destination / p.name for p in result]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--windows', action='store_true', required=True)
    parser.add_argument('--destination', type=Path, default=Path('_build_out'))
    args = parser.parse_args()
    collect_windows(args.root, args.destination)


if __name__ == '__main__':
    main()
