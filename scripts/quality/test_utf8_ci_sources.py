#!/usr/bin/env python3
"""Prevent Windows cp1252 decoding of UTF-8 source in Python CI scripts."""
import ast
from pathlib import Path

root = Path(__file__).resolve().parents[2]
quality = root / "scripts/quality"
failures = []
count = 0
for path in sorted(quality.glob("*.py")):
    code = path.read_text(encoding="utf-8")
    tree = ast.parse(code, filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "read_text":
            count += 1
            enc = next((kw.value for kw in node.keywords if kw.arg == "encoding"), None)
            if not isinstance(enc, ast.Constant) or str(enc.value).lower().replace("-", "") != "utf8":
                failures.append(f"{path.relative_to(root)}:{node.lineno}: Path.read_text missing explicit UTF-8")
# Assert actual frontend code is valid UTF-8, independent of Windows locale.
(root / "frontend/main.js").read_bytes().decode("utf-8")
if failures:
    raise SystemExit("FAIL: cross-platform UTF-8 gate\n" + "\n".join(failures))
print(f"PASS: {count} UTF-8 explicit source reads in quality scripts; frontend/main.js UTF-8 OK")
