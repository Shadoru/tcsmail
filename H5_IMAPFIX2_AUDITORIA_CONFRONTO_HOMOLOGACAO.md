# TCS Mail 0.8.2-h5-imapfix2 — auditoria, confronto e homologação

**Base**: 0.8.2-h5-imapfix1, `async-imap =0.12.0` e `imap-proto 0.17.0`.
**Escopo**: Gmail Enviados, sincronização e paginação, associação SPECIAL-USE, leitura de lista, tema, alertas `unsafe_pinned` e regressão multidispositivo.
**Dados pessoais**: nunca incluídos no pacote; nenhum banco de dados de usuário foi aberto, lido ou modificado nesta revisão.

## Explicação simples

O TCS poderia procurar **Enviados** pela pasta errada, sincronizar somente uma página de mensagens por visita, e até converter a solicitação de **Enviados unificada** para **Caixa de Entrada**. A associação de pastas era carregada em paralelo à descoberta e podia ficar desatualizada. Corrigimos isso sem avançar UIDs artificialmente. Agora o TCS descobre a pasta correta, mantém o nome real por conta, percorre páginas recentes e antigas enquanto a pasta estiver aberta, e não impede contas válidas quando outra falha. Se o histórico for maior que o limite por sessão, a sincronização recomeça do checkpoint persistido em outra visita ou ao clicar em Sincronizar.

O visual das pastas ativas tinha um fundo claro derivado da área de conteúdo sobre uma barra lateral que podia usar letras brancas; a regra final agora combina **cores da própria barra lateral**. O tema de sistema escuro também recebe as cores de texto adequadas. Em Enviados, a lista exibe **Para: destinatário**, em vez de repetir o nome de quem enviou.

Os quatro avisos do Rust provêm da dependência vendorizada `async-imap 0.12.0`, não do TCS diretamente. Substituímos quatro projeções `unsafe_pinned!` por métodos `Pin::new()` seguros em tipos que implementam `Unpin`. O pacote agora contém um **patch local documentado** dessa dependência — não afirmar que é cópia byte-a-byte da versão publicada.

## Seis frentes virtuais de revisão — não seis pessoas ou agentes independentes

1. **Protocolo/documentação oficial**: o RFC 6154 e a documentação de extensões IMAP do Google favorecem `\\Sent` sobre nomes literais ou traduzidos. A conversão de `__SENT` para INBOX estava incorreta. Solução: `FolderInfo.special_use`, associação persistida e sincronização por pasta real.
2. **Experiência de usuários avançados, incluindo Reddit**: relatos de Thunderbird mostram duas causas distintas: pasta especial incorreta e latência/bloqueio do servidor Gmail. São subsídios para testes, **não prova de causa no computador do usuário**. Solução: não assumir que lentidão externa desaparece; expor erros de sincronização e permitir retomada.
3. **Rust, pinning e manutenção de dependências**: o projeto vendorizou o macro `unsafe_pinned!` depreciado. A análise verificou as implementações `Unpin` e escolheu projeção segura com `Pin::new`, sem acrescentar novas dependências ou modificar `Cargo.lock`. A compilação Rust real é um gate pendente.
4. **SQLite, integridade e concorrência**: nunca pular UID em razão de um lote parcial, manter `UIDVALIDITY`, transações e serialização por conta. A sincronização por várias páginas reaproveita `sync_recent` e `sync_backfill` existentes, sem reset manual ou reescrita de checkpoint.
5. **Usabilidade/acessibilidade/tema**: aplicar cores derivadas de `--side` e `--side-text` na navegação, não de `--surface`. Estimativa matemática do contraste das 7 variantes >= 7:1. A prova no WebKitGTK continua pendente.
6. **Portabilidade e distribuição**: mudanças de UI HTML/CSS/JS, Rust puro e biblioteca Tokio comuns aos três sistemas; o script de instalação atua apenas em Linux. O workflow de CI roda gates Python e JavaScript e, quando disparado, `cargo check/test/build` em Linux, Windows e macOS. Não executamos essa matriz aqui.

**Confronto 1 (antes de alterar)**: detectar os efeitos da associação persistida, do fallback por nome, da sincronização apenas da INBOX, da atualização interrompida após um lote e dos contrastes da barra lateral. Recusar atalhos que desativem SSL, permitam saltar UID ou façam falsos negativos de sincronização.

**Confronto 2 (adversarial, depois de alterar)**: encontramos e tratamos as situações de conta especial ausente numa visão unificada, clique manual durante sincronização em andamento, dados antigos de pasta lidos em paralelo à atualização, tema `system` escuro sem `--side-text` apropriado e visualização de Enviados mostrando o próprio remetente.

**Consenso técnico condicionado**: é mais seguro corrigir nomes/associações de pastas e continuar a paginação existente do que reescrever o IMAP ou resetar o banco. Os testes de fonte sustentam a decisão, mas **não há garantia absoluta de ausência de regressões** até passar pelos gates Rust, CI e homologação IMAP real.

## Arquivos afetados e por quê

