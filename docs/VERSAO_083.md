# Migração de release — TCS Mail 0.8.3

A versão pública obrigatória passou de `0.8.2-rc8-fix1` para **0.8.3** na
mesma árvore de trabalho. A pasta-raiz conserva o nome anterior enquanto houver
agentes ativos. Não houve commit, push ou publicação nesta migração.

| Coordenada | Valor exigido |
|---|---|
| Cargo dos três pacotes e Cargo.lock | `0.8.3` |
| Tauri e AppStream | `0.8.3` |
| MSI/WiX | `0.8.300` (maior que `0.8.209`) |
| RPM Version / Release | `0.8.3` / `1` |
| Identidade persistida | `com.thecreativesolver.TCSMail` |
| Nome do produto / executável | `TCS Mail` / `tcs-mail` |
| Homepage | `https://thecreativesolver.com/tcsmail/` |
| Rust / Tauri CLI | `1.99.0` / `2.12.4` |

As versões de dependências externas no lockfile não foram atualizadas por esta
migração. A alteração preexistente de `tauri-build` com `features = []` foi
preservada. A arte raster aprovada e seu manifesto de origem RC8 não foram
alterados nem apresentados como arte nova.

## Entradas atuais

- `python3 scripts/build-0.8.3.py`: gates de fonte, fmt/check/test/Clippy
  bloqueantes e locked, bundles nativos e inspeção dos pacotes.
- `python3 scripts/build-0.8.3.py --gates-only`: somente gates de fonte.
- `GUIA_0.8.3.md`: ferramentas isoladas, pré-requisitos e comandos por sistema.
- Helpers ativos: `v083_release.py`, `v083_packages.py`, `v083-regression.py`,
  `v083-utf8.py`, `v083-linux-runtime.py` em `scripts/quality/`.
- O caminho antigo `scripts/build-rc8fix1.py` permanece como wrapper de
  compatibilidade para o mesmo orquestrador atual, sem remover verificações.
- Testes comportamentais com nomes RC7/RC8 permanecem quando seus contratos
  ainda são atuais. Renomear esses testes não é condição para comprovar 0.8.3.

As referências dos workflows ativos apontam para o novo build. O renderer
manual passou a `v083-renderer.yml`, mantendo Playwright 1.58.2 instalado em
pasta temporária, quatro runners e Bash explícito. Os pins existentes de
Actions, Rust 1.99.0 e Tauri CLI 2.12.4 foram preservados.

## Preservação dos gates

Os guards exigem a versão estável exata, a homepage nova, MSI 0.8.300, release
RPM 1, identidade original, ícones e metadados reais. As fixtures negativas
continuam recusando versões RC anteriores, homepage antiga, identidade alterada,
versões/release RPM antigas, duplicatas e artefatos vazios. O scanner inclui
texto próprio e vendorizado e funciona em fonte extraída sem `.git`.

Novos gates de estágio serão coordenados com o agente principal nas listas
`PYTHON_GATES` e `NODE_GATES` do orquestrador atual. Mudanças em implementação
de frontend, `src-tauri/src/lib.rs` e core pertencem aos demais agentes; esta
migração não as altera. O relatório `AUDITORIA_0.8.3.md` pertence ao agente
principal e não é substituído por este registro.

## Ubuntu e runtime

CI Ubuntu e guia incluem **libarchive-tools** (`bsdtar`) e
**libsecret-tools** (`secret-tool`), além de rpm/rpm2cpio/cpio e AppStream.

Há evidência anterior de `rpm2cpio` retornando 1 com stdout válido. O fallback
`bsdtar` deve ser executado e o payload real 0.8.3 inspecionado antes da entrega.
Essa comprovação continua **pendente**; presença de ferramenta ou teste mock
não equivale à inspeção de um pacote real.

O build Linux verifica comandos necessários por
`v083-linux-runtime.py --check-prerequisites`. O teste de cofre
`--verify-secret-store` exige sessão gráfica com Secret Service desbloqueado e
usa somente credencial Unicode sintética de escopo aleatório, removida ao final.
A verificação real desse runtime foi executada nesta sessão: **PASS** para
store/lookup/clear de credencial Unicode sintética; nenhum valor foi registrado
e nenhuma credencial existente foi consultada. Isso comprova o Secret Service
desta sessão Linux, não os cofres Windows/macOS ou outros desktops.

## Evidências 0.8.3

- O agente principal informou fmt e `cargo check --locked --workspace --all-targets`
  nativos x64 aprovados durante esta fase. Não são uma nova compilação independente
  feita pelo responsável por versão/release.
- Gates de fonte da migração: **PASS** após autorização do agente principal;
  prova `.build-v083/20261103T015447Z-26ba81e2/result.json`. A suíte inclui
  14 testes de infraestrutura/runtime sintético e preserva os contratos ativos.
