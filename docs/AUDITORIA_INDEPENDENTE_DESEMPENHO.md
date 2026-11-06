# Auditoria independente de desempenho — fonte rc8-fix1, preparação da 0.8.3

## Escopo, método e identificação

Auditoria estática independente concluída em 2026-11-02, com reconferência de hashes em 2026-11-03 01:47 UTC. A investigação de inicialização, Rust/Tokio, SQLite, sincronização e frontend precedeu a leitura das conclusões externas. Depois foi lido integralmente o documento externo de 211 linhas. Este relatório registra essa fase: nenhuma correção, compilação, instalação, benchmark ou teste funcional foi executado durante a auditoria. A gravação deste arquivo foi autorizada posteriormente como artefato documental.

Árvore examinada: `/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1`. Fonte canônica comparada, somente para leitura: `/home/otavio/Projetos/TCS-Mail/repo`. Ambas apontavam para `228ad458e61bf590e5452ed869565a69815b1a45`, mas tinham alterações locais; HEAD sozinho não identifica os bytes do fix1. A próxima entrega foi denominada **0.8.3** pelo usuário; os bytes e as linhas deste relatório ainda identificam o snapshot rc8-fix1. Não se deve aplicar estas linhas automaticamente a revisões posteriores.

Foram lidos integralmente os AGENTS.md aplicáveis. O usuário limitou esta fase à inspeção estática; os gates de execução do repositório permanecem pendentes e não foram substituídos por aprovação estática. Há um auditor automatizado nesta revisão, não dois especialistas humanos. First Run, callbacks OAuth e descoberta detalhada de pastas especiais pertencem à revisão principal; os encadeamentos relevantes ao desempenho foram inspecionados aqui, sem homologar aqueles fluxos integralmente.

Documento confrontado: `/home/otavio/Downloads/TCS Mail 0.8.2-RC8 — Auditoria estática independente.md`, SHA-256 `2fb92199e1e89b12bc6f646ded255111ff4d8ed42fd89228c0b23324fe058800`.

Hashes do snapshot central, reconferidos antes da gravação:

| Arquivo na árvore examinada | SHA-256 |
| --- | --- |
| src-tauri/src/lib.rs | 90b9d42ac9c69199745c1ce0991664c55caa3e16077e2a92cdf211b037e3907f |
| crates/tcs-core/src/store.rs | f55c0e2b83e7ea680b0d900e334de901b504f5bf5df5910222ca548ae334132d |
| crates/tcs-core/src/db.rs | 3d31588b4e5cb9dcb4c9bac8fe2bd1ba293c04ca05d69b20b3e624b41f58f928 |
| crates/tcs-ai-core/src/rag.rs | 3452a3887381e02c9dd2ebbd8ae9b90f4ebd4b9dd6878363437f311d66669296 |
| frontend/main.js | c31185354e6aaa672fc74cec55fd8bac8c0fb00e888c12eeb3f44b0f57e5f83d |
| frontend/composer.js | 38625f7df378bef0b1084fdb7433486034837e76e48a3d5aff80f0acd3f04311 |
| frontend/native_window.js | 3131a364f95db364429fc25c7fdf810d4a377227035bef96323fb19ed30bfd8d |
| frontend/lib.js | d90faafd4017249781dafc9ebaa43d2b6069b42310b9c386f851870d8a25b71b |
| crates/tcs-core/data/schema_v9.sql | f8b038f1242dc4f2b3151ce8daf5aa7780b9c73f6cc9129320b6d7cfa6b959b8 |
| crates/tcs-core/data/schema_v10.sql | 8913a781b7214964c76980c2999b64cca090ad97c074185e984ecbc03df150b5 |

## Priorização e limites das conclusões

P01–P15 correspondem aos P-01–P-15 do documento externo. P1 significa investigação/correção prioritária pelo alcance ou bloqueio de interação; P2 significa trabalho condicionado a perfil ou volume. Essa classificação não estima porcentagens de melhoria. O mecanismo de custo pode estar demonstrado sem que sua importância relativa tenha sido medida.

Ordem sugerida: P01/P02 e P04/P05; P07/P06; P03/P08/P09; P10/P11/P12/P13. P14/P15 têm prioridade própria quando RAG estiver em uso. Falhas de integridade e privacidade não devem aguardar otimizações. Nenhum resultado de latência, memória, CPU ou ganho percentual foi observado nesta fase.

