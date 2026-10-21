# TCS Mail 0.8.2-h3 — Correção de abas e carregamento

## Causas confirmadas

**Composição vazia**: `renderReader()` introduzia um `#inlineComposerHost` dentro de `#reader`, enquanto `ensureReaderTabs()` selecionava a primeira ocorrência dentro do painel. Quando a aba Composição era ativada, `#reader` era ocultado — com o compositor dentro dele. O teste de DOM usando as funções originais da h3 reproduziu a largura visível zero; na versão corrigida o editor fica diretamente no painel com largura visível positiva e mantém o texto ao alternar abas.

**Texto de espera rodando**: `startup-guard.js` utilizava `querySelector('span:last-child')`, que devolvia primeiro o `span.startupSpinner` aninhado, não o texto direto do `main`. Após 4,5 segundos a própria mensagem era colocada dentro do elemento animado. O seletor `:scope > span` corrige as duas rotas de mensagem/internacionalização.

## Controles

- Composer integrado inserido exclusivamente no host direto da terceira coluna; nenhum host duplicado no HTML das mensagens.
- Marcador de carregamento temporário durante bootstrap assíncrono do editor, removido depois de montado.
- Rascunho em aba preservado ao navegar; sem modo foco.
- Teste estrutural `node scripts/verify-ui-contract.mjs` executado pelo instalador antes da compilação.
- Teste de comportamento DOM (Chromium headless): reproduzido antes; editor visível e persistente depois; texto do spinner separado antes/depois — **aprovado neste ambiente simulado**.
- Sintaxe JS e Bash e integridade do manifesto: verificadas neste ambiente.
- **Não** foram executados Rust/Tauri/WebKitGTK nem testes com contas reais neste ambiente; continuam obrigatórios na estação.

Fontes de projeto: `frontend/main.js`, `frontend/composer.js`, `frontend/startup-guard.js`, `frontend/index.html`, `frontend/styles.css`.
