#!/usr/bin/env python3
"""Record the actual native signing mode after installer checks have passed."""
import json
import os
from pathlib import Path
import sys

EXPECTED = {
    "linux": (".deb", ".rpm", ".AppImage"),
    "windows": (".exe", ".msi"),
    "mac-intel": (".app.zip", ".dmg"),
    "mac-arm": (".app.zip", ".dmg"),
}


def main():
    if len(sys.argv) != 4 or sys.argv[1] not in EXPECTED or sys.argv[2] not in ("true", "false"):
        raise SystemExit("Uso: record_build.py PLATFORM true|false DIRETORIO")
    platform, native, folder = sys.argv[1], sys.argv[2] == "true", Path(sys.argv[3])
    files = sorted(f for f in folder.iterdir() if f.is_file() and f.name != "build-status.json")
    actual = [f.name for f in files]
    expected = EXPECTED[platform]
    if platform == "linux":
        selected = []
        if os.environ.get("BUILD_LINUX", "true") == "true":
            selected.extend((".deb", ".rpm"))
        if os.environ.get("BUILD_APPIMAGE", "true") == "true":
            selected.append(".AppImage")
        expected = tuple(selected)
        if not expected:
            raise SystemExit("FALHA: nenhum formato Linux selecionado")
    if len(files) != len(expected) or any(sum(name.lower().endswith(ext.lower()) for name in actual) != 1 for ext in expected):
        raise SystemExit(f"Inventário {platform} incorreto: {actual}; esperados {expected}")
    if any(f.stat().st_size < 32768 for f in files):
        raise SystemExit(f"Instalador {platform} com menos de 32 KiB")
    status = {"platform": platform, "native_signed": native, "installers": actual}
    (folder / "build-status.json").write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
    print(f"Aprovado: {platform}: {actual}; assinatura nativa: {native}")


if __name__ == "__main__":
    main()
