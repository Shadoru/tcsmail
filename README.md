> **TCS Mail 0.8.2-rc5** — candidato de homologação; não publicado.
> Fonte completa + GitHub Actions em `.github/workflows/tcsmail-homologacao.yml`.
> Para instruções de atualização e build, consulte o `GUIA_RC5_UBUNTU_GITHUB.md` no pacote de entrega.

# TCS Mail 0.8.2-rc2 — candidata de validação

Veja `../MANUAIS/RC2_COMECE_AQUI.md` no ZIP. Documentos h3/h4/h5 a seguir são históricos.

# TCS Mail 0.8.2-h5

Versão h5: correção do compositor nativo e integrado, respostas com fallback seguro de Reply-To e política Linux de não iniciar serviços automaticamente. Leia `H5_AUDITORIA_E_HOMOLOGACAO.md` antes de homologar. As notas r14 abaixo são históricas.

TCS Mail is a lightweight desktop email client built with **Rust + Tauri 2**, supporting IMAP/SMTP, Google OAuth 2.0 + XOAUTH2, multiple accounts, drafts, sending queue, rules, calendar, contacts, optional local/provider AI and RAG, and Linux/Windows/macOS packaging.

**Languages / Idiomas:** the interface starts with the operating-system language and currently supports **Português (Brasil)** and **English (United States)**. Override it under **Settings/Configurações → General/Geral → App language/Idioma do aplicativo**.

## Documentation / Documentação

- Português: [`docs/USER_GUIDE.pt-BR.md`](docs/USER_GUIDE.pt-BR.md) · [`docs/HELP.pt-BR.md`](docs/HELP.pt-BR.md)
- English: [`docs/USER_GUIDE.en-US.md`](docs/USER_GUIDE.en-US.md) · [`docs/HELP.en-US.md`](docs/HELP.en-US.md)
- Documentation index / Índice: [`docs/README.md`](docs/README.md)
- Google OAuth: [`docs/GOOGLE_OAUTH.md`](docs/GOOGLE_OAUTH.md)
- Cross-platform / Multiplataforma: [`docs/CROSS_PLATFORM.md`](docs/CROSS_PLATFORM.md)

## License / Licença

TCS Mail source code in this distribution is made available under the **Mozilla Public License 2.0 (MPL-2.0)**. See [`LICENSE`](LICENSE), [`NOTICE`](NOTICE), and the bilingual licensing notes in `docs/`.

## Linux installation / Instalação Linux

```bash
./scripts/install.sh
```

The installer validates the candidate, runs Rust gates (`fmt`, `check`, `test`, `clippy`, release build), performs a smoke test, and preserves existing TCS Mail 0.8 data. / O instalador valida o candidato, executa os gates Rust, realiza smoke test e preserva os dados existentes do TCS Mail 0.8.

## Windows and macOS

- Windows: `scripts\\build-windows.ps1` → NSIS installer.
- macOS: `./scripts/build-macos.sh` → `.app` + `.dmg` (macOS 12+).
- Linux: `./scripts/install.sh`.

Native builds must be produced/tested on the target OS or the project CI matrix.

## Validation / Validação

```bash
./scripts/validate-0.8.sh
./scripts/rust-gates.sh   # when Rust is available / quando Rust estiver disponível
```

Google authorization opens the system browser. Gmail transport remains IMAP/SMTP using SASL XOAUTH2; other providers preserve conventional IMAP/SMTP authentication.

## 0.8.1-r10 highlights / Destaques

- Composition settings persist globally and can be overridden per account. / Preferências de composição persistem globalmente e podem ser substituídas por conta.
- Integrated Accounts → Identities → Signatures → Templates, including Reply-To, separate new/reply signatures and optional automatic templates.
- Replies preserve HTML when the source message is HTML; plain-text composition sends a real `text/plain` MIME body.
- Composer AI is optional, preview-first, and preserves signatures and quoted original content.
- Message list/search behavior was hardened for narrow widths and selected controls keep readable contrast across all bundled themes.
- See [`docs/MATURITY_0.8.1-r10.md`](docs/MATURITY_0.8.1-r10.md) for the consolidated maturity/limitations matrix.


## 0.8.2-r14-fix3 — Compositor e imagens
- Área "Em trabalho" integrada à barra lateral, sem sobrepor o painel de leitura ou as ações Enviar/Descartar.
- Reanexação da janela ao painel só confirmada após a restauração do editor; o painel ocupado recusa a transferência.
- Ícone de reanexar visível na janela independente.
- Redimensionamento de imagens incorporadas arrastando o canto inferior direito (além dos tamanhos predefinidos).
- Reconciliação de anexos CID órfãos durante salvamento, transferência e envio; anexos normais não são afetados.
- Regressões do ciclo de vida de imagem incorporada cobertas em `scripts/quality/r11-composer-regression.mjs`.


## r12 — Editor (incremental)

- Ação "Mover para o painel de leitura" no rodapé de janela de composição independente, antes de Descartar e Enviar.
- Localizar/substituir texto, prévia estática sanitizada, contagem de palavras, editor expandido, alinhamento e texto alternativo em imagens, links com esquemas validados.
- A tela "Dados da IA" é uma prévia local informativa do texto disponível, não uma interceptação das requisições ao provedor.
- Arraste de arquivos, colagem de imagens, desfazer transacional persistente e restauração após travamento não foram adicionados nesta revisão.
- Validação de build Rust/GUI continua necessária na estação.
