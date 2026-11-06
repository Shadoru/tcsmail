# TCS Mail 0.8.3 — auditoria, confronto e entrega

## Como ler este relatório

O objetivo é simples: abrir o e-mail sem espera desnecessária, encontrar as opções sem conhecer termos técnicos e evitar ações que contrariem a decisão do usuário. A configuração antiga de IA era inadequada para o público descrito: escolher modelo antes de conectar o serviço inverte a dependência real. A sequência adotada é **serviço → conexão e teste → modelo → autorização de conteúdo → salvar**. Opções de servidor, modelos por tarefa e documentos de referência ficam em detalhes.

Este documento consolida a análise solicitada antes da entrega implementada **0.8.3**. A restrição de somente auditoria do texto anexado foi respeitada durante a investigação e o confronto; a implementação posterior atende ao pedido direto de continuar a entrega e mudar sua versão. Não houve publicação de release, push, envio de e-mail real ou acesso aos bancos e credenciais pessoais.

Fonte canônica consultada: `/home/otavio/Projetos/TCS-Mail/repo`, base `228ad458e61bf590e5452ed869565a69815b1a45`, incluindo alterações locais preexistentes preservadas. O commit sozinho não identifica o pacote alterado: o manifesto SHA-256 entregue identifica os arquivos finais. Fontes sincronizadas em `sources/` não foram modificadas. Não foi possível recuperar os bytes dos ZIPs de outras conversas; não se afirma identidade binária com eles.

Entradas confrontadas integralmente:

- Texto colado: SHA-256 `9380236ebcfb3205dc1e4e317256d2b374d8804bbb1abfb21275e1b8981a6cda`, 295 linhas.
- Auditoria estática independente: SHA-256 `2fb92199e1e89b12bc6f646ded255111ff4d8ed42fd89228c0b23324fe058800`, 211 linhas.
- Dois agentes de análise independentes do implementador, com relatórios em `docs/AUDITORIA_INDEPENDENTE_DESEMPENHO.md` e `docs/AUDITORIA_INDEPENDENTE_INTEGRIDADE.md`. São agentes de software, não especialistas humanos externos.

**Limite da revisão:** todos os arquivos de texto distribuídos passam por inventário e verificação de UTF-8, incluindo o código vendorizado. Isso não significa revisão humana de cada linha, cobertura de todos os caminhos ou garantia de ausência de caracteres incorretos em dados externos. Nenhuma análise estática comprova apresentação perfeita em todos os sistemas. A validação nativa de Windows e dos dois macOS continua necessária.

As linhas das tabelas B e C identificam o código observado na primeira rodada, antes das correções; os relatórios independentes registram hashes e contexto. As funções citadas permitem localizar a implementação final mesmo quando suas linhas mudam. “Confirmado” descreve o mecanismo demonstrado, não um ganho medido. P0 bloqueia entrega; P1 é alto impacto; P2 é localizado; P3 é manutenção.

## A. Os dez problemas mais importantes

| Ordem | Problema em linguagem simples | Resultado na 0.8.3 / limite |
|---|---|---|
| 1 | O aplicativo podia aceitar “cancelar” e ainda iniciar o envio | Claim condicional SQLite e resultado verdadeiro do cancelamento; sem reenvio automático de SMTP incerto |
| 2 | Falha no cofre podia deixar uma conta gravada sem a senha correspondente | Autenticação IMAP antes de cadastrar/alterar conexão; segredo antes da gravação com compensação se o banco falhar |
| 3 | Uma análise de IA podia reutilizar o contexto de outra conta | Cache passa a incluir conta, linha local, conteúdo, configuração, prompt e revisão/escopo dos documentos |
| 4 | Responder/encaminhar podia carregar imagens da mensagem no editor | Fragmentos do compositor têm filtro próprio sem dependência da proteção do leitor |
| 5 | Janela separada podia excluir definitivamente sem perguntar | Confirmação explícita; cancelar deve produzir zero chamadas destrutivas |
| 6 | Um item com credencial inválida podia travar a fila de outras contas | Erro de preparação torna o item inelegível e visível para revisão |
| 7 | A lista local esperava a rede antes de aparecer | Pintura local antes da atualização de pastas; não confundir cache com sincronização concluída |
| 8 | Alguns botões do leitor separado e de grupos falhavam | Corrigir escopo das funções e nome da lista que ocultava a função de recarga |
| 9 | Um documento podia consumir tempo e memória sem limite suficiente | Extração PDF com prazo e saída limitada; DOCX limitado antes de descompactar integralmente |
| 10 | Configurações misturavam tarefas comuns com detalhes técnicos e nomes de pasta codificados | Navegação por finalidade, busca, IA guiada, detalhes recolhíveis e decodificação de exibição separada do identificador IMAP |

