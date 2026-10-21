# TCS Mail 0.8.2-h4-fix1 — Correção OAuth Loopback

## Evidência fornecida pela estação

O gate `cargo test --locked --workspace --lib` parou em
`google_oauth_loopback_tests::unrelated_loopback_request_does_not_cancel_valid_callback`,
com 6 testes aprovados e 1 falho no binário `tcs-mail --lib`.
O teste recebe `GET /favicon.ico` antes de `GET /?code=auth-code&state=good-state`.

## Causa comprovada por inspeção

`parse_loopback_callback()` rejeita caminhos diferentes de `/` com
`Callback OAuth inválido`. O servidor `wait_google_loopback_with_timeout()`
antes encerrava a autorização no primeiro erro de caminho, inclusive um
`/favicon.ico` legítimo enviado automaticamente pelo navegador. Com o
listener encerrado, a segunda conexão recebe `Connection refused`.

## Implementação delimitada

- Apenas `src-tauri/src/lib.rs` muda entre a h4 e a h4-fix1 no código da aplicação.
- A função de callback HTTP agora envia uma resposta 400 e *continua aguardando*
  quando recebe um caminho diferente de `/` ou `/?...`.
- `parse_loopback_callback()` permanece **inalterada**. Em `/`, continuam
  obrigatórias a validação de `state` e a rejeição de parâmetros repetidos ou
  ambíguos. O fluxo do token, PKCE e armazenamento seguro não são alterados.
- O teste original permanece. Dois novos testes exigem que `/favicon.ico`
  com parâmetros OAuth falsos não autorize e que duplicidade em `/` continue
  recusada (falha fechada).

## Verificações e limites

Os testes JavaScript, contratos h4, auditoria de fonte, Bash e manifesto
SHA-256 são verificados antes da entrega. **Rust/Cargo não estão disponíveis
no ambiente da preparação**, logo não foi possível executar `cargo test`
nem compilar este pacote aqui. Esses passos continuam OBRIGATÓRIOS no
instalador Linux; o executável só é substituído quando passam.

Não são alterados o banco SQLite, mensagens, contas, identidades, credenciais,
frontend, dependências de rede ou mecanismos de envio.

## Revalidação após instalação

1. Confirmar que `cargo test --locked --workspace --lib -j 2` passa, com
   `google_oauth_loopback_tests` sem falhas.
2. Confirmar que `cargo check` e `cargo build --release` passam.
3. Abrir o app e testar conexões existentes; opcionalmente, com autorização
   válida, testar nova conexão/reconexão Google no navegador.
4. Se algum teste falhar, não substituir o binário; preservar o log completo.

## Cache e limpeza

Reutiliza o `target/` já compilado no diretório da h4 quando disponível.
Somente após sucesso tenta mover o cache, sem copiá-lo, para
`~/Projetos/.tcs-mail-cargo-target` e excluir a fonte h4 se idêntica ao
manifesto original, sem arquivos adicionais nem links simbólicos. Nunca
exclui dados pessoais ou uma fonte modificada pelo usuário.