## P01 — Inicialização antes da janela e da instância única

- **Prioridade/status:** P1; encadeamento confirmado; custo e frequência não medidos. Corresponde também a A-07.
- **Evidência:** [lib.rs:6913](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/src-tauri/src/lib.rs:6913), linhas 6913–6944: `state_for(...).expect(...)` antecede Builder e plugin de instância única. Linhas 528–557: abre mail.db e ai.db, migra configurações e agente legado e quarentena operações. [db.rs:53](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/crates/tcs-core/src/db.rs:53), linhas 53–150: WAL, backup condicionado à versão, schemas e migração FTS anterior à v5.
- **Raiz:** manutenção síncrona integra o caminho anterior à criação da interface. Falha na preparação de IA pode derrubar a abertura mesmo com IA desativada. Uma segunda invocação chega à preparação antes da verificação de instância única.
- **Correção concreta proposta:** registrar instância única antes da manutenção; apresentar janela com estado explícito de preparação; construir o estado em worker e publicar sucesso/erro de modo aguardável; separar inicialização opcional de IA. Consultas de e-mail só podem começar após a migração obrigatória do respectivo schema.
- **Teste posterior:** partida fria/quente, segundo processo, banco antigo grande, cofre indisponível e ai.db inválido; registrar processo→janela→lista interativa, sem confundir esses marcos.
- **Risco:** ordem de inicialização, corrida entre migração e consultas, exibição acionável de falhas e recuperação sem apagar dados. A importação legada já consulta `ai_migration_log` em `crates/tcs-ai-core/src/migration.rs:24–59`; não reimporta necessariamente todo o conteúdo a cada partida.

## P02 — LIST remoto antes da lista local

- **Prioridade/status:** P1; dependência remota confirmada no modo com conta individual; demora não medida.
- **Evidência:** [main.js:205](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/frontend/main.js:205) aguarda `refreshFolders()` antes de `renderShell()` e da listagem. Linhas 274–281: `list_folder_tree` seguido de `folder_roles`. [lib.rs:1681](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/src-tauri/src/lib.rs:1681), linhas 1681–1716: credencial, coordenação por conta, LOGIN/LIST/LOGOUT e persistência dos papéis antes da resposta.
- **Raiz:** descoberta de navegação remota bloqueia conteúdo já disponível em SQLite. A guarda apenas por conta não distingue necessariamente duas épocas de navegação da mesma conta.
- **Correção concreta proposta:** renderizar shell e iniciar listagem local antes do LIST; atualizar árvore depois com token de época/conta, sem sobrescrever uma navegação nova. Continuar aguardando o retorno de LIST antes de ler os papéis persistidos; não paralelizar as duas chamadas.
- **Teste posterior:** IPC remoto pendente/offline com bootstrap e listagem locais disponíveis; alternar A→B→A e resolver promessas fora de ordem; verificar primeira lista local, preservação de seleção/leitor/compositor e LIST→roles.
- **Risco:** respostas antigas, reconstrução de shell que perde estado, nomes de pastas especiais provisórios e erros silenciosos. Modo unificado sem conta individual não percorre esse mesmo bloqueio em `refreshFolders()`.

## P03 — Leitor separado aguarda hidratação e marcação remota

- **Prioridade/status:** P1; awaits anteriores à pintura confirmados.
- **Evidência:** [native_window.js:80](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/frontend/native_window.js:80), linhas 80–89: mensagem, flags, permissões e roles antecedem render. [lib.rs:1156](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/src-tauri/src/lib.rs:1156), linhas 1156–1180: há rota cached; a rota usada pelo leitor separado pode hidratar pela rede. O leitor integrado usa cache e hidratação posterior em `frontend/main.js:620–637`.
- **Raiz:** etapas de enriquecimento e mutação remota são pré-condições da primeira apresentação.
- **Correção concreta proposta:** pintar o cache antes de hidratação, permissões adicionais e marcação; aplicar resultado somente se a mensagem/época continuar atual; compartilhar a política do leitor integrado.
- **Teste posterior:** abrir mensagem com/sem corpo, falha de autenticação e flags pendentes; verificar conteúdo local visível e descarte de hidratação obsoleta.
- **Risco:** marcação como lida fora da preferência do usuário, conteúdo trocado por resposta antiga e política de imagens remotas. Não foi alterado nesta auditoria.

