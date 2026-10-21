# TCS Mail 0.8.2-h4 — revisão, alterações e homologação

## Proveniência e limites

Base: fonte completa 0.8.2-h3-multitabs. Dois eixos de revisão foram aplicados separadamente ao mesmo código: **A. implementação/UX/acessibilidade** e **B. revisão adversarial de persistência, concorrência e segurança**. Os pontos divergentes foram confrontados e reavaliados antes da consolidação. Estas perspectivas são análises de código realizadas no ambiente de trabalho, **não** pareceres assinados por dois profissionais humanos contratados.

A sintaxe, os arquivos e os cenários DOM de navegador indicados abaixo foram verificados. Não há compilador Rust neste ambiente: compilação Rust/Tauri, integração WebKitGTK/GNOME, OAuth/IMAP reais e entrega/recebimento de e-mail não foram executadas. **Não existe garantia demonstrável de ausência absoluta de regressões**. O instalador obriga testes Rust do workspace e compilação antes de substituir o programa instalado.

## Confronto dos achados básicos (19)

| Item | Análise A: comportamento necessário | Análise B: risco/solução adotada |
|---|---|---|
| 1. Leitura lenta | Pintura local imediata | `get_message_cached` separado da hidratação IMAP; checagem de pedido vigente |
| 2. TAB do assunto | Pular barra de formatação e focar texto | interceptar apenas TAB normal do Assunto; manter ferramentas acessíveis |
| 3. Seleção de textos | Desativar somente nas colunas navegáveis | preservar seleção no corpo e em formulários |
| 4. Nome da caixa/remetente | Campos distintos de conta/identidade | reconexão OAuth não renomeia conta; SMTP usa identidade, não apelido |
| 5. Clique rápido em mensagens | Exibir última mensagem escolhida | `openRequestSeq`, validações após awaits e na renderização HTML |
| 6. Clique rápido em pastas | Exibir última consulta da lista | `listRequestSeq`, descarte após awaits e ao trocar de visão |
| 7. Rolagem HTML | Cabeçalho fixo, rolagem do corpo | `#bodyHost` é scroller, `iframe` seguro expande conforme conteúdo, limite conservador |
| 8. Anexos no caminho crítico | Mostrar texto antes da busca | hidratação/anexos fora da primeira pintura local; prévias CID ainda assíncronas ao HTML |
| 9. Desafixar oculto | SVG acessível na própria aba | transação salva -> aguarda janela pronta -> fecha a origem |
| 10. Transferência segura | Restaurar na janela de destino | confirmação `tcs-composer-ready`, prazo de espera, origem preservada em falha |
| 11. Título das abas | Sincronizar assunto de templates/versões | única rotina `refreshSubjectTitle` |
| 12. TAB destinatários | Continuar para próximo campo | confirma tokens válidos sem consumir TAB; trata sugestão |
| 13. Várias abas | Manter editores vivos e independentes | suspende observação da seleção e grip da imagem nas abas ocultas; não desmonta o editor |
| 14. Corridas de rascunho | Salvar, descartar, enviar sem recriar rascunho | `saveChain`/`remoteChain`, fechamento terminal e congelamento durante transferências |
| 15. Janela estreita | Manter leitor disponível | regra responsiva para as colunas e flexbox do leitor |
| 16. Duplo clique | Escolher janela ou painel | seletor local em Configurações -> Leitura; padrão de janela preservado |
| 17. Temas | Estados ativos coerentes com tema | cores semânticas `var(...)` para as áreas alteradas |
| 18. Corpo ausente | Mensagem clara com nova tentativa | indicação offline/incompleto e botão Tentar novamente |
| 19. Indicadores de operação | Não esconder o estado do usuário | estados separados: consultar cache, hidratar via rede, corpo indisponível |

