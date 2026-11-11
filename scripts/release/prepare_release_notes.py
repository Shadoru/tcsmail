#!/usr/bin/env python3
"""Describe genuine, verified native signing status without marketing ambiguity."""
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
directory = ROOT / "_release_ready"
status = json.loads((directory / "SIGNING-REPORT.json").read_text(encoding="utf-8"))
labels = {
    "linux": "Linux DEB/RPM/AppImage",
    "windows": "Windows EXE/MSI (Authenticode)",
    "mac-intel": "macOS Intel APP.zip/DMG (Developer ID + notarização)",
    "mac-arm": "macOS Apple Silicon APP.zip/DMG (Developer ID + notarização)",
}
tag = os.environ.get('RELEASE_TAG','')
if not re.fullmatch(r'installers-0\.8\.3-r[1-9][0-9]*', tag):
    raise SystemExit('FALHA: tag inválida para notas da revisão dos instaladores')
rows = []
for item in status:
    platform = item["platform"]
    if platform == "linux":
        text = "AppImage: GPG incorporado; todos os arquivos: assinatura GPG destacada"
    elif item["native_signed"]:
        text = "Assinatura nativa verificada; assinatura GPG destacada adicional"
    else:
        text = ("Assinatura macOS ad-hoc; SEM Developer ID ou notarização" if platform.startswith("mac-")
                else "SEM Authenticode; somente assinatura GPG destacada")
    rows.append(f"- {labels[platform]}: {text}.")

notes = "\n".join([
    "TCS Mail 0.8.3 — instaladores (rascunho para homologação)",
    "Versão do aplicativo: 0.8.3 (sem rc e sem alteração).",
    "Revisão dos instaladores: " + tag + ".",
    "",
    "Foram geradas 9 distribuições para 4 alvos de build (incluindo APP.zip macOS).",
    "Estado REAL das assinaturas:",
    *rows,
    "",
    "Verifique cada arquivo com sua assinatura .asc e a chave pública fornecida.",
    "Exemplo: gpg --verify ARQUIVO.asc ARQUIVO",
    "Para os hashes: sha256sum -c SHA256SUMS",
    "A assinatura GPG de AppImage não é verificada automaticamente na execução.",
    "A assinatura GPG não substitui Authenticode ou notarização Apple.",
    "Os pacotes não foram homologados em execução gráfica, IMAP ou OAuth real.",
    "",])
(directory / "LEIA_ANTES.txt").write_text(notes, encoding="utf-8")
print(notes)