## P04 — OFFSET, COUNT repetido e ausência de índice dirigido à ordem

- **Prioridade/status:** P1; SQL e seleção da rota confirmados; plano de execução não observado. Corresponde a A-05.
- **Evidência:** [main.js:485](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/frontend/main.js:485) sempre envia `tcs-sort:`. [store.rs:373](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/crates/tcs-core/src/store.rs:373), linhas 373–398, 537–591: ativa custom_sort/OFFSET, retorna cursor `o:` e executa COUNT por página. [schema_v9.sql:26](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/crates/tcs-core/data/schema_v9.sql:26), linhas 26–54: há PK e UNIQUE(account_id,folder,uid), além de FTS.
- **Raiz:** o cursor keyset disponível no backend não é a rota normal do frontend; o UNIQUE ajuda a restringir conta/pasta, mas não fornece a ordem de data/id. Busca abrangente em SQL próprio, migrations Rust, SQL embutido e scripts não encontrou índice adicional de ordenação em messages.
- **Correção concreta proposta:** cursor com chave de ordenação e id, índice para conta/pasta/data/id na ordem dominante e avaliação separada das visões unificadas e ordens por expressão; contar fora de cada append ou invalidar total quando necessário. Não presumir que um único índice resolve todas as ordens. No ramo que inclui pinned, o cursor também precisa corresponder à ordem completa.
- **Teste posterior:** EXPLAIN QUERY PLAN e páginas profundas com datas repetidas, ASC/DESC, múltiplas contas, filtros, fixados e inserção/exclusão entre páginas; comparar sequência sem duplicações/omissões e custo da primeira versus última página.
- **Risco:** custo de escrita/disco, construção de índices na migração, estabilidade da paginação e totais desatualizados. A frase “nenhum índice” é incorreta; “nenhum índice dirigido à ordenação” é sustentada. TEMP B-TREE e varredura integral não foram medidos nem observados em plano real.

## P05 — Busca LIKE sobre concatenação com corpo

- **Prioridade/status:** P1; mecanismo confirmado; benefício de FTS a medir. Corresponde a A-06.
- **Evidência:** [store.rs:464](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/crates/tcs-core/src/store.rs:464), linhas 464–529: operadores usam LIKE com curinga inicial e termos livres concatenam colunas incluindo body_text. O COUNT em linhas 588–591 repete os predicados. `crates/tcs-core/src/db.rs:458–498` mantém messages_fts; isso não torna a rota list_page_scoped uma consulta FTS.
- **Raiz:** busca textual da interface não aproveita o índice invertido existente e constrói texto por linha candidata.
- **Correção concreta proposta:** definir contrato de palavra/frase/prefixo e usar MATCH para esse contrato; preservar operadores e substring onde exigidos, com entrada FTS escapada. Não trocar silenciosamente substring por prefixo.
- **Teste posterior:** buscas comuns/raras, acento, frase, pontuação, caracteres FTS, prefixos, substring, operadores combinados e escopos de conta/pasta; verificar resultados e p95 em volume crescente.
- **Risco:** mudança de semântica/relevância e divergência de índice após atualizações ou exclusões. Nem toda consulta precisa visitar todas as mensagens: outros filtros podem limitar candidatos.

## P06 — Backfill repete UID SEARCH histórico amplo

- **Prioridade/status:** P1 em pastas grandes; algoritmo confirmado, custo por provedor não medido.
- **Evidência:** [async_mail.rs:1829](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/crates/tcs-core/src/async_mail.rs:1829), linhas 1829–1850: procura todos os UIDs anteriores ao cursor, ordena o conjunto e toma limit. Linhas 1694–1716: primeiro recent usa SEARCH ALL. [main.js:894](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/frontend/main.js:894), linhas 894–909: histórico é manual e limitado por sessão de UI.
- **Raiz:** FETCH é limitado, mas SEARCH/ordenação anteriores ao FETCH não são limitados ao tamanho da página.
- **Correção concreta proposta:** janelas UID adaptativas com expansão para regiões esparsas e checkpoint seguro; manter validação integral do lote antes de avançar o cursor.
- **Teste posterior:** 50k mensagens, grandes lacunas de UID, pasta vazia, UID máximo, mudança de UIDVALIDITY, FETCH parcial e queda de conexão; registrar UIDs retornados por SEARCH e bytes por página.
- **Risco:** pular mensagens, encerrar cedo em janela vazia e avançar cursor após resposta parcial. Refutada a leitura de que entrada automática baixa todo o histórico: essa rota não inicia backfill.