Paginação, busca e sessões IMAP têm oportunidades importantes de desempenho descritas abaixo. Mudanças amplas de protocolo ou de semântica de busca ficam como plano de engenharia, com critérios de medição e não como melhorias fictícias desta entrega.

## B. Problemas e correções de desempenho

A investigação de desempenho cobre partida, pintura, compositor, frontend, SQLite, IMAP, filas, ingestão e RAG. O benefício é esperado pela eliminação de trabalho ou espera; **não existem percentuais de ganho ou resultados p50/p95/p99 medidos nesta auditoria**.

| ID / prioridade / estado | Arquivo e linha observada; evidência e causa-raiz | Impacto e correção concreta | Como medir/testar; risco |
|---|---|---|---|
| P01 · P1 · Confirmado | `src-tauri/src/lib.rs:528–557,6913`: `state_for` antes de Builder/instância única; abre ambos os bancos | IA indisponível não deve impedir e-mail: isolamento aplicado, sem apagar/recriar `ai.db`. Separar preparação mínima e inicialização tardia continua proposto | Banco IA sintético inválido; medir processo→janela→lista fria/quente. Risco médio de consultar schema antes da migração; não retirar a migração |
| P02 · P1 · Confirmado | `frontend/main.js:205,274–281`; `lib.rs:1681–1702`: LIST autenticado remoto aguardado antes de renderizar | Pintar shell/lista do snapshot local e atualizar pastas depois, protegendo troca de conta e mantendo LIST→SPECIAL-USE→papéis | IPC remoto deliberadamente suspenso/offline; lista deve aparecer sem resolver a promessa. Medir primeira interação. Risco: resposta antiga sobrescrever conta atual |
| P04 · P1 · Confirmado | `main.js:485`; `store.rs:373–398,537–591`: token `tcs-sort:` ativa OFFSET e COUNT; UNIQUE já cria índice, mas não o de ordenação | Proposto: índice dirigido a conta/pasta/data/id e cursor composto compatível com fixados, visão unificada e todas as ordens | Bancos sintéticos 1k/10k/50k; EXPLAIN QUERY PLAN e páginas profundas. TEMP B-TREE ainda não demonstrado. Risco médio: custo de escrita e saltos/duplicatas sob alterações |
| P05 · P1 · Confirmado | `store.rs:464–529`: LIKE com curinga inicial e concatenação de corpo; FTS existe em outra rota | Proposto: MATCH para palavras, mantendo contrato claro de substring/frase/acento/operadores | Comparar resultados e p95 por busca; nunca substituir silenciosamente substring por token. Risco médio de mudança de significado |
| P07 · P1 · Confirmado | `operations.rs:70–125,139–178`; `coordination.rs:24–44`: lote da UI faz uma mutação por sessão, conta tem uma permissão | Proposto: lote de UIDs em uma sessão por conta/pasta/UIDVALIDITY, resultado individual e prioridade interativa | Lotes 1/10/100, falhas parciais e época alterada. Contar sessões TLS e IPC. Não aumentar simplesmente o semáforo. Risco alto se UID/época forem misturados |
| P06 · P1 · Confirmado | `async_mail.rs:1829–1850`: cada página SEARCH de todos os UIDs anteriores, depois limita | Proposto: janelas UID adaptativas/checkpoints; histórico completo não é iniciado automaticamente ao entrar na pasta | UIDs densos/esparsos, lacunas e UIDVALIDITY novo. Medir bytes/latência por página. Risco médio de pular mensagens |
| P03 · P1 · Confirmado | `native_window.js:80–89`: mensagem/flags/permissões/papéis antes da pintura | Leitor separado deve usar cache primeiro, hidratar depois e não permitir ação destrutiva enquanto faltam papéis | Cache com hidratação suspensa, fechar/trocar durante resposta e falha de flags. Medir primeira pintura. Risco de resposta obsoleta |
| P08 · P1 · Confirmado | `composer.js:109–130`; `lib.rs:1044–1132`: preferências em sequência e subprocesso de fontes por abertura | Cache de fontes no processo Rust e no renderer, preferências independentes agrupadas; Windows inclui HKCU além de HKLM. Fontes instaladas durante a sessão requerem reinício | Contar chamadas em duas aberturas; falha deve ter fallback. Medir compositor interativo, não só retorno de IPC. Risco baixo de lista temporariamente desatualizada |
| P09 · P2 · Confirmado | `secrets.rs:91–105,207–248`: Linux/Windows iniciam processo por consulta; macOS usa API nativa | Proposto: Credential Manager nativo e cache curto com invalidação, sem fallback em arquivo | Medir número de consultas e latência sintética nos cofres reais; falha/desbloqueio. Risco alto de prolongar segredo ou cachear token revogado; não implantado sem contrato |
| P10 · P2 · Confirmado | `composer.js:249–252`: clona DOM/gera Blob a cada input | Adiar atualização da estimativa e reutilizar o agendamento; manter valor final coerente | Digitação contínua, fechamento e ação de envio antes do timer. Contar cálculos/long tasks. Risco baixo de estimativa visual atrasada |
| P11 · P2 · Confirmado | `lib.rs:6973–6980,6805–6815`: polling SMTP 5 s; IDLE externo tem thread/runtime por conta | Proposto: Notify/watch com próximo prazo e cancelamento. O runtime de IDLE citado não está no processo gráfico normal | Repouso por 30 min, fila futura, suspensão/retomada. Medir CPU/wakeups. Risco médio de não acordar envio agendado |
| P12 · P2 · Confirmado | `db.rs:43–50,905–915`: conexão SQLite por consulta | Proposto: reuso limitado após perfil, transações curtas e limites de contenção | Contar conexões e p95 sob leitura/escrita; preservar foreign_keys/busy_timeout/durabilidade. Risco de compartilhar conexão inadequadamente |
| P13 · P2 · Confirmado | `main.js:532–549`: contagem de conversa percorre itens por linha visível | Pré-calcular contagens uma vez por renderização, mantendo virtualização existente | Conversas grandes e mudança de agrupamento; comparar contagens. Medir tarefa de renderização. Risco baixo de invalidar cache no momento errado |
| P14 · P2 · Confirmado | `rag.rs:355–404,478–528`: embeddings antes do hash; vetores JSON dos chunks autorizados percorridos integralmente | Hash de conteúdo, origem, escopo, extrator e binding antes de embeddings; fonte inalterada não cria revisão. Índice vetorial permanece proposta dependente de volume/qualidade | Mesma fonte duas vezes: mesma revisão e nenhuma nova chamada de embeddings; mudança de conteúdo/modelo/escopo invalida. Medir ingestão separada da busca. Risco médio de hash incompleto |
| P15 · P1 · Confirmado | `rag.rs:595–615`: PDF `.output()` sem prazo/limite; DOCX XML integral antes do corte | PDF: 30 s, saída 8 MiB, subprocesso encerrado e recolhido; DOCX: tamanho declarado e leitura limitada a 8 MiB, UTF-8 estrito | Saída excessiva, processo que não termina e XML comprimido grande. Risco baixo de rejeitar documento legítimo grande; mensagem orienta dividir/converter |

