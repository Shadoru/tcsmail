# TCS Mail 0.8.2-h5 — Auditoria, decisões e homologação

## Transparência
Não participaram seis especialistas humanos externos. A avaliação foi organizada em seis frentes técnicas distintas e confrontadas (frontend, fluxo assíncrono, segurança, Linux, persistência e QA). Revisão estática não garante ausência de defeitos; o Tauri/WebKitGTK e o Rust dependem de teste na estação de destino.

### Decisões verificadas antes da implementação
1. **Frontend:** a busca de controles no compositor usava sempre `[data-tcs-id]`, embora apenas a montagem integrada renomeasse os elementos HTML. `#editor` retornava `null` em janela independente; `installRecipientField` também utilizava fallback `domQuery` inexistente. Consenso: um seletor de escopo explícito para ambos os modos, com teste que confronta a versão antiga e a nova.
2. **Assincronismo:** `reply_context` exigia login IMAP para consultar `Reply-To` antes de abrir a resposta. Falha/atraso da rede podia impedir Responder e Responder a todos. Consenso: prazo de quatro segundos; em falha, o remetente já armazenado é usado com aviso explícito para conferir destinatários. Não inventar valores de Reply-To.
3. **Segurança:** a verificação de Reply-To é preservada quando disponível; na contingência a aplicação não deve sugerir que o destinatário foi verificado. Nenhum relaxamento de OAuth, TLS ou validação de envio foi autorizado.
4. **Linux:** timer e serviços systemd de versões anteriores podiam sobreviver a reboot e bloquear instalação. Consenso: desativar apenas unidades TCS conhecidas, impedir reativação na versão Linux, desativar entradas `~/.config/autostart` TCS identificadas e parar serviços antes de Sair pelo tray. Não enviar `pkill` indiscriminado.
5. **Integridade:** preservar contas, SQLite, tokens, caches Cargo e rascunhos; bloquear substituição de binário quando Rust/tests falharem; não fechar janela original antes de transferência de draft confirmada (já previsto na h4).
6. **QA e UX:** manter múltiplas abas, primeira aba vinculada ao tema, foco de teclado e contratos h4. Criar teste específico das buscas nativas vs. abas. Indicar honestamente gates não executados.

### Arquivos alterados e razão
- `frontend/composer.js`: componente não deve buscar `[data-tcs-id]` em superfícies que usam IDs nativos; destinatários usam a mesma regra.
- `frontend/composer_lookup.js`: política central de seleção por superfície.
- `frontend/main.js` e `frontend/native_window.js`: exibir aviso de contingência de Reply-To nas respostas.
- `frontend/views.js`: impedir que a interface Linux prometa ativar serviços de fundo proibidos pelo requisito.
- `src-tauri/src/lib.rs`: limite do acesso IMAP na preparação de resposta, preservação do encadeamento de mensagens, retorno de aviso, desativação das unidades conhecidas no startup e no Sair pelo tray.
- `src-tauri/src/main.rs`: opções CLI antigas `--idle-watch` e `--background-tick` encerram imediatamente no Linux.
- `scripts/install.sh`: desativação preventiva das unidades conhecidas; proteção de autostart desktop de usuário (renomeação reversível); diagnóstico do PID ativo; integridade; Cargo gates; atualização do nome h5.
- `scripts/verify-h5-contract.mjs`: testes diretos da função de escolha de seletor e contratos de processo e resposta.

