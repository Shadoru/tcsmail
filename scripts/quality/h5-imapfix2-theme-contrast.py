#!/usr/bin/env python3
"""Conservative computed palette contrast check for the active sidebar rule.

The final .navItem.active background is color-mix(in srgb, var(--side-text)
15%, var(--side)); this checks all declared theme tokens including system dark.
This does not substitute for native WebKitGTK UI testing.
"""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
css=(ROOT/'frontend/styles.css').read_text(encoding="utf-8")
assert 'color-mix(in srgb,var(--side-text) 15%,var(--side))' in css
assert 'html[data-theme="system"]{\n  --side-text:#eef1f4;' in css
colors={
 'light':('#20252a','#e4e8ed'),
 'dark':('#eef1f4','#1d2125'),
 'focus':('#f4f7fb','#17243b'),
 'ocean':('#f4fbff','#083c5a'),
 'graphite':('#f5f6f7','#293039'),
 'system-light':('#20252a','#e4e8ed'),
 'system-dark':('#eef1f4','#1d2125'),
}
def rgb(code):return [int(code[i:i+2],16)/255 for i in (1,3,5)]
def luminance(v):
 x=[z/12.92 if z<=.04045 else ((z+.055)/1.055)**2.4 for z in v]
 return sum(a*b for a,b in zip(x,[.2126,.7152,.0722]))
for name,(fg,bg) in colors.items():
 a=rgb(fg);b=rgb(bg);mix=[.15*x+.85*y for x,y in zip(a,b)]
 la,lb=luminance(a),luminance(mix)
 contrast=(max(la,lb)+.05)/(min(la,lb)+.05)
 print(f'{name}: contraste estimado {contrast:.2f}:1')
 assert contrast>=4.5,(name,contrast)
print('PASS: 7 variantes com contraste estimado >=4.5:1 para a seleção lateral')