**Riscos residuais:** pré-visualização de imagens incorporadas pode continuar custosa em mensagens com muitas imagens; o tempo real de respostas IMAP varia com rede e servidor. As regras CSS históricas de componentes não alterados podem conter valores cromáticos fixos; a revisão h4 concentra o ajuste nos estados de navegação, abas e leitura mencionados. O mecanismo genérico de armazenamento e todos os provedores devem ser homologados no ambiente real.

## Gates verificáveis

- `python3 scripts/h4-source-audit.py`: inventário e sintaxe de **toda a árvore distribuída** — JavaScript/MJS, Bash, JSON, TOML, includes Rust, SQL e dependências IMAP; não compila Rust.
- `node scripts/verify-ui-contract.mjs`: integridade de abas/DOM herdada da h3.
- `node scripts/verify-h4-contract.mjs`: contratos da h4.
- 11 contratos de compatibilidade herdados (os 11 que passavam na base h3-multitabs).
- Chromium/Playwright no ambiente de preparação: leitor local primeiro, busca posterior, últimas consultas vencendo, múltiplos painéis, primeira aba, tema e seleção de texto; testes isolados por componentes/DOM, **não** aplicativo Tauri completo.
- 3 contratos herdados (`editor-calendar-io-contract`, `r11-composer-regression`, `r11-fix1-dom-regression`) falham **também na base h3-multitabs**, por expectativas antigas; não contam como aprovação e não são gates da h4.
- `scripts/audit-regressions.sh` herdado referencia `scripts/quality/cross-platform-contract.py`, ausente **já na base h3**; é uma suíte histórica incompleta e não deve ser apresentada como executável.
- Installer: `cargo test --locked --workspace --lib -j 2`, `cargo check --locked --workspace -j 2`, `cargo build --release --locked -p tcs-mail --bin tcs-mail -j 2`. **Qualquer falha impede a troca do executável**.

## Homologação essencial no Ubuntu

1. Feche o aplicativo e execute `./scripts/install.sh` na árvore h4. Preserve a saída de falhas; não rode `cargo clean`.
2. Se a instalação passar, abra o TCS Mail e teste contas Gmail e IMAP existentes, reconexão OAuth, dados antigos e mensagens com/sem corpo local.
3. Clique rapidamente em duas mensagens e duas pastas: sempre deve aparecer a seleção final. Alterne textos/HTML e imagens remotas com privacidade intacta.
4. Na leitura, verifique cabeçalho fixo, rolagem no corpo, HTML longo, anexos, offline e Tentar novamente.
5. Abra três novas mensagens e duas respostas em abas; alterne; confirme independência de destinatários, conteúdo, assunto e histórico.
6. No Assunto, pressione TAB: o foco deve ir diretamente ao texto. Feche aba com Cancelar, Salvar e Descartar; teste anexos.
7. Desafixe uma aba para janela independente; volte a anexá-la enquanto outras abas continuam abertas. Em falha da janela, a aba original não pode desaparecer.
8. Renomeie caixas para `Gmail` e `TCS` em Configurações → Contas, configure ambas as identidades com o nome pessoal e confirme que De: e a lista de contas exibem campos distintos; reconecte Gmail e confirme o rótulo preservado.
9. Teste todos os temas, seleções de texto nas duas colunas, janelas estreitas e configurações de duplo clique. Envie mensagem de teste para si somente após confirmar os rascunhos.

Dados locais, tokens OAuth, banco SQLite e credenciais não são empacotados nem removidos pelo instalador. A pasta imediatamente anterior `tcs-mail-0.8.2-h3-multitabs` só é removida **depois da instalação** se todos os arquivos coincidirem com o manifesto original, não houver arquivos adicionais nem cache remanescente. Em qualquer outra condição ela é preservada. Um cache `target` anterior pode ser migrado por `mv` (sem duplicar espaço) para `~/Projetos/.tcs-mail-cargo-target`. Nenhuma outra pasta em `~/Projetos`, dado pessoal, banco, configuração ou credencial é excluída.