### Protocolo reproduzível de benchmark posterior

Congelar manifesto do canônico e do candidato; usar perfis novos sintéticos em cada SO, mesmos recursos de máquina e versões de WebView registradas. Preparar 1k, 10k e 50k mensagens, uma e três contas, conversas longas, anexos grandes e UIDs esparsos. Separar cache frio de quente e rede local de rede lenta/offline. Não usar e-mails reais nem desativar antivírus, certificados ou durabilidade.

Medir processo→janela→lista interativa, troca de pasta/conta, páginas profundas, busca, abertura de mensagem/compositor, lote e ingestão RAG. Registrar amostras suficientes para quantis, p50/p95/p99, CPU, RAM/working set, conexões SQLite/TLS, bytes, IPC e tarefas longas. Fazer 30 min de repouso e ciclo prolongado de abertura/fechamento para crescimento de memória. Capturar planos SQL antes/depois. Um ganho só é aceito se não houver diferença indevida em resultados, seleção, consentimento, época IMAP ou recuperação. Não existe baseline numérico executado nesta fase.

## C. Erros funcionais e correções

| ID / prioridade / estado | Arquivo/linha; evidência e causa | Impacto; correção concreta | Como testar; risco |
|---|---|---|---|
| C01 · P0 · Confirmado | `outbound.rs:112,182,221`: cancel ignora linhas; UPDATE sending incondicional | Cancelamento sobrescrito. CAS exige estado/prazo ainda elegíveis e uma linha; cancel tardio informa que iniciou | Dois workers/conexões, cancel entre seleção e claim, reagendamento. Alto se reativar SMTP incerto; proibido retry automático |
| C04 · P1 · Confirmado | `lib.rs:2392–2429`: migração destrutiva/cofre e DB sem compensação | Pré-validar identidade e autenticar IMAP; leitura do segredo anterior e gravação antes de DB; restaurar/remover em erro de DB. Excluir DB antes de revogar; falha de limpeza é informada | Falhas de cofre/DB, conta A renomeada para B, alteração só de caixa. Risco médio; cofre e SQLite não têm transação atômica comum |
| C06 · P1 · Confirmado | `lib.rs:6473–6510`; `rag.rs:262–275`: cache por Message-ID/idioma, sem fronteira de conta | Chave SHA-256 inclui conta, ID local, conteúdo, idioma, preferências, bindings/provedores, versão de prompt, revisões/escopos RAG. Cache legado deixa de coincidir | Mesmo Message-ID em duas contas; alterar corpo/modelo/índice. Consentimento verificado antes de lookup. Risco baixo de crescimento do cache |
| C07 · P1 · Confirmado | `native_window.js:95,127,130`: delete_permanent direto | Confirmação compartilhada no caminho nativo; contexto de pasta deve estar pronto | Cancelar e confirmar em Trash; zero chamadas ao cancelar. Risco baixo |
| C08 · P1 · Confirmado | `outbound.rs:182–221`: erro de preparação deixa o mais antigo elegível | Marcar falha/needs_auth com diagnóstico sem dados, permitindo próxima conta; sem tentar SMTP com contexto inválido | JSON inválido, conta removida, cofre indisponível e conta seguinte. Risco médio de retry duplicado; manter revisão explícita |
| C10 · P1 · Confirmado | `native_window.js:89,131`: setMode/showHtml locais a render, usados por wire irmã | Elevar ao escopo correto, descartar resposta antiga e não usar host desmontado | Texto/HTML/remoto após rerender; trocar/fechar durante hidratação. Risco baixo/médio |
| C11 · P2 · Confirmado | `views.js:91`: const groups oculta groups() | Renomear a lista; recarregar após salvar/excluir. A alteração já era persistida antes do erro | Salvar/excluir grupo duas vezes e conferir lista. Risco baixo |
| C12 · P2 · Confirmado parcial | `main.js:27–29`; `views.js:104`: leitura e escrita globais em formulário com escopo | Respeitar `account.<id>.composition.reply_surface`, com fallback global; opção sem override herda global | Conta A integrada, B separada, global e remoção de override. Não é evidência de envio pela conta errada. Risco baixo |
| C14 · P2 · Confirmado | `rag.rs:431,450`: normalização decrescente da força BM25 | Usar transformação monotônica de -BM25; melhor negativo recebe score maior | -10 deve superar -1; busca lexical com fontes conhecidas. Risco baixo de alteração esperada da ordenação |
| C15 · P2 · Confirmado | `store.rs:571,588–591`: filter_map(Result::ok), total fallback | Propagar erro de linha/contagem, sem fingir lista completa | Linha sintética ilegível e falha de consulta. Risco baixo: erro agora visível |
| C03 · P1 · Confirmado quanto ao alcance | `lib.rs:5537–5561`: export só mail.db | Rótulo explica banco de e-mails, exclusões e ausência de restauração automática. Recuperação integral transacional continua proposta, não implementada improvisadamente | Conferir texto e SQLite exportado. Médio/alto para implementação futura com anexos/paths/rollback |
| C05 · P2 · Confirmado parcial | `secrets.rs:28–46`; `schema_v9.sql:1–4`: chave email, UNIQUE impede duplicata literal | Corrigir mudança de caixa e preservar segredo antigo até DB; UUID por perfil é evolução com migração, não “correção” de colisão impossível no mesmo DB | Renomear para email de outra conta deve preservar ambos. Risco médio de migração de cofre |
| C13 · P2 · Confirmado como limitação | `main.rs:9–11`; `lib.rs:6956–6966`: Linux força background off; não há IDLE gráfico | UI Linux já explica limitação e desabilita a opção. Integração IDLE futura requer projeto/cancelamento; não anunciada nesta entrega | Janela aberta/fechada em cada SO, suspensão/rede. Risco médio/alto de serviços órfãos |
| T01 · P1 · Confirmado | `main.js:787–789`; `native_window.js:122–124`; `composer.js:242`: citação remove head/CSP e entra no DOM principal | Filtro específico de fragmento antes de inserir no editor/prévia; permite formatação e CID/imagem raster local, remove carregamentos remotos | Pixel local sintético/interceptação em responder, encaminhar, restaurar e prévia. Risco médio de remover formatação ou imagem legítima |
| T02 · P1 · Confirmado | `frontend/*` nomes IMAP brutos exibidos no print | Decodificar Modified UTF-7 somente para exibição, confiar em display_name do backend, preservar name/UID/namespace na operação | `00 - Seguran&AOc-a e Contas` → `00 - Segurança e Contas`, Unicode/ampersand literal/malformado/separador. Risco alto se rótulo for enviado como ID; testes distinguem ambos |
| T03 · P2 · Confirmado | `frontend/ai_settings.js`, UI antiga no views: modelo antes de credencial e detalhes para conexão comum | Fluxo guiado com serviços principais, teste sintético real separado de salvar, ativação por último e autorização visível | Falha do teste não habilita; cancelar consentimento não grava; troca de conta descarta retorno velho. Risco médio de ampliar consentimento ou perder bindings |