### Achados adicionais das seis frentes — não ocultar nem confundir com correções comprovadas
| Frente | Achado em outros trechos | Por que importa | Proposta futura | Estado |
|---|---|---|---|---|
| Frontend/UI | `frontend/main.js` combina reconstruções de leitura, mudanças de abas e eventos assíncronos | Navegar rapidamente pode causar re-render e perda de foco | Exercitar cliques rápidos, rolagem, seleção e leitura com testes E2E nativos | Risco; não reproduzido na h5 |
| Assincronismo | `src-tauri/src/lib.rs` faz trabalho em rede para operações interativas como consulta de Reply-To e parte da sincronização | Lentidão de rede pode bloquear ações de composição | Medir latência, preparar localmente, sinalizar status das consultas | Reply-To limitado na h5; demais fluxos pendentes |
| Segurança | `frontend/main.js` usa `sanitizeEmailHtml(...,{allowRemote:true})` em citações originais | HTML citado pode conter referências a imagens externas com implicações de privacidade | Rever política de imagens externas em texto citado antes de exibi-las | Precisa de teste de privacidade |
| Linux | GNOME ou mecanismo de restauração externo pode abrir apps independentemente do instalador | O pacote não controla configuração global do sistema | Verificar entradas globais e sessão GNOME sem alterar arquivos de outros programas | Controle externo; não garantido |
| Persistência | `frontend/composer.js` autosalva periodicamente; `tray` invoca saída do processo | Sair logo após digitar pode ocorrer antes do próximo autosalvamento | Introduzir protocolo de quit com confirmação de todos os compositores e timeout seguro | Risco de integridade a tratar antes de prometer saída sem perdas |
| QA | Parte dos testes antigos já não representa a interface atual; a revisão não roda Tauri/WebKitGTK neste ambiente | Passar em sintaxe não prova comportamento gráfico | Modernizar suíte e executar E2E Tauri + Rust em GNOME | Pendente homologação |

### Verificações efetivamente executadas antes do empacotamento
- Inventário completo e checagens de sintaxe JS, Bash, JSON, TOML; presença de 49 fontes Rust e includes.
- Dependências travadas: `async-imap 0.12.0`, `imap-proto 0.17.0`; sem `imap` legado.
- `node scripts/verify-ui-contract.mjs`.
- `node scripts/verify-h4-contract.mjs`.
- `node scripts/verify-h5-contract.mjs`, incluindo `#editor` nativo, `[data-tcs-id="editor"]` integrado e campos de destinatários.
- Onze contratos legados já conhecidos como compatíveis, sem mascarar falhas históricas de outros testes.
- Manifesto SHA-256 verificado antes de entrega.

**Não executados aqui:** cargo test/check/build, execução Tauri/WebKitGTK, OAuth real, IMAP real, abertura gráfica do editor e inspeção de unidades systemd da estação do usuário.

### Homologação inicial no Ubuntu
1. Feche o TCS Mail e instale executando `cd ~/Projetos && tar -xzf ~/Downloads/tcs-mail-0.8.2-h5.tar.gz && cd tcs-mail-0.8.2-h5 && ./scripts/install.sh`.
2. Confirme `PASS: TCS Mail 0.8.2-h5 instalado`. Se o Rust bloquear, não substitua o executável por conta própria.
3. Abra Nova mensagem no painel e em janela independente. Digite Assunto, TAB e corpo; anexe arquivo pequeno de teste.
4. Abra Responder, Responder a todos e Encaminhar em uma mensagem própria e em um e-mail recebido. A caixa de destinatários e o corpo devem aparecer. Se houver aviso de Reply-To, confira endereço antes de enviar.
5. Mantenha duas abas de escrita abertas; troque a mensagem de leitura; reanexe/desanexe sem perder conteúdo.
6. Ative a bandeja, feche a janela e use explicitamente **Sair** no tray. Após isso, rode `pgrep -a -u "$(id -u)" -x tcs-mail || true` (não deve retornar processos).
7. Rode `systemctl --user list-units --all 'tcs-mail*'` e `systemctl --user list-unit-files 'tcs-mail*'`. Se ainda houver unidade `enabled`/`active`, envie a saída completa para investigação; não apague dados.
8. Reinicie a sessão, sem abrir TCS, e confirme ausência de processos. Observe que a restauração do GNOME é um recurso do sistema operacional, não controlado pelo app.
9. Na primeira bateria não use mensagens importantes nem clique Enviar sem revisar remetente/destinatário.
