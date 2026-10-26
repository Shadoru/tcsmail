# RC7 — Referências externas e correspondência integral pendentes

No último resultado do chat **Questionamentos diversos** foi mencionado o arquivo `TCS_Mail_First_Run_RC6_R3.zip` (há também variação de título `TCS_First_Run_First_Run_RC6_R3.zip`) com `docs/PROMPT_IMPLEMENTACAO_RC6.md`, `docs/AUDITORIA_EXTENDIDA.md`, quatro mockups e `prototype/index.html`.

Esses arquivos **não estavam acessíveis em bytes** na sessão em que a RC7 foi criada. Foram recuperadas apenas as seguintes características da resposta anterior:
- first run em **duas etapas na mesma janela**;
- etapa 1 com benefícios explicados, endereço único, autodetecção Gmail/Microsoft OAuth/IMAP/SMTP, configuração manual, restauração e adição sucessiva de contas;
- etapa 2 reutiliza temas reais da RC6, notificações ativas e compositor integrado por padrão;
- revisão anterior havia enumerado 36 riscos e executado 31 verificações estáticas, sem inspeção do código RC6.

Esta RC7 **não pode ser atestada como implementação de 100%** do prompt e dos arquivos não acessíveis. A restauração transacional de perfil é um bloqueio conhecido: a interface traz orientação conservadora, não um importador falso. Para homologar integralmente, obtenha o ZIP original da conversa e compare requisito por requisito com o código da RC7.

Não foi possível realizar builds Rust, testar os quatro executáveis nativos ou IMAP/OAuth real neste ambiente.

Atualização desta consolidação: os três benefícios com descrições bilíngues e seis temas com prévias selecionáveis foram incorporados à interface; a correspondência visual com os PNG/SVG/mockups originais **não foi homologada**. Os ícones de instalação permanecem os da RC6.
