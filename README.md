# TCS Mail 0.8.3

**Your inbox. Your AI. Your choice.**

Cliente de e-mail desktop multiplataforma para Linux, Windows e macOS, desenvolvido em Rust/Tauri 2. A IA é opcional e só funciona com autorização explícita; as credenciais permanecem no cofre do sistema.

[Site oficial](https://thecreativesolver.com/tcsmail/) · [Downloads](https://github.com/Shadoru/tcsmail/releases/latest) · [Código-fonte](https://github.com/Shadoru/tcsmail) · [Suporte](https://thecreativesolver.com/tcsmail/support/)

## Baixar

A release atual é **TCS Mail 0.8.3 — instaladores r15**. A versão do aplicativo é 0.8.3; r15 identifica apenas a revisão dos instaladores.

| Sistema | Pacotes |
|---|---|
| Linux x86_64 | [DEB](https://github.com/Shadoru/tcsmail/releases/download/installers-0.8.3-r15/TCS.Mail_0.8.3_amd64.deb) · [RPM](https://github.com/Shadoru/tcsmail/releases/download/installers-0.8.3-r15/TCS.Mail-0.8.3-1.x86_64.rpm) · [AppImage](https://github.com/Shadoru/tcsmail/releases/download/installers-0.8.3-r15/TCS.Mail_0.8.3_amd64.AppImage) |
| Windows x86_64 | [EXE](https://github.com/Shadoru/tcsmail/releases/download/installers-0.8.3-r15/TCS.Mail_0.8.3_x64-setup.exe) · [MSI](https://github.com/Shadoru/tcsmail/releases/download/installers-0.8.3-r15/TCS.Mail_0.8.3_x64_en-US.msi) |
| macOS Apple Silicon | [DMG](https://github.com/Shadoru/tcsmail/releases/download/installers-0.8.3-r15/TCS-Mail-0.8.3-arm.dmg) · [APP.zip](https://github.com/Shadoru/tcsmail/releases/download/installers-0.8.3-r15/TCS-Mail-0.8.3-arm.app.zip) |
| macOS Intel | [DMG](https://github.com/Shadoru/tcsmail/releases/download/installers-0.8.3-r15/TCS-Mail-0.8.3-intel.dmg) · [APP.zip](https://github.com/Shadoru/tcsmail/releases/download/installers-0.8.3-r15/TCS-Mail-0.8.3-intel.app.zip) |

Os links acima baixam diretamente os assets oficiais do GitHub. Para hashes, consulte [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md) e o [manifesto SHA-256](docs/RELEASES-0.8.3-R15-SHA256SUMS.txt).

## Compilar

Leia [GUIA_0.8.3.md](GUIA_0.8.3.md) para pré-requisitos, ferramentas isoladas, compilação Ubuntu/Windows/macOS e GitHub Actions. A fonte pode ser compilada diretamente de um ZIP, sem depender de uma RC anterior.

Com Rust 1.99.0, Tauri CLI 2.12.4, Python 3.12+, Node 22/24 e bibliotecas nativas preparados:

~~~bash
python3 scripts/build-0.8.3.py
~~~

No Windows: `py -3.12 scripts/build-0.8.3.py`.

O comando reprova se um gate, teste Rust, Clippy, compilação ou inspeção de pacote falhar. Pacotes aprovados vão para delivery/; logs para .build-v083/. O comando nunca instala, faz push, publica ou limpa seus arquivos.

## Privacidade e segurança

O TCS Mail não exige que o usuário use IA. Consulte [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md) e [docs/CREDITS.md](docs/CREDITS.md).

Os workflows de compilação e publicação são manuais. A inspeção de instaladores não substitui teste gráfico nativo e teste com os provedores; consulte a matriz de evidências antes de considerar uma plataforma homologada.

## Projeto

- [Migração, verificações e pendências](docs/VERSAO_083.md)
- [Auditoria consolidada](AUDITORIA_0.8.3.md)
- [Validação](VALIDACAO_0.8.3.md)
- [Licença MPL 2.0](LICENSE)
