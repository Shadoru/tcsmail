#!/usr/bin/env python3
"""Validate the four build buckets and stage exactly nine release distributions."""
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
STAGE = ROOT / "_release_artifacts"
OUT = ROOT / "_release_ready"
EXPECTED = {
    "tcsmail-linux": ("linux", (".deb", ".rpm", ".AppImage")),
    "tcsmail-windows": ("windows", (".exe", ".msi")),
    "tcsmail-mac-intel": ("mac-intel", (".app.zip", ".dmg")),
    "tcsmail-mac-arm": ("mac-arm", (".app.zip", ".dmg")),
}


def main():
    if OUT.exists():
        raise SystemExit("FALHA: _release_ready já existe; não vou sobrescrever.")
    all_files = []
    reports = []
    all_names = set()
    for bucket, (platform, suffixes) in EXPECTED.items():
        directory = STAGE / bucket
        status_file = directory / "build-status.json"
        if not status_file.is_file():
            raise SystemExit(f"FALHA: status do build ausente: {bucket}")
        status = json.loads(status_file.read_text(encoding="utf-8"))
        if status.get("platform") != platform or type(status.get("native_signed")) is not bool:
            raise SystemExit(f"FALHA: modo de assinatura inválido: {bucket}")
        installers = sorted(f for f in directory.iterdir() if f.is_file() and f != status_file)
        names = [f.name for f in installers]
        if len(installers) != len(suffixes) or names != sorted(status.get("installers", [])):
            raise SystemExit(f"FALHA: inventário divergente em {bucket}: {names}")
        for suffix in suffixes:
            if sum(f.name.lower().endswith(suffix.lower()) for f in installers) != 1:
                raise SystemExit(f"FALHA: formato obrigatório ausente/duplicado {suffix} em {bucket}")
        for file in installers:
            if file.is_symlink() or not file.is_file() or file.stat().st_size < 32768:
                raise SystemExit(f"FALHA: pacote inválido ou pequeno: {file}")
            if file.name in all_names:
                raise SystemExit(f"FALHA: nome repetido em plataformas: {file.name}")
            all_names.add(file.name)
        all_files.extend(installers)
        reports.append({"platform": platform, "native_signed": status["native_signed"],
                        "installers": names})

    if len(all_files) != 9:
        raise SystemExit("FALHA: são necessárias nove distribuições obrigatórias.")
    OUT.mkdir(parents=True)
    sha = []
    for file in sorted(all_files, key=lambda p: p.name):
        target = OUT / file.name
        shutil.copy2(file, target)
        with target.open("rb") as reader:
            digest = hashlib.file_digest(reader, "sha256").hexdigest()
        sha.append(f"{digest}  {target.name}")
    (OUT / "SHA256SUMS").write_text("\n".join(sha) + "\n", encoding="utf-8")
    (OUT / "SIGNING-REPORT.json").write_text(json.dumps(reports, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Aprovado: 9 distribuições, 4 plataformas, nomes exclusivos e SHA-256.")
    for report in reports:
        print(report["platform"], "native_signed=", report["native_signed"])


if __name__ == "__main__":
    main()