## D. Confronto com H01–H15

| Pista | Classificação e fundamento atualizado |
|---|---|
| H01 | **Corrigida no caminho da UI**, com botão real e teste comportamental de seleção/cancelamento/falha parcial. Custo de N sessões permanece P07; servidor real pendente |
| H02 | **Parcial**: compensação implementada, autenticação antes de persistência; cofres reais dos quatro destinos e falha de energia entre sistemas continuam sem prova de atomicidade |
| H03 | **Confirmada como limitação da interface**. Script isolado de backup/restauração de bancos já existe e usa Backup API; refutada a alegação de inexistência absoluta. Não restaura perfil integral/anexos pela UI |
| H04 | **Corrigida no código candidato**, override por conta e fallback global; validar ambas as superfícies nativas |
| H05 | **Parcial**: First Run exige conta persistida, guarda preferências ao voltar e restaura pendência se conclusão falhar. Testes sintéticos não equivalem a onboarding OAuth real |
| H06 | **Parcial**: testes de SPECIAL-USE Gmail e UIDVALIDITY existem; LIST precede persistência de papéis. Gmail/Microsoft/IMAP reais e rede instável continuam pendentes |
| H07 | **Parcial**: build atual fixado/locked e gates UTF-8/rustfmt/Clippy. Pipelines executados e limites aparecem nas evidências finais; não atribuir getcwd antigo a defeito atual sem reprodução |
| H08 | **Corrigida na fonte distribuída**: manifesto e 13 recursos verificáveis por hash. ZIP não depende de estar em Git; prova de commit remoto é distinta e não foi inventada |
| H09 | **Parcial até inspeção final**: extração rpm2cpio tem fallback bsdtar e falha mantém logs; pacote real deve ser inspecionado, não somente texto de script |
| H10 | **Não verificável integralmente**: arte e tamanhos preservados/checados; aparência do ícone instalado e cache GNOME/Windows/macOS exigem instalação nativa |
| H11 | **Parcial**: rascunhos mesclados à lista, seleção e layout com regressões; matriz de renderer cobre temas/tamanhos/idiomas, sem certificar todos os WebViews |
| H12 | **Parcial**: revisão de PKCE/state/callback duplicado/timeout/cancelamento/scopes e testes sintéticos; aprovação/renovação/reautorização nos provedores reais pendentes |
| H13 | **Corrigida quanto às versões**: uma async-imap 0.12.0 e imap-proto 0.17.0, sem imap legado; vendor preservado. Equivalência integral ao crate publicado não demonstrada |
| H14 | **Inaplicável como defeito do app**: target, Cargo/Rust e caches são ambiente de desenvolvimento. Instalador não os inclui. Espaço e limpeza são tratados separadamente |
| H15 | **Confirmada**: ausência de benchmark comparativo dos quatro destinos. Protocolo definido na seção B; nenhum número fabricado |