## P07 — Serialização por conta e lote de N sessões

- **Prioridade/status:** P1; sessões/runtimes por mutação e ausência de prioridade confirmados. Corresponde a A-04.
- **Evidência:** [main.js:586](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/frontend/main.js:586), linhas 586–594: um message_action aguardado por item. [operations.rs:70](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/crates/tcs-core/src/operations.rs:70), linhas 70–125 e 139–178: thread/runtime e LOGIN por mutação. [coordination.rs:24](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/crates/tcs-core/src/async_mail/coordination.rs:24), linhas 24–44: uma permissão por conta.
- **Raiz:** API síncrona de fila é adaptada para async por chamada; a exclusão da interface não agrupa UIDs e trabalhos interativos aguardam a mesma admissão de manutenção.
- **Correção concreta proposta:** comando de lote agrupado por conta/pasta/UIDVALIDITY, sessão única e resultado por UID; escalonamento com preferência interativa e união de solicitações equivalentes. Preservar checkpoints e validade de identidade durante o commit.
- **Teste posterior:** 1/10/100 mensagens, duas contas, mudança de pasta, erro parcial e cancelamento; contar LOGIN/TLS e confirmar somente os UIDs solicitados, sem remover falhas da seleção.
- **Risco:** falhas parciais, ambiguidade remota, limites do servidor e concorrência. Não elevar simplesmente o semáforo. Não usar EXPUNGE global como fallback: `crates/tcs-core/src/async_mail.rs:1367–1369` recusa exclusão definitiva sem UIDPLUS. A afirmação “runtime novo em toda operação IMAP” é ampla demais: as rotas async recentes/históricas usam o runtime existente.

## P08 — Fontes sem cache e preferências seriadas no compositor

- **Prioridade/status:** P1 para abertura do compositor; chamadas confirmadas, latência por SO não medida. Corresponde a A-08.
- **Evidência:** [composer.js:109](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/frontend/composer.js:109), linhas 109–130: preferências independentes são aguardadas em sequência; fontes são aguardadas a cada abertura. [lib.rs:1044](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/src-tauri/src/lib.rs:1044), linhas 1044–1132: fc-list/system_profiler/PowerShell sem cache. `src-tauri/src/text_encoding.rs:6` continua usando HKLM; fix1 corrigiu a decodificação, não o cache.
- **Raiz:** descoberta de recursos invariantes por abertura e IPCs independentes encadeados antes da montagem.
- **Correção concreta proposta:** reutilizar promessa/lista de fontes por processo JS, compartilhar requisição em voo, invalidar cache rejeitado e fornecer fallback sem rejeição; carregar fora do caminho crítico quando possível. Agrupar preferências independentes com Promise.all, preservando fallback conta→global de cada chave. Cache Rust e consulta HKCU seriam trabalhos posteriores separados.
- **Teste posterior:** dois compositores simultâneos, falha e nova tentativa de fontes, fallback, zero contas, overrides por conta e erros independentes de preferência; verificar quantidades/ordem de IPC, sem depender de fonte instalada.
- **Risco:** cache obsoleto após instalar fontes, cache envenenado por falha e troca do valor padrão por erro de uma preferência. Não alterar roteamento de compositor por conta sem coordenação com seu responsável.

## P09 — Consulta de credencial por subprocesso

- **Prioridade/status:** P2, elevável após medição; mecanismo confirmado para os caminhos citados. Corresponde a A-12.
- **Evidência:** [secrets.rs:91](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/crates/tcs-core/src/secrets.rs:91), linhas 91–105: secret-tool por lookup Linux. Linhas 207–248: processo PowerShell por get Windows. `crates/tcs-core/src/oauth.rs:774–782` distingue OAuth de senha e chama lookup_password no ramo senha.
- **Raiz:** operações frequentes com senha voltam ao processo externo do cofre. OAuth possui resolução própria e não foi generalizado aqui como se fosse o mesmo ramo.
- **Correção concreta proposta:** API nativa do Credential Manager no Windows; avaliar cache curto por identidade de conta, com memória protegida e invalidação ao alterar, remover, revogar ou falhar autenticação.
- **Teste posterior:** cofre bloqueado, mudança/revogação de senha, Unicode, dois processos e expiração; medir lookup isolado com credenciais sintéticas e operação completa.
- **Risco:** vida útil de segredo em memória, retorno de segredo antigo e regras de acesso do sistema operacional. Nenhum segredo foi lido nesta auditoria.

