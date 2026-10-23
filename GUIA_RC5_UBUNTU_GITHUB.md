# TCS Mail 0.8.2-rc5 — entrega para compilação e homologação

**Versão:** 0.8.2-rc5 (candidata, não publicada). **Não representa homologação funcional completa.**

## O que foi incorporado em relação à RC4

1. Primeira página de sincronização desacoplada da reconciliação e regras de manutenção; paginação inicial limitada a 100 cabeçalhos; tarefas de manutenção deduplicadas por conta/pasta.
2. Histórico IMAP sob demanda (ação Atualizar); não começar a baixar automaticamente centenas de mensagens antigas ao entrar em uma pasta ainda vazia. Gmail, Microsoft e IMAP genérico utilizam esse fluxo comum.
3. Estado de sincronização explícito na lista, preservação de seleção e verificação de UID/UIDVALIDITY e commits guardados existentes.
4. Decodificação Modified UTF-7 **apenas para rótulos exibidos**, preservando os nomes originais usados nas operações IMAP e chaves locais.
5. Proteção de processos auxiliares Windows contra a abertura de console em operações com PowerShell, schtasks e anexos.
6. Regras adicionais de contraste para seletores e campos nos temas escuro/sistema, disposição responsiva da barra e controle de rolagem horizontal.
7. Versões Tauri/Cargo/AppStream/CI/MSI/RPM alinhadas à RC5; verificadores e gerenciadores atualizados.
8. `AGENTS.md` e contrato de regressão `rc5-provider-sync-contract.mjs` e `rc5_crossplatform_regression.py` integrados ao GitHub Actions.

## O que ainda exige homologação

- Sem execução de Rust/Cargo nativa neste ambiente; é imprescindível `cargo fmt`, `cargo check`, `cargo test`, `cargo clippy` no Ubuntu e nos quatro jobs GitHub.
- A opção de primeira sincronização ainda realiza `UID SEARCH ALL` no primeiro acesso à pasta quando não há checkpoint. Isso pode ser lento em pastas com volume extraordinário; otimização segura com cursor/UIDNEXT exige teste de protocolo adicional.
- Cancelamento de requisições Rust já iniciadas **não está implementado** para todas as operações. A atualização visual troca de pasta, mas uma operação IMAP antiga ainda pode ocupar a trava da conta. Não afirmar resolução completa de latência.
- CSS foi revisado estaticamente, mas WebView2/WebKitGTK/WKWebView diferem na apresentação de `select` e campos de data; realizar inspeção gráfica e navegabilidade nas quatro plataformas.
- Verificar apresentação de AppStream DEB/RPM e ícones com os instaladores reais, assinatura digital/não notarizado, console Windows, cofre Windows e Keychain macOS.
- Gmail All Mail, Exchange Online e servidor IMAP genérico de teste: aferir tempos de primeira página, falhas e alterações de pasta com 100/5.000/50.000 mensagens; medir sem coletar PII.

## Comandos (terminal Ubuntu)

1. Baixe o ZIP RC5 e deixe-o em `~/Downloads` (somente entrada do download; todos os trabalhos ficarão em `~/Projetos`).
2. Confirme que `~/Projetos/tcsmail` é o clone válido e **não tem mudanças sem commit**:

```bash
cd ~/Projetos/tcsmail
git status
git switch main
git pull --ff-only origin main
```

3. Extraia sem sobrescrever uma RC5 existente:

```bash
mkdir -p ~/Projetos
test ! -e ~/Projetos/TCS-Mail-0.8.2-rc5 || { echo 'RC5 já existe: verifique primeiro'; exit 1; }
unzip ~/Downloads/TCS_Mail_0.8.2_RC5_FONTE_E_COMPILADORES.zip -d ~/Projetos
```

4. Aplique o atualizador na sessão interativa do terminal, **não dentro de um heredoc**:

```bash
bash ~/Projetos/TCS-Mail-0.8.2-rc5/ATUALIZAR_GITHUB_LINUX.sh </dev/tty
```

O atualizador cria branch de backup e exige árvore limpa, `cargo fmt`, contratos e revisão manual. Não apaga o histórico, os arquivos pessoais, nem realiza `git push` automaticamente.

