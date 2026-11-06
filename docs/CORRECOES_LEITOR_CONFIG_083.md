# Correções de leitor e configurações para 0.8.3

Esta etapa começou após a gravação de `AUDITORIA_INDEPENDENTE_INTEGRIDADE.md`, que preserva as conclusões e linhas da fase de somente leitura. As correções abaixo foram autorizadas posteriormente. O diretório não foi renomeado e este trabalho não modifica versão, release, backend ou núcleo.

## Arquivos sob esta responsabilidade

- `frontend/native_window.js`.
- `frontend/views.js`.
- Novos testes `scripts/quality/reader-config-083.test.mjs` e `reader-config-083-harness.mjs`.
- Este documento e o relatório da auditoria precedente.

Alterações preexistentes nesses arquivos foram preservadas. Não atribuir a este trabalho alterações concorrentes de outros proprietários em main.js, lib.js, composer.js, Rust ou release.

## Correções implementadas

| Ponto | Comportamento corrigido | Evidência de teste |
| --- | --- | --- |
| C07 | Ambos os botões do leitor independente pedem confirmação antes de delete_permanent. Cancelar não invoca mutação. Cliques simultâneos compartilham a trava de ação. | Cancelamento dos dois botões; confirmação; cliques concorrentes; exclusão comum continua delete. |
| C10 | setMode e showHtml ficam no escopo de initReader, acessíveis aos eventos após cada renderização. | Texto, HTML sem imagens externas e HTML remoto após redesenhar. |
| P03 | Leitura começa por get_message_cached e pinta antes de hidratação, roles, permissões ou set_flags. A hidratação copia apenas corpo/anexos da mesma identidade, preservando flags locais e modo escolhido. | Promessas de IPC retidas, primeira pintura local, flags modificadas durante hidratação e resposta de UID diferente. |
| Respostas obsoletas | Sequência e identidade do host descartam HTML antigo. Texto invalida HTML pendente; fechamento invalida trabalhos posteriores; consulta antiga de permissão não desfaz opt-in explícito. | Conclusão invertida de duas preparações HTML, texto posterior, fechamento e permissão atrasada. |
| Contexto incompleto | Excluir fica indisponível enquanto a pasta especial não é identificada. Falha nessa consulta preserva a leitura e mantém exclusão bloqueada. Marcar como lida automaticamente impede inversão manual concorrente até terminar. | Roles pendentes/falhando e set_flags pendente. |
| Cancelamento durante hidratação | Se a tela redesenhar enquanto a confirmação estiver aberta, cancelar reabilita os botões corretamente. | Regressão específica com confirmação e hidratação pendentes. |
| C11 | Array contactGroups deixa de ocultar groups(). Salvar/excluir aguardam a recarga. | Persistência e recarga após edição e exclusão; membros mantidos. |
| C12 — escrita/UI | reply_surface passa a usar o mesmo mecanismo de escopo das outras opções. Conta A grava account.1.composition.reply_surface; ausência de override herda padrão geral. Mudanças de escopo descartam consultas antigas. | Duas contas, fallback global, consultas fora de ordem e botão de teste abrindo a conta selecionada. |
| Exportação | Rótulo exato: “Exportar banco local de e-mails (sem senhas)”. Explicação e sucesso informam exclusão de ai.db, anexos em arquivos e configuração completa de IA, e ausência de restauração automática. | Texto real renderizado e retorno simulado de export_data_backup. |
| C09 — citação nativa | originalHtml usa sanitizeComposerHtml(m.body_html), sem allowRemote:true nem extração de body que descarte a política do leitor. | Resposta/encaminhamento recebem o fragmento retornado pelo helper compartilhado. |

A primeira pintura pode exibir o texto local enquanto o HTML seguro é preparado. O leitor não espera a rede para mostrar assunto/corpo já disponíveis. Falha de hidratação não remove o cache visível. Os testes são funcionais com DOM e IPC sintéticos; não medem latência de uma WebView real.

## Contratos com Raman

### Leitura da preferência no main.js

O proprietário de main.js deve fazer currentComposerSurface(accountId):