## E. Novos achados e conclusões externas revistas

Os achados C01/C06/C07/C08/C10/C11/C14 e P10/P13/P14/P15 não eram cobertos suficientemente pelas pistas históricas. T01 identifica um caminho real distinto daquele alegado para o leitor. As tabelas B/C contêm evidência, causa, correção e teste de cada um.

| Alegação externa | Confronto e decisão |
|---|---|
| A02/C02, workflows push/PR | **Refutada para a fonte canônica e candidata**: já eram workflow_dispatch. Não registrar uma remoção que não foi necessária |
| A10/C09, CSP externa permitiria rastreamento no leitor bloqueado | **Conclusão não demonstrada**: a meta CSP restritiva já precede conteúdo; políticas se intersectam. Atributos remanescentes não bastam. T01, no compositor sem esse head, é um problema diferente |
| A13/C05, duas contas com mesmo e-mail literal | **Cenário refutado no mesmo DB** pelo UNIQUE. Renomear A para B antes da validação e mudança só de caixa eram riscos concretos, corrigidos pelo fluxo de identidade |
| A22, @stable anularia toolchain explícita | **Refutada**: `with.toolchain: 1.99.0` controla a instalação. rust-version é mínimo por crate, não a toolchain efetivamente executada |
| A23, tags das actions possivelmente inexistentes | **Verificadas em fontes oficiais** na análise anterior; v7 das actions usadas existe. Não implica execução remota bem-sucedida |
| A24, cópia pré-migração e WAL | Padrão inseguro confirmado em `db.rs:61–65,166–169`; perda efetiva é hipótese. O ramo store.rs isolado não descrevia a partida normal. Trocar os caminhos alcançáveis por Backup API, com teste WAL |
| A01/H03, testes refeririam comando de restauração inexistente | **Refutada essa inferência**: testes importam script de restauração isolada já existente. Limitação do backup de UI permanece |
| A04, fallback EXPUNGE amplo sem UIDPLUS | **Rejeitado**: pode apagar mensagens marcadas por outro cliente. Preservar recusa explícita |