## P10 — Estimativa textual/HTML a cada input

- **Prioridade/status:** P2; execução por input confirmada, travamento não reproduzido.
- **Evidência:** [composer.js:249](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/frontend/composer.js:249), linhas 249–252: serializableHtml clona o editor; updateWordCount lê texto, percorre anexos e cria Blob; input o chama diretamente. Linhas 181 e 370–371 mostram limpeza de timers e intervalos de salvamento existentes.
- **Raiz:** estimativas auxiliares repetem serialização e alocações no caminho de digitação.
- **Correção concreta proposta:** debounce da estimativa, com execução inicial e atualização explícita em operações que precisem dela; cancelar o timer ao fechar. Não adiar snapshot usado para salvar/enviar nem alterar o contrato de recuperação do rascunho.
- **Teste posterior:** rajada de inputs com relógio controlado, última edição refletida, fechamento antes do disparo e mudança de anexos; verificar número de serializações, valores finais e ausência de callback após destruição.
- **Risco:** badge temporariamente atrasado, timer após fechamento e acoplamento indevido com autosave. Estimativa de MIME não é medição exata do envio.

## P11 — Scheduler periódico e IDLE externo

- **Prioridade/status:** P2; acordadas/consultas previstas no código, CPU ociosa não medida. Corresponde a A-14/A-16.
- **Evidência:** [lib.rs:6973](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/src-tauri/src/lib.rs:6973), linhas 6973–6980: scheduler gráfico a cada 5 s. Linhas 6743–6755: monitor IDLE relê configuração a cada 5 s. Linhas 6805–6815 e 6865–6872: worker/runtime por conta e verificações durante backoff no processo externo. `src-tauri/src/main.rs:9–11` desativa esses argumentos no Linux.
- **Raiz:** polling é usado também quando não há trabalho ou alteração de configuração. A auditoria externa mistura processo gráfico com execução externa.
- **Correção concreta proposta:** Notify no enfileiramento, próximo prazo persistido e watch para configuração; manter recuperação após retomada e encerramento cancelável. Só propor centralização do IDLE após revisar sua arquitetura e comportamento por SO.
- **Teste posterior:** 30 minutos de repouso, fila vazia e com envio futuro, suspensão/retomada, ativação/desativação e 1/3/5 contas; registrar wakeups/CPU e entrega no prazo.
- **Risco:** perder notificações, atrasar envio, duplicar processamento e alterar comportamento da bandeja. A arquitetura da fila precisa preservar reivindicação segura; otimizar polling não corrige suas corridas de estado.

## P12 — Nova conexão SQLite por operação

- **Prioridade/status:** P2; abertura confirmada, custo relativo não medido. Corresponde a A-15; amplia A-18.
- **Evidência:** [db.rs:43](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/crates/tcs-core/src/db.rs:43), linhas 43–50: open/PRAGMA/timeout; linhas 905–915: cada get_setting abre conexão. `crates/tcs-core/src/store.rs:240–246` repete o padrão. [main.js:227](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/frontend/main.js:227), linhas 227–229 e 505: um contador IPC por conta, inclusive após cada página. `src-tauri/src/lib.rs:1725–1729` usa COUNT/GROUP BY sem índice parcial para unread.
- **Raiz:** helpers pequenos fazem I/O independente; atualizações de contadores multiplicam consultas além do carregamento visível.
- **Correção concreta proposta:** agrupar preferências e contadores em snapshots; medir reutilização de conexões de leitura e uma estratégia explícita de escrita; avaliar índice parcial unread. Não reduzir durabilidade nem reintroduzir journal_mode por consulta.
- **Teste posterior:** contar opens/IPCs por bootstrap, append e compositor; leituras concorrentes com sync e falha de lock; confirmar contagens após mutação e remoção de conta.
- **Risco:** afinidade de conexão, transações longas, starvation de escrita, invalidação de snapshot e aumento do número de conexões por pool.

## P13 — Agrupamento e contagem de conversas no render