5. Antes de enviar, confira:

```bash
cd ~/Projetos/tcsmail
git status --short
git diff --check
git diff --stat
git diff -- src-tauri/src/lib.rs crates/tcs-core/src/async_mail.rs frontend/main.js frontend/styles.css
```

6. Após examinar a lista de arquivos e segredos, envie a fonte atualizada (a primeira `git add -A` deve ser feita **somente após revisar a árvore**):

```bash
git add -A
git diff --cached --check
git diff --cached --stat
git commit -m 'Prepare TCS Mail 0.8.2-rc5 for native CI'
git push origin main
```

7. GitHub no navegador: **Repositório tcsmail → Actions → TCS Mail RC5 - Homologacao e instaladores → Run workflow → main → marcar os quatro sistemas → Run workflow**.

Ou execute do Ubuntu:

```bash
cd ~/Projetos/tcsmail
gh workflow run tcsmail-homologacao.yml --ref main -f linux=true -f windows=true -f mac_intel=true -f mac_arm=true
gh run list --workflow tcsmail-homologacao.yml --limit 5
```

8. Em uma execução aprovada, faça **Actions → execução → Artifacts**. Os artefatos têm retenção de 14 dias e devem conter DEB+RPM, EXE+MSI, APP+DMG Intel, APP+DMG ARM64 (APP compactado com `ditto`).

```bash
mkdir -p ~/Projetos/TCS-Mail-0.8.2-Instaladores-GitHub/rc5
gh run download ID_DA_EXECUCAO --dir ~/Projetos/TCS-Mail-0.8.2-Instaladores-GitHub/rc5
```

9. Para compilação local Linux, menu interativo:

```bash
bash ~/Projetos/TCS-Mail-0.8.2-rc5/GERENCIADOR/central-linux-macos.sh </dev/tty
```

Menu: 1 Diagnosticar; 2 Preparar Rust/Tauri se faltar; 3 Verificar; 4 DEB; 5 RPM; 8 Instalar DEB; 9 Limpar compilação **somente após a homologação**. Não usar 10 (remove ambiente isolado). Não apagar outras versões nem diretórios `TCS-Mail-P2`/`TCS-Mail-Validacao`.

## Modelo de prompt futuro

> **TCS Mail — siga o AGENTS.md e a fonte canônica atual**. Faça implementação e auditoria adversarial independentes, confronto, dupla revalidação, testes de regressão dos defeitos históricos, verificação Windows/Linux/macOS Intel/ARM64 e Gmail/Microsoft/IMAP genérico. Não reintroduza problemas de Rustfmt, MSI/RPM, ícones, pacote, console, credenciais, UID/UIDVALIDITY ou tema. Entregue fonte completa e workflow, comandos de atualização e estado real de testes, sem declarar como executados os testes pendentes.

## G. Auditoria ampliada da RC5 e como evitar recorrência

Leia `AGENTS.md` na raiz do projeto antes de qualquer edição. Esse documento reúne as falhas já encontradas, as condições de segurança, a verificação cruzada por provedor e os gates de todos os sistemas. Os gates automatizados estão no workflow e no validador `scripts/quality/rc5_crossplatform_regression.py`. **O AGENTS.md não executa testes sozinho.**

O verificador `rc5-provider-sync-contract.mjs` assegura estaticamente a presença das regras de primeira página, diferenciação entre exibição/UID e manutenção assíncrona. São necessárias medições reais para concluir melhora no tempo de resposta.

**Não há garantia absoluta de ausência de bugs.** Sem compilar e instalar em runners e máquinas reais, a RC5 permanece candidata. Se ocorrer falha, guardar logs e o SHA do commit e abrir issue, sem retirar checks.

Para o próximo prompt, comece exatamente com:

> **TCS Mail — execute AGENTS.md da fonte canônica e o processo de duas perspectivas, confronto, dupla revalidação, análise de Gmail/Microsoft/IMAP genérico e Windows/Linux/macOS; execute todos os gates possíveis e registre pendências. Preserve dados e histórico; entregue fonte integral com comandos Ubuntu e GitHub e sem publicar.**