1. Para conta válida, consultar `account.<id>.composition.reply_surface`.
2. Retornar override quando for exatamente `inline` ou `window`.
3. Na ausência, valor inválido ou falha de leitura do override, consultar `composition.reply_surface` global.
4. Retornar `window` apenas para esse valor; fallback final `inline`.
5. Preservar precedência de `seed.__forceWindow` e escolha de conta de seed.accountId, sem usar a conta de navegação para substituir uma resposta de outra conta.

A escrita em views.js já segue esse contrato. Na inspeção final desta etapa, main.js ainda consultava somente a chave global: **C12 completo permanece dependente desta integração do proprietário**. Não modificar main.js por este trabalho.

O pedido de envio por send_input não pôde ser executado: essa ferramenta não está exposta nesta sessão e a listagem de chats não identificou Raman. O contrato foi comunicado em comentário e fica registrado aqui para integração, sem enviar a um destinatário presumido.

### Fragmentos de composição e rede

lib.js fornece `sanitizeComposerHtml(raw)` como fragmento: imagens CID e data raster permitidas, SVG remoto/ativo e mecanismos de carregamento removidos, CSS de formatação permitido. O leitor independente importa e usa esse helper. main.js/composer.js/prévia e o teste de navegador de zero HTTP pertencem a Raman. Este trabalho não altera lib.js nem atribui a mocks a capacidade de comprovar ausência de tráfego real.

## Validação executada

Ambiente: Node.js `v22.22.2`. Nenhum servidor, conta, banco, cofre ou provedor real foi usado; nenhum aplicativo, instalação, build ou benchmark foi executado.

```
node --test scripts/quality/reader-config-083.test.mjs
```

Resultado: **18 testes passaram**, sem skips ou cancelamentos. O harness avalia os módulos de produção com DOM/IPC simulados e observa chamadas e estado; não reimplementa as funções corrigidas.

```
node --test --test-reporter=spec scripts/quality/rc8fix1-bulk-behavior.mjs scripts/quality/rc8fix1-ai-behavior.mjs
node --check frontend/native_window.js
node --check frontend/views.js
git diff --check
```

Resultado: **16 testes existentes passaram**; verificações de sintaxe e whitespace passaram. Estes resultados não homologam Rust, empacotamento ou os quatro destinos nativos.

### Demonstração de falha anterior

O mesmo teste novo foi apontado, somente para leitura, ao baseline `/home/otavio/Projetos/TCS-Mail/repo`:

```
TCS_083_SOURCE_ROOT=/home/otavio/Projetos/TCS-Mail/repo node --test --test-reporter=spec --test-name-pattern='C07|C10|C11|C12' scripts/quality/reader-config-083.test.mjs
TCS_083_SOURCE_ROOT=/home/otavio/Projetos/TCS-Mail/repo node --test --test-reporter=spec --test-name-pattern=P03 scripts/quality/reader-config-083.test.mjs
```

Falhas esperadas: **5/5** no primeiro comando e **1/1** no segundo. C07 não apresentava confirmação; C10 produziu `ReferenceError: setMode is not defined`; C11 produziu `TypeError: groups is not a function`; C12 não gravou a chave da conta; P03 chamou get_message antes de get_message_cached. Nenhum arquivo do baseline foi modificado.

## Limites e próximos gates

- Integração da leitura de C12 no main.js, pelo proprietário, ainda pendente no momento deste registro.
- Teste de navegador de zero HTTP e compatibilidade do helper compartilhado são responsabilidade coordenada de Raman; aqui o teste verifica o contrato de chamada do leitor.
- Validar os botões reais, foco/diálogos, fechamento durante rede e leitura offline em WebKitGTK, WebView2 e WKWebView.
- Confirmar exclusão nas pastas especiais de Gmail, Microsoft e IMAP genérico; o backend e suas proteções de UIDVALIDITY/UIDPLUS não foram alterados.
- Encaminhar os demais achados de fila, cofre, backup integral e cache IA aos respectivos proprietários. Não declarar C01/C03/C04/C06/C08 resolvidos por estas mudanças de interface.