- `crates/tcs-core/src/async_mail.rs`: função pura `special_folders_from_tree` + 2 testes Rust com `[Gmail]/Sent Mail` e pasta não selecionável.
- `src-tauri/src/lib.rs`: persiste as associações de SPECIAL-USE do snapshot real do servidor **antes** de devolver controle ao frontend.
- `crates/tcs-core/src/dto.rs` e `store.rs`: inclui `to_text` no retorno da lista, sem mudar esquema SQL e sem criar migração de banco.
- `frontend/main.js`: leitura sequencial de roles, sincronização correta de pastas reais, múltiplas páginas com limite e retomada, erros explícitos e identificação de destinatários na lista Enviados.
- `frontend/styles.css`: cor ativa semanticamente vinculada ao tema e correção do modo sistema escuro.
- `vendor/async-imap-0.12.0/src/client.rs`, `extensions/idle.rs` e `lib.rs`: patch local da projeção de pinos; manter Cargo.lock e versão declarada.
- `scripts/install.sh`: mais mecanismos legados TCS 0.7/0.8 desativados, novos gates antes de instalar e cache compartilhado preservado; remoção somente da fonte anterior **idêntica ao seu manifesto** após sucesso e sem target.
- `.github/workflows/imap-cross-platform.yml`: novos gates multiplataforma e gatilhos frontend.
- `scripts/quality/h5-imapfix2-sync-contract.mjs`, `h5-imapfix2-theme-contrast.py`, `h5-imapfix2-portable-gates.py`: testes adicionais.

## Resultados e bloqueios de homologação

Executado neste ambiente de desenvolvimento:
- 29/29 scripts históricos de migração: PASS, sem compilar Rust.
- 11 contratos legados compatíveis: PASS (execução final registrada separadamente).
- Contratos h4/h5: PASS.
- Novo teste comportamental Node de associação de duas contas, ausência de mapeamento silencioso para INBOX, duas páginas recentes + duas históricas, atualização da lista: PASS.
- Contraste matemático de 7 paletas: PASS, razões estimadas >= 7:1.
- Sintaxe JavaScript, Bash, JSON, TOML e includes SQL: PASS.
- Integridade SHA256 de fonte e inspeção do tar extraído: PASS ao empacotar.

**Não executado aqui**: Rust `cargo fmt/check/test/build`, abertura de janela real WebKitGTK, conexão à conta Google do usuário, verificação real de todas as mensagens Gmail, execução CI Linux/Windows/macOS. Não confundir existência do workflow com resultados da matriz.

## Homologação simples no computador do usuário

1. Baixar pacote completo em `~/Downloads` e confirmar SHA256 publicado; executar o instalador na pasta exclusiva sob `~/Projetos`.
2. Se algum teste Rust falhar, **a instalação para e a versão anterior permanece intacta**. Enviar o erro, especialmente em `async_mail.rs`, `src-tauri/src/lib.rs` e na projeção `Pin`.
3. Abrir a conta Gmail; clicar Enviados; observar se a lista mostra `Para: ...` e as mensagens de 2026. A primeira sincronização pode ser longa, mas o conteúdo recente deve chegar sem precisar refazer a conta.
4. Clicar em Sincronizar **na pasta Enviados**; verificar que essa pasta, e não INBOX, é atualizada. Deixar a pasta aberta para recuperar histórico, voltar depois se continuar indicando parcial.
5. Usar as opções claro, escuro, foco, oceano, grafite e sistema claro/escuro. Verificar que nomes e ícones da conta/pasta selecionada continuam visíveis.
6. Verificar que Inbox, Rascunhos, Spam, Lixeira, mover, excluir e responder continuam corretos; testar segunda conta real.
7. Após o aplicativo estar estável, disparar `.github/workflows/imap-cross-platform.yml` num repositório privado sem dados/credenciais; obter PASS nos três sistemas. A compilação local do Ubuntu não substitui essa etapa.

**Servidores Gmail**: se mensagens continuam ausentes mesmo quando o TCS informa sincronização completa, conferir no Gmail Web **Configurações -> Ver todas as configurações -> Marcadores** se Enviados está exposto por IMAP; o nome localizado varia. Não redefinir, apagar ou copiar mensagens por tentativa.

## Referências técnicas externas

- RFC 6154: https://www.rfc-editor.org/rfc/rfc6154.html
- RFC 9051: https://www.rfc-editor.org/rfc/rfc9051.html
- Extensões IMAP Gmail: https://developers.google.com/workspace/gmail/imap/imap-extensions
- Recomendações oficiais de clientes Gmail: https://support.google.com/mail/answer/78892?hl=pt-BR
- Rust Async Book (pinning): https://rust-lang.github.io/async-book/part-reference/pinning.html
- Tauri GitHub Actions: https://v2.tauri.app/distribute/pipelines/github/
- Thunderbird, relatos de pasta especial: https://www.reddit.com/r/Thunderbird/comments/l2drz6/
- Thunderbird, latência IMAP Gmail: https://www.reddit.com/r/Thunderbird/comments/1td6fuv/imap_gmail_slow/
