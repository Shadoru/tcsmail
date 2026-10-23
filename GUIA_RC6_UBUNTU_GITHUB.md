# TCS Mail 0.8.2-rc6 — guia de instalação/compilação Ubuntu e GitHub

**Estado:** candidata não homologada. As verificações estáticas e os testes isolados estão em `AUDITORIA_RC6_DUAS_PERSPECTIVAS.md`. Os quatro builds CI e os testes reais dos instaladores devem ser executados.

## 1. Extração (Ubuntu 24.04)

Baixe `TCS_Mail_0.8.2_RC6_FONTE_E_COMPILADORES.zip` pelo navegador. Use um terminal normal (não cole este bloco em uma sessão de Bash dentro de outro Bash):

```bash
sudo apt update
sudo apt install -y git gh unzip rsync curl python3 nodejs npm   libwebkit2gtk-4.1-dev build-essential pkg-config   libssl-dev librsvg2-dev libayatana-appindicator3-dev   libxdo-dev patchelf appstream rpm rpm2cpio cpio
mkdir -p ~/Projetos
unzip -n ~/Downloads/TCS_Mail_0.8.2_RC6_FONTE_E_COMPILADORES.zip -d ~/Projetos
```

## 2. Atualizar GitHub de forma controlada

O atualizador só aceita clone limpo na branch `main`, cria uma branch local de backup e **não executa commit/push**. Atenção: a fonte do ZIP é uma consolidação a partir da RC5 da conversa e não foi confrontada diretamente com sua branch privada mais recente. Se você alterou código após a RC5, revise cada diff e preserve o que for mais recente.

```bash
cd ~/Projetos/tcsmail
git status --short
git switch main
git pull --ff-only origin main
bash ~/Projetos/TCS-Mail-0.8.2-rc6/ATUALIZAR_GITHUB_LINUX.sh </dev/tty
# Se passar, inspecione tudo antes de enviar:
git status --short
git diff --check
git diff --stat
git diff
# Após revisão humana, confirme:
git add -A
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m 'Prepare TCS Mail 0.8.2-rc6 with folder move and portability gates'
git push origin main
```

**Observação:** se a atualização falhar após copiar a fonte, não execute `git reset --hard` sem antes verificar arquivos locais e backups. O histórico canônico permanece acessível na branch `backup/pre-rc6-...`.

## 3. Compilar localmente no Ubuntu — DEB e RPM

Use o **gerenciador incluído na entrega** com terminal interativo. Ele mantém os caches Rust em `~/Projetos/TCS-Mail-0.8.2-Ambiente` e os instaladores em `~/Projetos/TCS-Mail-0.8.2-Instaladores`:

```bash
bash ~/Projetos/TCS-Mail-0.8.2-rc6/GERENCIADOR/central-linux-macos.sh </dev/tty
```

Use as opções `1` (diagnosticar), `2` (preparar Rust/Tauri quando necessário), `3` (formatar/verificar), `4` (construir DEB), `5` (construir RPM) e `8` (instalar DEB aprovado). A opção `9` serve para limpar somente intermediários dispensáveis após homologação. Não execute a opção `10` para manter o ambiente. **Confirme no próprio gerenciador os números exibidos**, pois o menu pode ser atualizado.

Também é possível compilar diretamente, usando o ambiente Rust isolado já preparado:

```bash
export CARGO_HOME="$HOME/Projetos/TCS-Mail-0.8.2-Ambiente/cargo"
export RUSTUP_HOME="$HOME/Projetos/TCS-Mail-0.8.2-Ambiente/rustup"
export CARGO_TARGET_DIR="$HOME/Projetos/TCS-Mail-0.8.2-Ambiente/target"
export PATH="$CARGO_HOME/bin:$PATH"
cd ~/Projetos/TCS-Mail-0.8.2-rc6/TCS-Mail-fonte
cargo fmt --all -- --check
cargo check --locked --workspace --all-targets
cargo test --locked --workspace
cargo clippy --locked --workspace --all-targets -- -D warnings
node scripts/quality/rc6-folder-move.test.mjs
python3 scripts/quality/rc6-ui-and-packager.py
python3 scripts/quality/test_utf8_ci_sources.py
cargo tauri build --bundles deb
cargo tauri build --bundles rpm --config '{"version":"0.8.2","bundle":{"linux":{"rpm":{"release":"0.rc6.1"}}}}'
# Os dois instaladores ficam na árvore $CARGO_TARGET_DIR/release/bundle/.
# Verifique metadados e ícones antes de instalar:
find "$CARGO_TARGET_DIR/release/bundle" -type f \( -name '*.deb' -o -name '*.rpm' \)
```

Para a instalação local validada, prefira a opção **8 do gerenciador**: ela confere versão e pacote antes de executar a instalação. Não remova credenciais, bancos, pastas da conta ou diretórios canônicos.

## 4. Compilação GitHub — quatro destinos nativos

Após push confirmado da RC6:

```bash
cd ~/Projetos/tcsmail
gh workflow run tcsmail-homologacao.yml --ref main   -f linux=true -f windows=true -f mac_intel=true -f mac_arm=true
gh run list --workflow tcsmail-homologacao.yml --limit 5
# Para acompanhar, substitua NÚMERO_ID pelo número listado:
gh run watch NUMERO_ID
# Após sucesso, baixe os artefatos:
mkdir -p ~/Projetos/TCS-Mail-0.8.2-Instaladores-GitHub/rc6
gh run download NUMERO_ID --dir ~/Projetos/TCS-Mail-0.8.2-Instaladores-GitHub/rc6
```

O workflow gera: Linux x64 (DEB + RPM), Windows x64 (NSIS EXE + WiX MSI), macOS Intel e ARM64 (APP, DMG e ZIP de APP). Pacotes têm hashes/manifestos; nenhum release é publicado automaticamente.

## 5. Critérios de homologação RC6

- Windows/Linux/macOS: menu de destino não fica cortado; os nomes `Seguran&AOc-a` aparecem **Segurança** sem mudar os IDs IMAP usados em MOVE.
- Arrastar 1 mensagem ou várias selecionadas para uma pasta da **mesma conta** solicita confirmação e reflete o resultado; bloquear rascunhos locais, pasta não selecionável e mistura de contas.
- Menu do botão direito mostra **Excluir** entre as primeiras opções; navegação por teclado e rolagem acessíveis; exclusão definitiva exige confirmação.
- Validar múltiplas pastas, hierarquia, Unicode, Gmail `[Gmail]/All Mail`, Microsoft/Exchange Online e IMAP genérico.
- Confirmar que o compositor e os auxiliares Windows não abrem console, que não há regressão OAuth ou de sincronização, e que todas as instalações reais funcionam.

## 6. Próximos prompts

> **TCS Mail — continuar a partir do commit canônico mais recente. Aplicar `AGENTS.md`, com revisão de implementação e revisão adversarial independentes, confronto, dupla revalidação e rastreabilidade. Reproduzir os erros, preservar os testes antigos e adicionar testes negativos para os novos. Testar Gmail/Microsoft/IMAP e Windows/Linux/macOS Intel/ARM. Entregar fonte completa, compiladores, comandos de Ubuntu e GitHub, e separar explicitamente testes executados dos não executados.**