- **Prioridade/status:** P2; algoritmo agora confirmado, não apenas plausível.
- **Evidência:** [main.js:516](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/frontend/main.js:516) chama threadCount por linha. Linhas 527–549: threadCount filtra todos os itens carregados, displayedRows reagrupa e ordena, e renderVirtualRows recria linhas visíveis. Linha 464: scroll chama render diretamente.
- **Raiz:** virtualização limita o DOM, mas não elimina processamento repetido da coleção carregada. Com V linhas visíveis e N itens, as contagens adicionam trabalho proporcional a V×N; o agrupamento também é refeito.
- **Correção concreta proposta:** pré-calcular Map de contagem por chave de thread em uma passagem por render/revisão e reutilizar nas linhas; considerar cache de agrupamento por revisão somente com invalidação clara. Preservar chave que inclui conta, threads isoladas e expansão/recolhimento.
- **Teste posterior:** muitas mensagens com threads repetidas, Message-ID igual em contas diferentes, append, remoção e recolhimento; comparar sequência/contagem com implementação de referência e número de varreduras. Não usar tempo absoluto como asserção.
- **Risco:** cache obsoleto, mudança da ordem carregada e mistura entre contas. A virtualização e as guardas de resultado obsoleto já existem e devem permanecer.

## P14 — Reindexação e busca vetorial RAG

- **Prioridade/status:** P2 condicionado a uso/volume de RAG. Algoritmos confirmados nesta revisão; ganho de otimização não provado.
- **Evidência:** [rag.rs:307](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/crates/tcs-ai-core/src/rag.rs:307), linhas 307–404: reindex_all visita fontes habilitadas, extrai chunks, solicita embeddings antes do hash e insere nova revisão sem comparar hash/revisão anterior. Linhas 469–528: consulta vetorial sem LIMIT prévio, desserializa JSON e calcula similaridade de todos os chunks ativos dos escopos selecionados; ordena candidatos e só então trunca. `src-tauri/src/lib.rs:6116–6124` expõe reindexação como comando explícito.
- **Raiz:** ausência de deduplicação antes da chamada de embeddings e busca exata por varredura, com materialização de candidatos. Há filtro de escopo e revisão ativa: não é correto dizer “todo o banco indiscriminadamente”.
- **Correção concreta proposta:** comparar conteúdo/modelo/versão de extração antes de embeddings e preservar o índice se nada mudou; avaliar armazenamento vetorial menos custoso e seleção top-k; somente adotar índice aproximado com dados que justifiquem o compromisso de qualidade.
- **Teste posterior:** reindexar fonte idêntica duas vezes e contar chamadas de provider; mudar modelo, conteúdo e escopo; validar rollback após falha e resultados em múltiplas contas; medir tempo/RAM em quantidades crescentes de chunks.
- **Risco:** hash incompleto reutilizando embedding incompatível, vazamento de escopo, mudança de ranking/recall e perda de revisão ativa numa falha. Não há evidência de que reindexação completa rode automaticamente na partida; não atribuir esse custo ao caminho normal de e-mail.

## P15 — Extração PDF/DOCX limita depois da expansão

- **Prioridade/status:** P1 de robustez quando RAG recebe documentos; caminhos confirmados, caso de exaustão não executado.
- **Evidência:** [rag.rs:572](/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1/crates/tcs-ai-core/src/rag.rs:572), linhas 572–615: 25 MiB limita arquivo de entrada. PDF usa output sem timeout e limita caracteres após capturar stdout inteiro. DOCX usa read_to_string no XML descompactado e só depois limita caracteres.
- **Raiz:** limite de arquivo comprimido ou entrada não limita tempo de subprocesso, stdout nem tamanho descompactado.
- **Correção concreta proposta:** prazo e cancelamento com término do subprocesso; saída lida incrementalmente com teto de bytes; conferir tamanho descompactado e limitar leitura ZIP/XML; retornar erro acionável e manter revisão antiga intacta.
- **Teste posterior:** subprocesso sintético que trava/produz saída ilimitada, DOCX sintético com expansão excessiva, UTF-8 cortado no limite e documento válido próximo ao teto; verificar término, limite de memória e ausência de commit parcial.
- **Risco:** matar processo errado, deixar subprocesso órfão, truncar conteúdo silenciosamente ou recusar documento válido. Não tornar truncamento invisível ao usuário.

