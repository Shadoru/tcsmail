# Revisão técnica da h3 — abas múltiplas

## Decisão do projeto
Primeira aba permanente de leitura, título baseado no assunto da mensagem selecionada e identidade visual baseada em `--reader`, `--surface`, `--accent` e `--text` do tema. A seleção de outra mensagem ativa a aba de leitura. Abas de composição persistentes e independentes, com título atualizado pelo campo Assunto, conteúdo mantido no DOM e fechamento condicionado ao diálogo já existente (Cancelar/Descartar/Salvar). Reanexação de janelas externas não é bloqueada pela presença de outras abas; o mesmo rascunho não pode ser aberto simultaneamente em duas superfícies.

## Confronto técnico — revisão A, documentação e arquitetura
- W3C WAI-ARIA APG Tabs Pattern: `role=tablist`, `role=tab`, `aria-controls`, `aria-selected` e navegação por teclado. https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- HTML: IDs globais devem ser únicos. Os controles incorporados recebem IDs prefixados pela identificação de cada rascunho e seletores restritos ao respectivo compositor.
- Evitar múltiplas WebViews para múltiplas composições; uma WebView já contém editores independentes. Isso reduz dependências e duplicação de estado.

## Confronto técnico — revisão B, comportamento adversarial e comunidade
- Relatos de eventos perdidos em múltiplas janelas Tauri/Linux (https://github.com/tauri-apps/tauri/issues/11171) tornam necessária confirmação explícita antes de fechar a janela de origem. O projeto já utilizava confirmação por `requestId`, preservada.
- Quando duas edições pedem a mesma `draftId`, rejeitar a segunda reanexação impede edição concorrente sem resolução de conflitos.
- Rerenderizar o painel de leitura não pode descartar os compositores: o host é estacionado e restaurado como nó DOM, mantendo formulários e timers ativos.
- O fluxo de fechamento usa `requestClose` existente, não `close()` diretamente no botão da aba.

## Convergência técnica
As perspectivas concordam em composições isoladas por `draftId`, abas em WebView única e leitura fixa. Os relatos comunitários são advertências, não prova de que a versão instalada terá a mesma falha. Não houve revisão por especialistas humanos externos.

## Evidências locais desta entrega
- Inventário completo da árvore entregue, incluindo Rust, frontend, SQL, manifesto e scripts.
- Sintaxe verificada de arquivos `.js`/`.mjs` e `.sh`; JSON e TOML parseados; caminhos `include_str!`/`include_bytes!` verificados.
- `Cargo.lock`: `async-imap 0.12.0`, `imap-proto 0.17.0`, nenhum pacote `imap` legado.
- Comparação byte a byte confirma que Rust, Tauri, SMTP, OAuth, SQL e Cargo.lock permaneceram idênticos à h3 anterior usada como base. As alterações executáveis concentram-se no frontend e no instalador.
- Teste DOM com 11 verificações de gerenciamento de abas: PASS.
- Teste Chromium com 2 instâncias do compositor real, IDs HTML únicos, textos independentes, assuntos independentes e ações de fechar Cancelar e Salvar: PASS.
- Contratos de interface executados por `node scripts/verify-ui-contract.mjs`: PASS.

## Testes pendentes / limites
- Cargo/Rust não disponível neste ambiente; compilação Rust, testes `tcs-core` e execução Tauri GNOME são **pendentes**, não aprovados.
- A transferência entre janelas Tauri reais (eventos, readiness, anexos) exige homologação no Ubuntu; foi revisada estaticamente e testada em DOM simulado.
- Não é possível garantir ausência absoluta de regressões ou auditoria semântica exaustiva de todos os caminhos de execução apenas com testes estáticos e DOM. Nenhum teste destrutivo remoto é executado pelo instalador.
