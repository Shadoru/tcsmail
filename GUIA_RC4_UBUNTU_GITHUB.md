# TCS Mail 0.8.2-rc4 — Ubuntu → GitHub Actions → Linux/Windows/macOS

**Estado:** candidato de homologação; não publicado. **Fonte:** pacote integral RC4 construído a partir da RC3 revalidada e dos seis ajustes posteriores entregues no projeto. A fonte privada `~/Projetos/tcsmail` pode conter outros commits que não foram disponibilizados neste chat: **compare as diferenças antes do commit.**

## A. Atualizar seu repositório Ubuntu com segurança

1. Faça o download do ZIP completo `TCS_Mail_0.8.2_RC4_FONTE_E_COMPILADORES.zip` pelo ChatGPT. O navegador poderá colocá-lo em `~/Downloads`. Isso é apenas a entrada do download; os arquivos de trabalho ficarão em `~/Projetos`.
2. Abra o Terminal (Ctrl+Alt+T) e execute **um bloco por vez**:

```bash
sudo apt update
sudo apt install -y git gh rsync unzip python3
mkdir -p ~/Projetos
unzip -n ~/Downloads/TCS_Mail_0.8.2_RC4_FONTE_E_COMPILADORES.zip -d ~/Projetos
```

Verifique que existe `~/Projetos/TCS-Mail-0.8.2-rc4/TCS-Mail-fonte/Cargo.toml`.

3. **Se seu clone já existe** (o caminho usado anteriormente é `~/Projetos/tcsmail`):

```bash
cd ~/Projetos/tcsmail
git status
git switch main
git pull --ff-only origin main
```

Se `git status` acusar alterações locais, revise e salve antes de executar a atualização. Não rode `git reset --hard` nem apague suas modificações. Se não existir clone, conecte o GitHub CLI e clone seu repositório existente:

```bash
gh auth login
# Substitua USUARIO pelo login verdadeiro do GitHub:
gh repo clone USUARIO/tcsmail ~/Projetos/tcsmail
```

4. **Execute diretamente** o atualizador (não coloque esse comando dentro de um heredoc):

```bash
bash ~/Projetos/TCS-Mail-0.8.2-rc4/ATUALIZAR_GITHUB_LINUX.sh
```

Ele: valida o clone Git e o estado limpo; cria branch local `backup/pre-rc4-...`; pede confirmação; copia a fonte integral sem tocar em `.git`, dados do usuário e compiladores; desativa exclusivamente o workflow legado RC2 mantendo arquivo histórico; aplica `cargo fmt --all`; verifica formatação, versões, metadados, OAuth, compositor e JS. **Não faz commit nem push automaticamente.**

Se informar que falta `cargo`, prepare seu ambiente isolado previamente por meio da Central Linux (opção **2**):

```bash
bash ~/Projetos/TCS-Mail-0.8.2-rc4/GERENCIADOR/central-linux-macos.sh </dev/tty
```

O gerenciador abre um menu; selecione **2** para preparar Rust/Tauri e **0** para sair. Se faltar Node.js, instale uma versão LTS compatível (24 recomendado) e confirme `node --version`.

5. **Revise** o que será enviado. A branch de backup não substitui a inspeção dos arquivos, pois a fonte do GitHub atual pode conter mudanças novas:

```bash
cd ~/Projetos/tcsmail
git status --short
git diff --stat
git diff --check
git diff
```

Se a atualização substituir uma modificação sua ainda necessária, pare: recupere o arquivo correto da branch `backup/pre-rc4-...` e reaplique a diferença conscientemente. Não publique sem revisar.

6. **Registre e envie** à branch `main` somente após conferir diferenças, credenciais, dados privados e `.gitignore`:

```bash
cd ~/Projetos/tcsmail
git add -u
git add scripts/quality/rc4-composer-routing.mjs
git add GUIA_RC4_UBUNTU_GITHUB.md LICENSE
git add docs/workflows-historicos/tcs-mail-rc2-matrix.yml
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "Prepare TCS Mail 0.8.2-rc4 for native builds"
git push origin main
```

Se um arquivo listado em `git add` já estiver versionado, o Git aceitará. **Não use `git add .` de modo indiscriminado.** Verifique que o commit inclui todas as mudanças desejadas. Se o push for recusado por mudanças remotas, use `git pull --ff-only` somente se não houver divergência: reconcilie branches sem `--force`.

### O que NÃO apagar

Preserve `~/Projetos/TCS-Mail-P2`, `~/Projetos/TCS-Mail-Validacao`, diretórios de contas, mensagens, credenciais, índices, backups canônicos e o ambiente Rust. Esta atualização não utiliza `rm -rf` para a fonte canônica e não mexe no perfil do aplicativo instalado.