## Divergências com as alegações A e com o baseline

| Alegação externa | Confronto independente |
| --- | --- |
| A-01: backup parcial/sem restauração | Abrangência parcial confirmada: exporta mail.db, não um pacote completo com ai.db e anexos. Porém `src-tauri/src/lib.rs:5551–5556` usa SQLite Backup API; não é cópia bruta do banco. Não declarar restauração completa inexistente nem equiparar credenciais, que requerem reautenticação, a arquivos de backup comuns. |
| A-02: workflow automático | Refutada nos bytes atuais **e no commit canônico**: `.github/workflows/imap-cross-platform.yml:3–4` tem apenas workflow_dispatch. No canônico isso está em linhas 2–3. Não registrar remoção de push/pull_request como mudança do fix1. |
| A-03: ordem DB/cofre | Confirmada em `src-tauri/src/lib.rs:2399–2402` e 2414–2429: salvar DB antes do cofre; apagar credencial antes do DELETE. Migração de senha em 2392–2396 ignora erro. Exige compensação/injeção de falha, não só inversão ingênua das operações. |
| A-04 | Confirmada para mutações da fila/lote; não para “runtime novo em toda operação”. Rejeitado fallback EXPUNGE global. Ver P07. |
| A-05 | Confirmada ausência de índice dirigido à ordem, OFFSET normal e COUNT repetido. Refutada formulação “sem índices” e não observados TEMP B-TREE ou tempo real. Ver P04/P12. |
| A-06/A-07/A-08 | Mecanismos confirmados, com limites descritos em P05/P01/P08. Migração FTS integral é anterior à v5, não toda abertura; importação legada possui marca de conclusão. |
| A-09: preferência por conta ignorada | Parcial: `frontend/main.js:27–29` ignora accountId, mas `frontend/views.js:104` também lê/grava reply_surface global. Existe ambiguidade de UI ao lado do seletor de conta; não foi demonstrado um override gravado por essa UI e ignorado depois. Implementação exige coordenação com responsável por C12. |
| A-10: vazamento remoto | Alegação não demonstrada: `frontend/lib.js:43` já injeta CSP no próprio srcdoc, `img-src data: cid:` quando allowRemote=false. Essa proteção também existe no canônico. Atributos background/image-set sobreviventes não bastam para concluir requisição remota; verificar tráfego nos três motores antes de alegar exploração. Isso não certifica todo o sanitizador. |
| A-11: IDLE inexistente/opção Linux enganosa | IDLE externo existe em `src-tauri/src/lib.rs:6737–6883`; falta integração no processo gráfico normal. Linux retorna cedo em `src-tauri/src/main.rs:9–11` e setup força false em lib.rs:6958–6966. A opção também já está desabilitada na UI Linux em `frontend/views.js:113`; não afirmar que a solução de ocultar/desabilitar ainda inexiste. |
| A-12 | Subprocessos confirmados; não generalizar ramo senha como cobertura integral de OAuth. Ver P09. |
| A-13: duas contas com mesmo e-mail | Chave por e-mail confirmada, mas `crates/tcs-core/data/schema_v9.sql:4` impõe email UNIQUE. Duas contas com e-mail literal idêntico no mesmo banco não são cenário suportado. Colisão entre diretórios/perfis ou normalizações precisa de demonstração específica. |
| A-14/A-15/A-16 | Confirmadas estruturas de polling/conexão, mas gráfico e processo externo devem ser separados. Ver P11/P12. |
| A-17: anexos legados | `crates/tcs-core/src/store.rs:598–640` confirma detail chamando externalize_attachments e lendo JSON antes de detectar data_hex vazio. O impacto de anexos legados e seu alcance numa instalação real continuam sem medição. O transporte async de cabeçalhos não justifica alegar anexos completos em toda listagem. |
| A-18: IPC por conta | Confirmada em `frontend/main.js:227–229`; retorno de cada página chama novo refresh em linha 505. Ver P12. |
| A-19: erros de linhas ocultados | Confirmada em `crates/tcs-core/src/store.rs:571` por filter_map(Result::ok), e total com fallback em 588–591. Propagar erro tipado ou tornar falha observável sem dados de mensagem; testar linha inválida. |
| A-20: processos por SO | Divergência arquitetural confirmada pelo encaminhamento dos argumentos de background em `src-tauri/src/main.rs:9–31`. Não confundir background externo com serviços do processo gráfico nem supor exclusão mútua entre processos só por mutex local. |
| A-21: URL/MSI | `src-tauri/tauri.conf.json:42` ainda usa /mail; URL divergente só constitui defeito com requisito de destino confirmado. MSI atual em linha 49 é 0.8.209, não 0.8.208; a futura 0.8.3 terá de ser tratada pelo responsável pela release. |
| A-22: toolchain divergente | No fix1, `.github/workflows/imap-cross-platform.yml:37–40` e `tcsmail-homologacao.yml:49–53` passam toolchain 1.99.0 explicitamente. O nome da action @stable não anula o parâmetro. O baseline não tinha essa mesma fixação explícita. MSRVs diferentes não são, por si só, defeito com toolchain comum mais nova. |
| A-23: versões de actions/cache | Existência remota de versões não verificada nesta fase sem rede. `tcsmail-homologacao.yml:58` fixa Tauri CLI 2.12.4, mas instalação e cache merecem avaliação do CI. Não declarar action inválida por suspeita. |
| A-24: fs::copy pré-migração | `store.rs:253–259` tem ramo old<10, porém open chama primeiro Database::open e `db.rs:149–150` eleva a versão para 11. Esse ramo não explica cópia recorrente no fluxo normal. Há cópia em `db.rs:166–170`, condicionada a upgrade e precedida de checkpoint. Consistência com WAL/processos concorrentes requer teste; não confundir com export que usa Backup API. |

