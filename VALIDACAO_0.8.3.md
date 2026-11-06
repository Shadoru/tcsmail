# TCS Mail 0.8.3 — evidências de validação

Data local: 02/11/2026, America/Sao_Paulo. Logs usam UTC e podem indicar 03/11.

## Resultados executados

- Rust 1.99.0: fmt, check locked de todo workspace/all-targets, **125 testes aprovados** (19 IA, 85 core, 21 aplicativo) e Clippy com warnings bloqueantes no alvo Linux x64.
- Gates de fonte atuais aprovados: versões 0.8.3/MSI 0.8.300/RPM 0.8.3-1, identidade preservada, manifesto de arte, UTF-8, OAuth sintético, nomes/IDs IMAP e contratos comportamentais.
- Scanner antes do empacotamento: 270 arquivos de texto, 242 próprios e 28 vendorizados; todos decodificados explicitamente como UTF-8. O inventário final do ZIP pode diferir por excluir documentação histórica e incluir este registro.
- Renderer Chromium: **1008 combinações** de telas de configuração, tema, tamanho e idioma aprovadas; nenhum erro JavaScript. Detalhes expandidos e popups selecionados também verificados. Pixel sintético não foi carregado pelo fragmento sanitizado do compositor.
- **First Run no navegador**: perfil sem contas; não permite avançar sem conta; preferências preservadas ao voltar; falha de gravação mantém pendência; nova tentativa conclui corretamente.
- **First Run nativo Linux**: binário 0.8.3 aberto em Xvfb/DBus com diretório de dados novo e temporário. Permaneceu aberto por 30 segundos; captura examinada mostra a etapa Contas renderizada e botão de continuação desabilitado sem conta. Não houve cadastro ou envio real.
- Comparativo visual: 24 pares de capturas dos componentes RC8 canônicos e candidato 0.8.3 com IPC sintético; nenhum erro de página. São capturas reais do renderer, não desenhos de intenção.

## Rastreabilidade e falhas corrigidas na validação

Execução completa principal: `.build-v083/20261103T021531Z-8b81fe31/`. Os logs anteriores foram preservados como evidência de falha, não apresentados como sucesso. Uma passagem foi reprovada por formatação no teste de cache; outra encontrou expectativa incorreta do teste sobre o retorno de add_source. Ambas foram corrigidas antes da passagem atual.

A compilação de bundles e sua inspeção recebem registro complementar abaixo somente após terminarem. O manifesto externo identifica os bytes finais da fonte. A base Git não substitui o manifesto, pois o trabalho contém alterações locais.

## Limites e pendências

**Windows x64, macOS Intel e macOS ARM64 não foram compilados nem executados nesta máquina.** Workflows manuais e guias foram preparados; isso não equivale a homologação. Também permanecem pendentes Gmail/Microsoft/IMAP genérico reais, OAuth com navegador/provedor real, cofres nativos em todos os destinos, instalação/ícones/alta escala, assinatura/notarização macOS e benchmark comparativo.

O teste Linux em tela virtual teve avisos de portal/Secret Service e EGL próprios do ambiente. A tela foi efetivamente inspecionada; o aviso de cofre impede alegar validação de credenciais reais. O fluxo simulado testa falhas, mas não substitui Secret Service/Keychain/Credential Manager reais.

Não se promete “100% livre de defeitos” ou apresentação perfeita em todo SO. O inventário UTF-8 integral detecta padrões e limites de codificação; dados recebidos de servidores ainda podem ser malformados. Nomes de pasta são tratados para apresentação sem alterar o identificador enviado ao servidor.

O relatório independente e a revisão cruzada inicial foram concluídos. Revisões adicionais dos últimos ajustes por agentes não terminaram; o coordenador fez a revalidação local e registrou os testes efetivamente executados. Nenhuma revisão incompleta foi contada como aprovação independente.

## Fechamento dos pacotes e da fonte

- DEB `TCS Mail_0.8.3_amd64.deb`: compilado com sucesso, aproximadamente 5,91 MiB.
- RPM `TCS Mail-0.8.3-1.x86_64.rpm`: compilado com sucesso, aproximadamente 5,88 MiB.
- Inspeção real de ambos aprovada: versão embutida, entrada desktop visível, quatro resoluções oficiais de ícones e AppStream válido. O ZIP Linux inspecionado tem SHA-256 `b28bc183b9f0473839ddf84ac8115507fb78cf23b9055293999225f5ad036e39`.
- As ferramentas RPM foram usadas em diretório temporário isolado. A consulta imprimiu aviso sobre não poder abrir o banco RPM do usuário; retornou sucesso e a inspeção efetiva dos arquivos aprovou os dois pacotes. Isso não representa teste de instalação.
- O processo completo foi interrompido durante o segundo bundle, após fmt/check/test/Clippy e DEB aprovados. O RPM foi retomado em comando separado, concluído em 1 min 27 s; o guard de pacotes foi executado depois e passou. **Não se declara uma execução única integral do orquestrador como verde.**
- Fonte pública: 281 arquivos, sem `.git`, caches, target, instaladores internos ou documentação histórica de entrega. A primeira extração do ZIP passou em todos os gates sem Git; scanner dessa extração: 268 textos, 240 próprios e 28 vendorizados. O manifesto externo e SHA256SUMS identificam a edição final dos documentos.

A entrega contém scripts e guias para executar a mesma validação nos demais destinos; seus resultados continuam pendentes conforme a matriz acima. Os registros finais prevalecem sobre notas de andamento em relatórios auxiliares.
