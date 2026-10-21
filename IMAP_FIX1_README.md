# h5-imapfix1 — complemento de segurança da migração IMAP

Atualiza h5 sem alteração intencional dos dados de usuário. Exige UIDVALIDITY confirmado antes de consultar UIDs salvos localmente nas rotas de fonte, Reply-To, anexação EML e exportação EML/MBOX. Inclui os 29 verificadores originais recuperados e reconciliados, gate estático adicional, fixtures Rust e CI para Linux, Windows e macOS.

## Linux

Coloque o arquivo tar.gz em ~/Downloads e, após fechar o TCS Mail, use:

```bash
cd ~/Projetos && tar -xzf ~/Downloads/tcs-mail-0.8.2-h5-imapfix1.tar.gz && cd tcs-mail-0.8.2-h5-imapfix1 && ./scripts/install.sh
```

O instalador só substitui ~/.local/bin/tcs-mail após Rust test/check/build bem-sucedidos. Preserva mail.db e credenciais. Verifique SHA-256 do arquivo entregue em separado antes de instalar.

## Outros SOs

Não execute `scripts/install.sh` no Windows ou macOS: esse script é somente Linux. O código fonte Rust/Tauri tem CI nativo no `.github/workflows/imap-cross-platform.yml`. Compile pela ferramenta nativa Tauri em cada sistema e valide na prática OAuth, IMAP e operações de arquivo, após execução verde da matriz. Nenhum instalador binário Windows/macOS foi criado aqui.

## Status

Consulte `IMAP_FIX1_REVISAO_SEIS_PERSPECTIVAS.md`, `IMAP_LEGACY_RECONCILIATION.json` e o manifesto `H5IMAP_SHA256.json`. Testes Rust/macOS/Windows **pendentes** neste ambiente; não considerar homologação final sem eles.