Os arquivos `db.rs`, `store.rs`, schemas, `sync_engine.rs`, `operations.rs`, `rag.rs`, `composer.js` e `frontend/lib.js` examinados não diferiam do commit canônico. `frontend/main.js`, `frontend/native_window.js`, `src-tauri/src/lib.rs` e `async_mail.rs` tinham mudanças locais. Persistência de um problema no fix1 não prova que ele foi introduzido pelo fix1. O manifesto `scripts/quality/rc8-branding-manifest.json` está rastreado no Git; não transportar ao canônico a dúvida externa sobre estar commitado.

## Protocolo posterior de validação, não executado na auditoria

1. Congelar commit, diff e hashes da 0.8.3 e do comparador. Separar mudanças do app, versões de WebView e ambiente. Registrar hardware, SO, tamanho do banco, configurações e estado de cache.
2. Usar bancos/contas sintéticos: 1k/10k/50k mensagens, uma e três contas, corpos de 2–50 KiB, anexos e threads conhecidos. Nunca ler/exportar caixas reais para medir.
3. Começar por regressões de invariantes com mocks: IPC atrasado/offline, respostas fora de ordem, conta/época, falha parcial de lote, recuperação de cache de fontes e relógio de debounce. Asserções de algoritmo/contagens são preferíveis a limiares de tempo frágeis.
4. Medir partida→janela→lista interativa; troca de pasta; primeira página e páginas profundas; busca; leitor cached/hidratado; compositor; lote 1/10/100; sincronização e repouso. Registrar p50/p95/p99 em pelo menos 30 repetições por cenário/SO quando aplicável.
5. Instrumentar separadamente duração SQLite e plano EXPLAIN QUERY PLAN, opens de conexão, IPC, LOGIN/TLS, UIDs e bytes de SEARCH, serializações do editor e chunks/embeddings. Não registrar endereços, tokens, conteúdo ou credenciais.
6. Exercitar offline, latência/perda controlada, UIDs esparsos, UIDVALIDITY alterada, inserções/exclusões entre páginas, suspensão e falha de cofre. Validar Windows x64, Linux x64, macOS Intel e ARM64; build nativo e teste gráfico continuam gates posteriores.
7. Comparar correção, desempenho e recursos após cada mudança localizada. Declarar ganho apenas com resultados reproduzíveis; aumento de throughput não compensa perda de durabilidade, privacidade ou mensagens. Os testes propostos neste documento não devem ser apresentados como executados.

## Entrega desta fase

Este arquivo é evidência documental da revisão independente. As recomendações são propostas para trabalho posterior, não alterações já realizadas. Não há homologação de runtime, instalador, provedor ou desempenho. Uma implementação posterior deve registrar seu próprio diff, testes, limites e referências novas, preservando este snapshot de auditoria.
