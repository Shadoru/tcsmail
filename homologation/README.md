# Homologação final — TCS Mail 0.8

`./scripts/homologate-0.7.sh` executa a Parte 49 sem alterar o perfil normal do usuário. O candidato é copiado para uma área temporária, os testes são executados sobre essa cópia e um `homologation-result.json` é criado.

## Para homologação integral

Além das dependências de build, configure uma conta de e-mail exclusiva de testes no ambiente:

- `TCS_HOMO_MAIL_EMAIL`
- `TCS_HOMO_MAIL_USERNAME`
- `TCS_HOMO_MAIL_PASSWORD`
- `TCS_HOMO_IMAP_HOST`, `TCS_HOMO_IMAP_PORT` (padrão 993)
- `TCS_HOMO_SMTP_HOST`, `TCS_HOMO_SMTP_PORT` (padrão 587)
- `TCS_HOMO_SMTP_SECURITY` = `starttls`, `tls` ou `plain`

A ausência dessas variáveis deixa o gate real IMAP/SMTP em `BLOCKED`, portanto a release não recebe PASS final.

## LLMs

LLMs locais são opcionais e servem somente para diagnóstico de uma falha. Elas não concedem PASS e não modificam o candidato. Correções devem gerar um novo candidato e reiniciar a homologação.
