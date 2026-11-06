#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys
root=Path(__file__).resolve().parents[2]
gate=(root/'scripts/quality/rc7-branding-gate.py').read_text(encoding='utf-8')
assert 'from PIL import Image' not in gate
assert 'verify_png' in gate and 'zlib.crc32' in gate
view=(root/'frontend/views.js').read_text(encoding='utf-8')
assert 'Aguarde: autorização Microsoft' in view and 'clearTimeout(progressTimer)' in view
lib=(root/'src-tauri/src/lib.rs').read_text(encoding='utf-8')
assert 'conexão TCP com' in lib and 'Nenhuma conta foi gravada' in lib
subprocess.run([sys.executable,str(root/'scripts/quality/rc7-branding-gate.py')], check=True)
print('PASS: stdlib branding, Microsoft waiting state and precise network timeout error')
