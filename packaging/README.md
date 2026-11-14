# Pacotes para catálogos externos

Este diretório reúne apenas materiais de preparação. A publicação em cada catálogo externo depende da revisão e das regras daquele catálogo.

## Fonte de verdade

- Aplicativo: **0.8.3**
- Revisão atual dos instaladores: **r15**
- Release oficial: https://github.com/Shadoru/tcsmail/releases/tag/installers-0.8.3-r15
- Site oficial: https://thecreativesolver.com/tcsmail/
- Manifesto de hashes: [docs/RELEASES-0.8.3-R15-SHA256SUMS.txt](../docs/RELEASES-0.8.3-R15-SHA256SUMS.txt)

## WinGet

Os três arquivos em `winget/` formam a proposta para `Shadoru.TCSMail`. Eles usam o instalador NSIS x64 e o SHA-256 publicado pelo GitHub.

Antes de abrir uma submissão ao repositório winget-pkgs:

1. confirme que a release continua pública e que o hash do EXE não mudou;
2. valide o manifesto com `winget validate`;
3. instale e desinstale em uma máquina Windows limpa;
4. envie os três arquivos no caminho que a ferramenta de criação de manifests informar.

## Outros catálogos gratuitos

- **AppImageHub:** submeter somente quando a AppImage abrir em uma distribuição suportada e a ficha do aplicativo tiver ícone, arquivo desktop e URL estável.
- **AUR:** preferir um mantenedor ou uma conta dedicada; publicar um pacote `-bin` que baixe a AppImage oficial e confira seu SHA-256.
- **Flathub:** exige empacotamento Flatpak reproduzível e revisão independente; não prometer disponibilidade antes da aprovação.
- **Scoop:** requer manifest e teste de instalação/desinstalação silenciosa do EXE.
- **Homebrew Cask:** requer teste de instalação em macOS Intel e Apple Silicon e a política vigente do projeto.

Não reutilize este material em uma release diferente sem recalcular os hashes e atualizar `PackageVersion`, URLs e documentação.
