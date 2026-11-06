# Correções de integridade da fila — 0.8.3

## Escopo e origem

Implementação na mesma árvore `TCS-Mail-0.8.2-rc8-fix1`, sem renomeá-la.
Base Git inspecionada: `228ad458e61bf590e5452ed869565a69815b1a45`.
A árvore já continha alterações concorrentes da entrega; este relatório não
atribui essas alterações ao trabalho da fila.

Referência: `TCS Mail 0.8.2-RC8 — Auditoria estática independente.md`, lida
localmente em Downloads. SHA-256 dos bytes consultados:
`2fb92199e1e89b12bc6f646ded255111ff4d8ed42fd89228c0b23324fe058800`.
Achados tratados: C-01, C-08, C-15 e, por extensão explícita posterior, A-24.

Arquivos desta correção:

- `crates/tcs-core/src/outbound.rs`: implementação e testes da fila.
- `crates/tcs-core/src/store.rs`: propagação de erros da página, backup pré-migração
  e testes relacionados.
- `crates/tcs-core/src/db.rs`: backup consistente pré-migração e teste de WAL.
- Este relatório.

Não foram alterados por este trabalho frontend, `lib.rs`, fontes, cofre de
credenciais, manifestos de versão ou arquivos de publicação. A atualização dos
manifestos para 0.8.3 pertence ao agente principal.

## Confronto e consenso

Foram realizadas duas perspectivas sequenciais pelo mesmo agente, implementação
e revisão adversarial. Não se apresentam como revisão humana ou agentes
independentes adicionais. A auditoria externa é a referência independente lida.

1. Um mutex local não protege outro processo nem o comando de cancelamento.
   Consenso: o ponto de decisão é um UPDATE condicional no SQLite, com exatamente
   uma linha afetada antes de chamar SMTP.
2. Reivindicar antes da preparação impediria cancelar enquanto JSON, conta e
   credencial são preparados. Consenso: preparar primeiro, sem transação de escrita
   aberta; reivindicar imediatamente antes do envio. O claim compara estado,
   conta, JSON e prazos atuais. Cancelamento, alteração ou reagendamento vencem
   contra uma preparação obsoleta.
3. Uma falha tardia da preparação também pode competir com cancelamento ou claim
   de outro processo. Consenso: a gravação dessa falha usa as mesmas condições de
   identidade/elegibilidade e não sobrescreve o vencedor.
4. Uma falha SMTP ou encerramento após claim não prova rejeição da mensagem.
   Consenso: não renovar automaticamente `sending` nem repetir `failed` por tempo
   decorrido. Sem lease que force novo envio; revisão explícita continua necessária.
5. Retornar erro antes de tirar um item defeituoso da seleção mantém a primeira
   conta bloqueando as demais. Consenso: persistir `failed`/`needs_auth`, retornar
   progresso e permitir que a próxima chamada processe outro item.
6. Checkpoint não é condição suficiente para copiar somente `.db` quando há WAL.
   Consenso: usar `Connection::backup(DatabaseName::Main, destino, None)`, que
   inclui páginas confirmadas do WAL; propagar falha e interromper a migração.

## Alterações e invariantes

### C-01: cancelamento e claim

- `cancel()` confirma a quantidade de linhas alteradas. Zero linhas só é sucesso
  se a consulta posterior comprovar que o estado já é `cancelled`.
- ID inexistente retorna erro; `sending` e outros estados não canceláveis também.
- O claim requer estado elegível, mesma conta e JSON, agendamento vencido e janela
  de desfazer encerrada. Apenas o vencedor incrementa `attempts` e chama SMTP.
- Perder a disputa encerra o processamento daquele snapshot sem executar SMTP.
- `sending` permanece fora da seleção, inclusive após reabrir a base. Não é
  convertido automaticamente para `queued` nem classificado como falha enquanto
  outro processo pode estar enviando.

### C-08: falhas de preparação

- JSON inválido, conta ausente/ilegível e endereços inválidos/ausentes produzem
  `failed`; falha ou credencial vazia produz `needs_auth`.
- Remetente com fallback da conta, Reply-To, Para, Cc e Cco são validados antes
  do claim. O contrato existente de listas de endereços é reutilizado.
- Falhas pré-envio não incrementam `attempts`; não ficam elegíveis para o próximo
  ciclo. Estados e diagnóstico aparecem pela listagem de envios existente.
- Diagnósticos persistidos de preparação, SMTP e cópia em Enviados são categóricos:
  não incluem o JSON, corpo, destinatário, senha/token ou texto bruto do erro externo.
