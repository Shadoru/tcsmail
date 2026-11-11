#!/usr/bin/env python3
"""Prepare native installer assets based ONLY on the canonical TCS Mail icon PNG.
No downloaded art and no source-image replacement. Requires Pillow in build runners.
"""
import json
import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(os.environ.get('TCS_RELEASE_PROJECT_ROOT') or Path(__file__).resolve().parents[2]).resolve()
TAURI = ROOT / 'src-tauri'
ICON = TAURI / 'icons' / 'icon.png'
OUT = TAURI / 'branding-tcs-release'
CONFIG = TAURI / 'tauri.tcs-release-branding.conf.json'


def build():
    if not ICON.is_file():
        raise SystemExit(f'FALHA: não encontrei a logo canônica: {ICON}')
    img = Image.open(ICON).convert('RGBA')
    if img.width != img.height or img.width < 256:
        raise SystemExit('FALHA: logo canônica deve ser quadrada e ter ao menos 256px')
    OUT.mkdir(parents=True, exist_ok=True)

    def make(label, w, h, style='panel'):
        bg = Image.new('RGB', (w, h), (248, 251, 255))
        d = ImageDraw.Draw(bg)
        if style in ('panel', 'tall'):
            width = max(12, int(w * (0.24 if style == 'panel' else 0.9)))
            # Branded area behind the actual logo; original icon is never redrawn.
            d.rectangle((0, 0, width, h), fill=(13, 35, 76))
            sz = min(int(width * 0.68), int(h * 0.58), 158)
            pasted = img.resize((sz, sz), Image.Resampling.LANCZOS)
            x = (width - sz)//2
            y = max(3, int(h * 0.18))
            bg.paste(pasted, (x, y), pasted)
            if width < w * 0.7:
                txt_x = width + min(20, w//18)
                d.text((txt_x, h//2 - 10), 'TCS Mail', fill=(13, 35, 76))
        else:
            d.rectangle((0, 0, w, h), fill=(13, 35, 76))
            size = min(164, int(h*0.43))
            x = 48
            y = (h-size)//2
            pasted = img.resize((size, size), Image.Resampling.LANCZOS)
            bg.paste(pasted, (x,y), pasted)
            d.text((x+size+45, h//2-10), 'TCS Mail', fill=(255,255,255))
        path = OUT / label
        bg.save(path)
        return path

    make('nsis-header.bmp', 150, 57, 'panel')
    make('nsis-sidebar.bmp', 164, 314, 'tall')
    make('wix-banner.bmp', 493, 58, 'panel')
    make('wix-dialog.bmp', 493, 312, 'panel')
    make('dmg-background.png', 660, 400, 'dmg')

    overlay = {'bundle': {
        'icon': ['icons/32x32.png', 'icons/128x128.png', 'icons/128x128@2x.png', 'icons/icon.icns', 'icons/icon.ico'],
        'windows': {
            'nsis': {
                'installerIcon': 'icons/icon.ico',
                'headerImage': 'branding-tcs-release/nsis-header.bmp',
                'sidebarImage': 'branding-tcs-release/nsis-sidebar.bmp'
            },
            'wix': {
                'bannerPath': 'branding-tcs-release/wix-banner.bmp',
                'dialogImagePath': 'branding-tcs-release/wix-dialog.bmp'
            }
        },
        'macOS': {'dmg': {'background': 'branding-tcs-release/dmg-background.png'}}
    }}
    CONFIG.write_text(json.dumps(overlay, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    expected = {
        'nsis-header.bmp': (150,57), 'nsis-sidebar.bmp': (164,314),
        'wix-banner.bmp': (493,58), 'wix-dialog.bmp': (493,312),
        'dmg-background.png': (660,400)
    }
    for name, dims in expected.items():
        with Image.open(OUT/name) as test:
            if test.size != dims:
                raise SystemExit(f'Dimensões inválidas em {name}: {test.size}')
    print('Branding TCS Mail preparado a partir do icon.png existente.')
    print('Configuração sobreposta:', CONFIG)

if __name__ == '__main__':
    build()