## B. Solicitar os 4 builds pelo navegador

1. Entre em `https://github.com/SEU-USUARIO/tcsmail` no navegador do Ubuntu.
2. Clique **Actions**, na barra superior.
3. Na barra lateral esquerda, escolha **TCS Mail RC4 - Homologacao e instaladores**.
4. Clique **Run workflow** → Branch **main**.
5. Marque as opções desejadas: **Linux x64** (DEB/RPM), **Windows x64** (EXE/MSI), **macOS Intel** (APP/DMG), **macOS Apple Silicon** (APP/DMG).
6. Clique **Run workflow** novamente.
7. Abra a execução recém-criada. Confira os jobs `selecionar`, `linux-x64`, `windows-x64`, `macos-intel`, `macos-arm64` e `resumo`.
8. Quando terminar, na página da execução, role até **Artifacts** e baixe cada ZIP. Os artefatos expiram após **14 dias**. Não há publicação automática de Release.

**Aviso:** não selecione **Re-run jobs** numa execução antiga para pegar o código RC4: o GitHub reexecuta o SHA antigo. Use **Run workflow** novo na `main` atualizada.

## C. Acionar pelo terminal Ubuntu

```bash
cd ~/Projetos/tcsmail
gh auth status
gh workflow list --all
gh workflow run tcsmail-homologacao.yml --ref main \
  -f linux=true -f windows=true -f mac_intel=true -f mac_arm=true

gh run list --workflow tcsmail-homologacao.yml --limit 5
```

Para acompanhar uma execução, substitua o identificador da lista:

```bash
gh run watch ID_DA_EXECUCAO
```

Baixe o resultado **somente depois de concluída a execução**:

```bash
mkdir -p ~/Projetos/TCS-Mail-0.8.2-Instaladores-GitHub/rc4
gh run download ID_DA_EXECUCAO --dir ~/Projetos/TCS-Mail-0.8.2-Instaladores-GitHub/rc4
find ~/Projetos/TCS-Mail-0.8.2-Instaladores-GitHub/rc4 -type f
```

Os `.app` são entregues dentro de ZIP próprio gerado com `ditto`, preservando metadados de macOS; haverá `.dmg` e o `.app.zip` em arquivo ZIP maior por plataforma. `build-info.json` informa o SHA do commit e o resumo dos formatos entregues. Confira os arquivos SHA-256 fornecidos.

## D. Compilar e instalar também no Ubuntu local

Abra a Central RC4 (o comando a seguir é independente, com entrada de teclado):

```bash
bash ~/Projetos/TCS-Mail-0.8.2-rc4/GERENCIADOR/central-linux-macos.sh </dev/tty
```

Use `1` Diagnosticar → `2` Preparar (se necessário) → `3` Verificar → `4` DEB → `5` RPM (opcional) → `8` Instalar DEB. Depois de homologar e guardar os instaladores, a opção `9` permite apagar apenas intermediários de compilação; **não use a opção 10** se deseja preservar o Rust. A Central reutiliza `~/Projetos/TCS-Mail-0.8.2-Ambiente`, reduzindo espaço extra.

**Importante:** ao compilar RPM, o empacotador usará Version `0.8.2` e Release `0.rc4.1`. O MSI usa versão interna `0.8.204`. A versão principal, ajuda, Cargo e interface permanecem `0.8.2-rc4`.

## E. Homologação em cada OS

- Windows: instalar pelo EXE e MSI, iniciar pelo menu Iniciar sem janela preta; conectar IMAP com senha; Google OAuth; fechar/reabrir; testar leitura e exclusão no cofre. O CI executa teste com chave e valor sintéticos da implementação Windows. O Credential Manager possui limites para cada item; tokens excepcionalmente grandes podem precisar de solução futura específica.
- Linux: inspecionar ícone, nome, AppStream no GNOME Software e o DEB; validar RPM numa distribuição compatível; verificar compositor integrado e janela independente.
- macOS Intel/ARM64: instalar DMG, verificar `.app`, Keychain, IMAP/OAuth e janelas. Sem assinatura/notarização Apple, macOS pode bloquear a abertura convencional.
- Em todos: dados/contas, IMAP/SMTP, OAuth, compositor, rascunhos, ajuda e aparência. **Workflow verde não é homologação funcional.**

## F. Limites objetivos da revisão

Os testes Rust, empacotadores nativos e interfaces gráficas não foram executados neste ambiente de preparação; os três sistemas deverão ser verificados pelos GitHub-hosted runners. Esta RC4 foi reconstruída a partir do ZIP RC3 revalidado e dos corretores entregues após ele, **não de uma leitura autenticada do seu repositório privado**. Revise as diferenças antes do commit. A atualização não apaga o histórico da RC3.
