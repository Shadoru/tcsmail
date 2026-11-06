#!/usr/bin/env python3
"""Run std-only encoding regressions and verify the native commands use them."""
import os
from pathlib import Path
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
native = (root / "src-tauri/src/lib.rs").read_text(encoding="utf-8")
helper = root / "src-tauri/src/text_encoding.rs"

assert "mod text_encoding;" in native
fonts = native.split("async fn list_system_fonts()", 1)[1].split("async fn list_messages(", 1)[0]
preview = native.split("async fn preview_received_attachment(", 1)[1].split("async fn remove_attachment(", 1)[0]
mbox = re.search(r"fn\s+split_mbox\(raw:\s*&\[u8\]\)\s*->\s*Vec<Vec<u8>>\s*\{(.*?)\n\}", native, re.S)
assert mbox, "MBOX import entrypoint missing"
assert re.search(r"text_encoding::split_mbox\(raw\)", mbox.group(1))
assert "text_encoding::WINDOWS_FONT_SCRIPT" in fonts
assert '"-NoProfile", "-NonInteractive", "-Command", script' in fonts
assert ".creation_flags(CREATE_NO_WINDOW)" in fonts
assert fonts.count("text_encoding::decode_font_output") == 3, "All font subprocesses must decode strictly"
assert re.search(r"text_encoding::decode_preview_text\(&bytes\)\s*\?", preview)
for name, body in [("fonts", fonts), ("attachment preview", preview), ("MBOX", mbox.group(1))]:
    assert "from_utf8_lossy" not in body, f"Lossy decoding reintroduced in {name}"

with tempfile.TemporaryDirectory(prefix="tcs-text-encoding-") as folder:
    binary = Path(folder) / ("encoding-tests.exe" if os.name == "nt" else "encoding-tests")
    subprocess.run([
        os.environ.get("RUSTC", "rustc"), "--edition=2021", "--test", str(helper), "-o", str(binary)
    ], check=True)
    subprocess.run([str(binary)], check=True)
print("PASS: byte-preserving MBOX, strict UTF-8/BOM UTF-16 preview, UTF-8 font subprocess boundaries")