- Cancelar durante preparação prevalece tanto sobre sucesso quanto sobre erro
  tardio da obtenção de credencial.
- A falha SMTP conserva revisão manual e não é reenviada automaticamente. A cópia
  IMAP continua independente do SMTP e a quarentena de APPEND incerto foi preservada.

### C-15: página e total

`list_page_scoped` coleta `Result<Vec<_>, _>` e propaga linhas ilegíveis.
O COUNT também propaga erro em vez de inventar `total=items.len()`.
Consultas, filtros, paginação e ordenação foram preservados. Esta mudança não é
uma afirmação sobre todos os outros usos de `filter_map` do projeto.

### A-24: backup consistente de SQLite

As cópias diretas foram substituídas pela API de backup do SQLite em
`Database::backup` e `CoreStore::migrate_v10`. A dependência `rusqlite` já declara
o recurso `backup`; não houve alteração de dependências.

Preservados os nomes `mail.db.backup-{timestamp}` e
`mail.db.backup-0.8.0-{timestamp}`, com o mesmo formato de timestamp, e sem adicionar
callback de progresso. Não é mais necessário supor que o checkpoint esvaziou o
WAL. Uma falha do backup é propagada; não há fallback para cópia inconsistente.
Isso cobre o snapshot SQLite pré-migração, não constitui restauração completa de
credenciais, anexos ou outras bases.

## Reprodução anterior à correção

- Dois testes novos da fila foram executados contra a implementação anterior:
  ambos falharam. `cancel("missing")` retornou sucesso; JSON inválido fez o
  processamento retornar erro antes de registrar uma falha visível.
- O teste C-15 inseriu `subject=x'80'` numa base SQLite sintética. Antes da correção,
  a página retornou sucesso omitindo a linha; o teste falhou.
- A-24 foi reproduzido com SQLite sintético em WAL e um leitor mantendo snapshot
  antigo. A cópia simples do `.db` retornou zero linhas para uma tabela que já
  possuía uma linha confirmada; checkpoint PASSIVE informou `(0, 1, 0)`.
  Essa reprodução usou Python/SQLite para demonstrar a semântica de cópia; os testes
  Rust adicionados exercitam os dois caminhos reais de migração.

## Evidência de validação

Executado, sem builds de aplicação ou pacotes:

```sh
CARGO_HOME=/tmp/tcs-rc8fix1-cargo \
RUSTUP_HOME=/tmp/tcs-rc8fix1-review-rustup \
CARGO_TARGET_DIR=/tmp/tcs-rc8fix1-target \
CARGO_BUILD_JOBS=1 cargo test --locked -p tcs-core outbound:: -- --nocapture
```

Resultado: **18 testes passaram**, sem falhas. Inclui três contratos anteriores
de cópia em Enviados e regressões para:

- cancelamento antes/depois do claim e cancelamento reentrante;
- duas conexões SQLite competindo e apenas uma tentativa registrada;
- dois processos reais competindo sem compartilhar o mutex;
- sucesso/erro tardio da preparação após cancelamento;
- erro tardio que não sobrescreve claim de outro ator;
- reagendamento durante preparação;
- JSON, conta, credencial e endereços inválidos sem rede;
- uma conta com credencial indisponível não bloquear outra;
- erro SMTP sanitizado sem repetição automática;
- reabertura da base preservando a quarentena de `sending`.

O teste auxiliar de processo filho retorna sem ação no run normal; a regressão
pai o executa duas vezes com caminho de base sintética dedicado. As chamadas SMTP
dos testes de envio são substituídas localmente; a API pública também é exercitada
em falhas determinísticas sem rede. Não há consultas ao cofre real.

Formatação restrita aos arquivos autorizados e `git diff --check` passaram.
Toolchain do ambiente: Rust/Cargo 1.99.0.

**Pendente no próximo run principal:** execução pós-correção do teste C-15 e dos
dois testes Rust A-24, suite completa atualizada e Clippy. Nenhum build pesado
concorrente foi iniciado após a informação de que o agente principal estava
executando os testes. Não se declara homologação multiplataforma ou desempenho
medido com base nesses testes locais.

## Recuperação sem apagar dados

Em `needs_auth`, reconectar a conta resolve a credencial, mas não autoriza
reenfileiramento automático do item. Em `sending` interrompido, `failed` SMTP ou
cópia incerta, conferir a conta e Enviados antes de qualquer novo envio explícito.
Não limpar a fila nem redefinir estados por SQL para forçar nova tentativa.
Os registros, JSON e identificadores existentes foram preservados.