Bases oficiais utilizadas para o confronto: [Tokio spawn_blocking e cancelamento](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html), [SQLite FTS5/BM25](https://www.sqlite.org/fts5.html#the_bm25_function), [SQLite Backup API](https://www.sqlite.org/backup.html), [W3C CSP, múltiplas políticas e meta](https://www.w3.org/TR/CSP2/), [testes Tauri](https://v2.tauri.app/develop/tests/). Inferências sobre o comportamento deste aplicativo dependem também do código observado; a documentação, sozinha, não comprova sua execução.

## F. Compatibilidade multiplataforma e CI

| Destino | Controles presentes | O que ainda exige execução nativa |
|---|---|---|
| Linux x64 | DEB/RPM, identidade/recursos/AppStream, dependências de secret-tool, rpm/cpio/bsdtar; sem serviço automático anunciado | Instalação, keyring desbloqueado, ícone e controles completos em WebKitGTK/escala real |
| Windows x64 | Executável GUI, subprocessos sem console, UTF-8 explícito, versão MSI numérica monotônica 0.8.300, NSIS/MSI | Build/instalação/WebView2, cofre Unicode real e políticas corporativas PowerShell; não contornar política |
| macOS Intel | APP/DMG e zip via ditto, arquitetura inspecionada, Security.framework | Build/GUI/Keychain, Gatekeeper; assinatura/notarização não fornecidas |
| macOS ARM64 | Mesmo contrato, alvo ARM64 separado | Build/GUI/Keychain/arquitetura real; não confundir com teste Intel |

Rust 1.99.0, Tauri CLI 2.12.4 e Cargo.lock fixados. Workflows ativos somente manuais, com fmt/check/test/Clippy e inspeção de todos os formatos antes do upload, mantendo logs de falha. O script público é `scripts/build-0.8.3.py`. Sem Git também se compila a fonte extraída. Não houve execução remota de Actions ou publicação nesta tarefa.

O teste de renderer usa os componentes reais com IPC sintético. É útil para layout e comportamento, mas Chromium não substitui WebKitGTK, WebView2 e WKWebView. A matriz de SOs é requisito de homologação pendente, não selo de garantia decorrente de uma análise local. Guia de compilação: `GUIA_0.8.3.md`.

## G. Plano de correção e aceitação

1. Fila, credenciais e isolamento: C01/C04/C06/C08, preservando revisão explícita de resultados SMTP/APPEND incertos.
2. Consentimento e ações destrutivas: T01/C07; corrigir C10/C11/C12 e manter política de UIDPLUS.
3. Responsividade localizada: P02/P03/P08/P10/P13; limitar ingestão P15, corrigir ranking C14 e deduplicar P14.
4. UX: navegação por tarefa, busca de configurações, conexão de IA antes do modelo, privacidade visível, nomes de pasta e formatação Unicode; rótulo honesto da exportação.
5. Distribuição: versão 0.8.3 em todas as coordenadas, guias de quatro destinos, pacote limpo com manifesto e dupla verificação.
6. Trabalho posterior explicitamente proposto: cursor/índices/FTS/lote de sessão/IDLE/reuso SQLite e cofre nativo Windows. Cada mudança requer baseline e testes antes de prometer benefício.

Critérios de aceitação: zero envio após cancelamento aceito; zero carga remota pelo fragmento não autorizado; nenhum cache cruzado entre contas; segredo anterior preservado em falha de banco; nenhuma perda de ID IMAP pela tradução do nome; falha parcial visível; nenhum controle maior que seu contêiner na matriz executada. Falhas nativas não executadas permanecem pendentes.

## H. Três rodadas e dupla revalidação

**Rodada 1, investigação independente:** dois agentes examinaram desempenho e integridade antes de confrontar a auditoria externa. A análise foi somente leitura, sem build, instalação ou benchmark. Foram encontrados os mecanismos registrados em B/C e o caminho de citação T01.

**Rodada 2, contestação:** o coordenador confrontou as conclusões com fonte canônica, schemas, caminhos de chamada e documentação oficial. Foram refutadas as inferências sobre gatilhos automáticos, colisão literal no mesmo DB, CSP do leitor e ausência absoluta do script de restauração. A troca para EXPUNGE amplo foi rejeitada. Não se aceitou reduzir durabilidade ou aumentar concorrência indiscriminadamente.

**Rodada 3, revalidação estática:** reabertura dos pontos críticos, verificação da fronteira conta/conteúdo/cache, claim entre processos, papéis/UIDVALIDITY e falhas do cofre. Os relatórios independentes preservam as conclusões anteriores à implementação. Depois dessa fase foi retomada a implementação da entrega 0.8.3 solicitada diretamente pelo usuário.

**Revalidação I, depois das correções:** executar contratos de fonte e testes comportamentais/Rust, Unicode integral, mocks de falha e renderer. Guardas não devem ser relaxadas só para passar. Teste estático PASS não equivale a homologação.

**Revalidação II, depois do congelamento:** compilar a fonte final Linux, inspecionar DEB/RPM reais, conferir a fonte novamente após extrair o ZIP e testar a primeira execução em perfil temporário. Registrar os resultados efetivos no documento `VALIDACAO_0.8.3.md` e nos logs. Windows/macOS/provedores reais permanecem pendentes até execução identificada por manifesto. Nenhum resultado desta seção é presumido por existir um script.

## I. Evolução futura

Preservar o núcleo de e-mail gratuito, local e independente de IA. ProviderRouter já fornece separação útil; novas integrações devem ter inicialização tardia, cancelamento, limites e permissão explícita por conteúdo. Priorizar módulos de domínio e serviços com interfaces pequenas antes de novos conectores. Cache precisa revisão e invalidação; serviços precisam encerramento previsível. Não implementar cobrança, créditos, CRM ou relay nesta entrega. O endereço oficial foi alinhado ao requisito fornecido: `https://thecreativesolver.com/tcsmail/`; o site externo não foi auditado.
