# TCS Mail h5-imapfix1 — Auditoria especializada e portabilidade

**Base preservada:** h5 íntegra. **Escopo:** atualização da segurança das rotas de UID remoto e da verificabilidade da migração, sem alteração deliberada de OAuth, SMTP, frontend, SQLite nem sincronização já protegida.

## Natureza das revisões

Estas são **seis perspectivas técnicas distintas de revisão conduzidas pelo assistente**, não seis profissionais humanos independentes nem seis agentes externos verificavelmente isolados. O objetivo é reduzir pontos cegos; nenhum processo de análise substitui testes reais em sistemas operacionais diferentes.

| Perspectiva | Achado confirmado ou risco | Decisão e contraprova | Impacto |
|---|---|---|---|
| 1. Documentação oficial e protocolos IMAP | O trio `pasta/UIDVALIDITY/UID` forma a identidade remota. `read_raw_by_uid` e `fetch_reply_to` não exigiam epoch. | Trocar APIs sem epoch por `*_if_epoch`, comparar `EXAMINE` antes de `UID FETCH`, rejeitar epoch 0/ausente/alterada. | Impede usar UID antigo para obter conteúdo de outra mensagem. |
| 2. Arquitetura Rust assíncrona | Ler banco antes da trava por conta admite mudança local durante espera. | Dupla checagem da identidade do registro e epoch sob coordenação por conta, antes do login/FETCH. | Evita que mudança concorrente escape à verificação inicial. |
| 3. Segurança e testes adversariais | Fonte RFC822, anexo EML, exportação EML/MBOX e Reply-To eram pontos de reuso de UID sem epoch. | Todas cinco rotas recebem epoch explícita; regressões negativas verificam remoção de checagens. | Previne exportar mensagens erradas e endereçar respostas a outra pessoa. |
| 4. Operação e persistência | Exportação MBOX deve manter streaming e nunca tocar destino final após falha. | Preservado arquivo temporário, sync e descarte na falha; protegida identidade da pasta em lote. | Mantém integridade e limita consumo de RAM. |
| 5. Experiência de usuários avançados (fóruns Reddit/Thunderbird) | Há relatos de mensagens invisíveis/demoradas após movimentação e de lentidão de IMAP. Eles NÃO provam defeitos específicos do TCS. | Priorizados testes com reconciliação lenta, mudança de UIDVALIDITY e redes diferentes; nenhuma política de retry destrutivo adicionada. | Melhora critérios de homologação sem extrapolar relatos comunitários. |
| 6. Portabilidade Tauri Linux/Windows/macOS | `async_mail` usa Tokio/TLS multiplataforma, mas o instalador Bash é Linux e testes nativos não tinham matriz automatizada. | Workflow CI nativo com check/test/build em três SOs e documentação de pré-requisitos; Bash continua somente no Linux. | Ajuda detectar diferenças de compilação e de integração, sem inventar testes já executados. |

### Confronto da primeira rodada

- Proposta insegura rejeitada: ignorar UIDVALIDITY quando indisponível para manter exportação sempre disponível.
- Proposta insegura rejeitada: substituir `MOVE` por `COPY + EXPUNGE` genérico. Preservada falha explícita em servidores sem extensão MOVE; precisa de homologação específica.
- Proposta incompleta rejeitada: validar a epoch **somente** antes de aguardar a coordenação por conta. Mantida confirmação após aquisição do permit.
- Proposta sem evidência rejeitada: considerar verificadores históricos antigos como PASSED sem confrontar seus contratos com as funções renomeadas.

### Segunda revalidação

- Funções novas checam UID=0 e epoch=0, obtêm `EXAMINE`, comparam a epoch remota e só depois enviam `UID FETCH`.
- `reply_context`: erro de epoch torna a verificação de Reply-To incerta, preservando alerta de conferência do destinatário em vez de usar endereço potencialmente incorreto.
- Fonte, anexação EML, exportação EML e MBOX: erro de epoch aborta a operação. MBOX mantém arquivo temporário e não publica exportação parcial.
- 29 testes históricos recuperados do pacote canônico de migração; contratos desatualizados reconciliados com a API pós-migração. 30 gates Python no instalador, **30 PASS** neste ambiente.
- Código vendorizado: 28 arquivos existentes da async-imap coincidem byte a byte com arquivos correspondentes do pacote anterior do projeto. **A equivalência com o crate oficial publicada não foi provada.**
- O código antigo preservado não foi compilado neste ambiente por falta de Cargo/rustc. Testes Rust de protocolo adicionados, mas **não executados**.

## Atestações de execução — não confundir

- **PASS executado:** inspeção de inventário de arquivos e sintaxe JS/Bash/JSON/TOML; 30 contratos Python; scripts frontend JS; hashes do pacote.
- **A executar na estação Linux:** cargo test --locked --workspace --lib; cargo check --locked --workspace --all-targets; cargo build --release --locked.
- **A executar em CI nativo Windows/macOS:** mesma sequência Rust; workflow `.github/workflows/imap-cross-platform.yml` adicionado mas não executado.
- **A executar com servidores descartáveis:** TLS, STARTTLS, OAuth sem dados pessoais, UIDVALIDITY trocada, troca de pastas, UIDPLUS e MOVE disponíveis/ausentes, anexos grandes, falha durante FETCH, recuperação offline, APPEND ambíguo.
- **Pendente:** prova formal de ausência absoluta de bugs, autenticidade bit-a-bit em relação a crates.io e verificação real do runtime Tauri em todos os SOs.

## Mudanças de fonte

1. `crates/tcs-core/src/async_mail.rs`: funções genéricas `fetch_reply_to_if_epoch<T>` e `read_raw_by_uid_if_epoch<T>`, sem fallback inseguro; fixtures TCP de Rust.
2. `src-tauri/src/lib.rs`: verificação dupla de identidade local e UIDVALIDITY em cinco rotas consumidoras (Reply-To, fonte RFC822, anexação EML, EML export, MBOX export).
3. `scripts/quality/`: recuperar verificadores, reparar expectativas obsoletas e gates de regressão negativa; runner seguro que não executa `cargo fmt` mutante.
4. `scripts/install.sh`: gates de migração bloqueantes antes de testes/compilação; somente instala após sucesso; cache reutilizado.
5. `.github/workflows/imap-cross-platform.yml`: executável de CI para três SOs (não executado aqui).

## Leituras públicas

- RFC 9051 (identidade por UIDVALIDITY): https://www.rfc-editor.org/rfc/rfc9051.html
- RFC 6851 (extensão MOVE): https://www.rfc-editor.org/rfc/rfc6851.html
- Documentação async-imap: https://docs.rs/async-imap/
- Tauri pré-requisitos por plataforma: https://v2.tauri.app/start/prerequisites/
- Tauri Windows Installer: https://v2.tauri.app/distribute/windows-installer/
- Reddit, atraso em movimentação: https://www.reddit.com/r/Thunderbird/comments/1ikplvv/
- Reddit, lentidão em IMAP: https://www.reddit.com/r/Thunderbird/comments/1td6fuv/

**Decisão:** fonte candidata à homologação com gates locais aprovados; não confundir com homologação nativa integral concluída.