- Os três workflows foram analisados como YAML, com quatro runners em cada
  matriz, e os metadados exatos de release foram conferidos.
- `v083-linux-runtime.py --verify-secret-store`: **PASS** real nesta sessão Linux.
- `v083-linux-runtime.py --check-prerequisites`: **FAIL** local por ausência de
  `rpm`, `rpm2cpio` e `bsdtar`. Dependências adicionadas ao CI/guia, sem instalação
  automática no computador durante esta migração.
- Build final, DEB/RPM 0.8.3 e extração por fallback: pendentes de coordenação;
  evitar builds pesados simultâneos.
- Windows x64, macOS Intel e ARM64 nativos, instalação/GUI e provedores reais:
  permanecem pendentes até prova correspondente. Versão estável ou Actions verde
  não substituem testes nativos.

Os resultados da RC8 fix1 em `AUDITORIA_RC8_FIX1.md` são histórico da fonte
anterior; não devem ser citados como homologação dos novos binários 0.8.3.

## Fonte extraída e trabalho concorrente

A tentativa de revalidar a cópia sem `.git` em
`/tmp/tcs-v083-source-zip-s7wonay4/TCS-Mail-0.8.3` capturou uma alteração
concorrente ainda inválida de `frontend/main.js:429` (`sidebarContentHtml`). O
gate de sintaxe reprovou corretamente. Nenhuma alteração em frontend foi feita
pelo responsável por release. A comprovação completa do ZIP 0.8.3 deve ser
repetida depois da estabilização e integração dos gates de estágio, sem
reaproveitar como prova o PASS anterior da RC8 fix1.

## Integração dos estágios e estado mais recente

`reader-config-083.test.mjs` foi incluído em `NODE_GATES` e na verificação de
preservação dos gates, portanto roda nos quatro destinos de CI. A execução
inicial aprovou 13/17 casos e reprovou quatro: P03 (corpo em cache vazio antes
da hidratação) e três casos de configuração com mock DOM sem `prepend`.
Os testes e sua implementação pertencem ao agente de leitor/configuração;
não foram enfraquecidos nem corrigidos pelo responsável por versão.

O PASS completo em `20261103T015447Z-26ba81e2` antecede essas mudanças
concorrentes e a integração do novo gate. Assim, a aprovação final de todos os
gates de fonte, da fonte ZIP e dos bundles **continua pendente**. O agente
principal foi avisado dos erros concretos e dos caminhos públicos novos.

Referências de UI ainda fora desta propriedade durante a revisão:
`frontend/views.js` (badge Release Candidate e homepage antiga na página Sobre)
e `tests/ui/rc8fix1-settings.js` (versão da fixture anterior). Foram encaminhadas
ao agente principal, sem alteração desses arquivos por esta migração.

## Arquivos desta migração

- Metadados: os três Cargo.toml de pacote, Cargo.lock, tauri.conf.json e AppStream.
- Build: novo `scripts/build-0.8.3.py`, wrapper `scripts/build-rc8fix1.py`, helpers
  `v083_*` / `v083-*`, package guard e regressões ativas de versão/apresentação.
- Workflows: `tcsmail-homologacao.yml`, `imap-cross-platform.yml`,
  `v083-renderer.yml`; quatro destinos e pins preservados.
- Dependências: `scripts/check-deps.sh`, CI Ubuntu e guia incluem bsdtar e
  secret-tool pelos pacotes libarchive-tools/libsecret-tools.
- Documentação: README.md, AGENTS.md, novo GUIA_0.8.3.md e este registro.
- `.gitignore`: nova pasta de evidências `.build-v083/`; saídas anteriores
  continuam excluídas sem limpeza ou renomeação de dados.

## Revalidação dos gates antes do congelamento

Após a integração dos agentes, `python3 scripts/build-0.8.3.py --gates-only`
passou integralmente em **20261103T020030Z-66427e35**; prova em
`.build-v083/20261103T020030Z-66427e35/result.json`. Os gates novos
`reader-config-083.test.mjs` e `rc083-responsiveness.test.mjs` estão incluídos no
orquestrador e na regressão que exige sua presença.

A execução direta conjunta `node --test scripts/quality/reader-config-083.test.mjs scripts/quality/rc083-responsiveness.test.mjs`
aprovou **38/38 casos** (18 leitor/configuração e 20 responsividade). As falhas
anteriores descritas acima não reapareceram nesta execução. Isso atualiza o
estado dos gates de fonte, sem alterar as pendências de bundles, cópia final e
validação nativa de outros sistemas.

`VALIDACAO_0.8.3.md` foi acrescentado à lista explícita de documentos permitidos
na raiz. `AUDITORIA_0.8.3.md` e o conteúdo de validação final permanecem sob
responsabilidade do agente principal; não foram auditados nem editados por esta
revalidação. A cópia real final com nome 0.8.3 aguarda o término dos agentes.
