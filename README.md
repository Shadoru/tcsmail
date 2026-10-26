# TCS Mail 0.8.2-rc7 — candidato de homologação

Cliente de e-mail **local-first**, multiplataforma (Rust/Tauri 2), com IMAP/SMTP,
OAuth de Google/Microsoft e IA opcional. Código-fonte sob licença MPL-2.0.

**Idioma:** português do Brasil e inglês dos EUA; configuração em Geral.

## Estado da entrega

O First Run foi implementado parcialmente, mas **não está homologado como
correspondente ao pacote externo First Run RC6 R3**: o ZIP original e os
mockups/protótipo não foram recuperados para confronto de bytes. Não há
restauração automática transacional de perfis. Consulte
[`docs/RC7_REFERENCIAS_EXTERNAS_PENDENTES.md`](docs/RC7_REFERENCIAS_EXTERNAS_PENDENTES.md).

## Compilação e verificação no Linux

A partir da raiz do repositório, com Rust 1.99, Node e bibliotecas Tauri disponíveis:

```bash
cargo fmt --all -- --check
cargo check --locked --workspace --all-targets
cargo test --locked --workspace
cargo clippy --locked --workspace --all-targets -- -D warnings
node scripts/quality/rc7-first-run-regression.mjs
python3 scripts/quality/tcsmail-package-guard.py --source
cargo tauri build --bundles deb
cargo tauri build --bundles rpm --config '{"version":"0.8.2","bundle":{"linux":{"rpm":{"release":"0.rc7.1"}}}}'
```

Instalar o DEB somente após inspecionar o pacote e preservar dados pessoais.
Para GitHub: execute `.github/workflows/tcsmail-homologacao.yml` em nova execução
marcando Linux, Windows, macOS Intel e Apple Silicon. **Build verde não é
homologação funcional**.

## Arquitetura e rastreabilidade

- App desktop: `src-tauri/`
- Backend: `crates/tcs-core/`, `crates/tcs-ai-core/`
- Interface PT-BR/EN-US e Ajuda: `frontend/`
- Gates e testes: `scripts/quality/` e `homologation/`
- Contrato de qualidade: [`AGENTS.md`](AGENTS.md)
- Workflow adicional IMAP: `.github/workflows/imap-cross-platform.yml`

Não enviar segredos, mensagens pessoais, bancos de e-mail ou caches ao repositório.

## Microsoft OAuth e IMAP (RC7)
Após aprovar a autorização no navegador, o aplicativo testa a conexão IMAP TLS com `outlook.office365.com:993`. Caso ocorra timeout TCP, verifique firewall/proxy e se o IMAP está habilitado no Outlook.com (Configurações > Email > Encaminhamento e IMAP). Autorização OAuth bem-sucedida não comprova conectividade de rede. O aplicativo não grava uma nova conta quando esse teste falha.
