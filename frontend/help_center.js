// TCS Mail: task-oriented, offline, keyboard-accessible help.
// Privacy: all searches remain local; article text contains no user data.
import {esc} from './lib.js';
import {getLocale} from './i18n.js';
export const GUIDES = {
 "pt-BR": [
  ["Primeiros passos","Configurar na primeira abertura","Conecte contas e selecione preferências em duas etapas na mesma janela.",[
    "Informe apenas seu e-mail e utilize a descoberta automática para Gmail, Microsoft ou IMAP/SMTP.",
    "Autorize OAuth no navegador quando for solicitado; nunca informe senha básica como substituto para OAuth obrigatório.",
    "Adicione contas sucessivas e avance para Preferências somente quando houver uma conta conectada.",
    "Escolha tema, notificações e compositor integrado ou em janela independente; os padrões são notificações ativas e compositor integrado.",
    "Clique Concluir para salvar as preferências e abrir a caixa de entrada.",
    "Ao voltar à etapa Contas, as preferências ainda não salvas são preservadas; a conclusão exige uma conta persistida.",
    "A importação automática de backup não está disponível nesta candidata: mantenha os arquivos e credenciais intactos."
   ],"Se quiser restaurar um perfil antigo, preserve seus dados e solicite o procedimento de restauração segura; não substitua o banco aberto."],
  [
   "Primeiros passos",
   "Adicionar uma conta de e-mail",
   "Configure IMAP, Gmail ou Microsoft sem substituir contas existentes.",
   [
    "Abra Configurações → Contas.",
    "Clique em Adicionar conta e informe o endereço completo.",
    "Confira os servidores sugeridos. Se forem diferentes dos informados pelo provedor, use a edição manual da conta.",
    "Conclua a autenticação ou informe a senha de aplicativo, quando exigida.",
    "Volte à Caixa de entrada e clique em Sincronizar."
   ],
   "Não utilize Detectar servidores para sobrescrever uma conta funcional sem conferir IMAP e SMTP."
  ],
  [
   "Primeiros passos",
   "Reconectar Gmail ou Microsoft",
   "Renove a autorização quando a sincronização parar.",
   [
    "Abra Configurações → Contas.",
    "Localize a conta marcada como OAuth.",
    "Clique em Reconectar.",
    "Conclua a autorização no navegador aberto pelo sistema.",
    "Volte ao TCS Mail e execute o diagnóstico da conta se persistir uma falha."
   ],
   "A integração Microsoft atualmente pode requerer que IMAP e SMTP AUTH estejam habilitados pelo administrador."
  ],
  [
   "Primeiros passos",
   "Corrigir falha de senha IMAP",
   "Resolva AUTHENTICATIONFAILED sem excluir mensagens.",
   [
    "Abra Configurações → Contas.",
    "Clique em Editar na conta IMAP/SMTP afetada.",
    "Confira endereço completo, nome de usuário, servidores, portas e TLS conforme seu provedor.",
    "Salve uma credencial válida somente se necessário.",
    "Abra Diagnóstico e avançado → Diagnóstico e execute Testar IMAP/SMTP."
   ],
   "A conexão TCP pode funcionar mesmo quando o servidor recusa autenticação."
  ],
  [
   "Mensagens",
   "Ler uma mensagem",
   "Abra a mensagem no painel de leitura.",
   [
    "Clique na Caixa de entrada ou escolha uma pasta.",
    "Clique uma vez sobre uma mensagem na coluna central.",
    "O conteúdo aparecerá na área de Leitura.",
    "Para abrir em janela separada, dê duplo clique (se configurado)."
   ],
   "Em Configurações → Leitura, escolha quando marcar automaticamente como lida."
  ],
  [
   "Mensagens",
   "Selecionar várias mensagens",
   "Use Ctrl, Shift, caixas de seleção e atalhos.",
   [
    "Clique na primeira mensagem.",
    "Segure Ctrl (Windows/Linux) ou Command (macOS) e clique nas demais.",
    "Use Shift para selecionar um intervalo contínuo.",
    "Para selecionar todas as mensagens carregadas, foque a lista e pressione Ctrl+A ou Command+A.",
    "Execute a ação desejada usando a barra de ferramentas."
   ],
   "Rascunhos locais aceitam seleção múltipla, mas algumas ações IMAP não se aplicam a eles."
  ],
  [
   "Mensagens",
   "Ordenar mensagens por destinatário (Para)",
   "Ordene pela coluna Para, inclusive em Enviados.",
   [
    "Abra a pasta Enviados, ou outra pasta desejada.",
    "Na barra da coluna central, abra a lista de ordenação (Data).",
    "Selecione Para.",
    "Use a seta de direção para alternar entre crescente e decrescente."
   ],
   "Esse ordenamento utiliza o destinatário conhecido nas mensagens locais."
  ],
  [
   "Mensagens",
   "Pesquisar e filtrar mensagens",
   "Combine busca e filtros disponíveis.",
   [
    "Clique na caixa Pesquisar mensagens no topo da coluna central.",
    "Digite um termo ou use filtros como from:, subject:, is:unread e has:attachment.",
    "Escolha Todas, Não lidas ou Lidas para restringir resultados.",
    "Remova o texto para retornar à listagem anterior."
   ],
   "A pesquisa opera sobre o conteúdo já sincronizado. Mensagens ainda não baixadas podem não aparecer."
  ],
  [
   "Mensagens",
   "Excluir e restaurar mensagens",
   "Entenda a diferença entre Lixeira e exclusão definitiva.",
   [
    "Selecione uma ou mais mensagens.",
    "Pressione Delete para mover para a Lixeira.",
    "Abra a Lixeira para verificar o resultado.",
    "Quando disponível, use Restaurar ou mover para outra pasta.",
    "Use Shift+Delete somente se desejar exclusão permanente e confirmar a operação."
   ],
   "A disponibilidade de restaurar e excluir remotamente depende dos recursos da conta."
  ],
  [
   "Mensagens",
   "Anexos e arquivos recebidos",
   "Visualize ou salve anexos com segurança.",
   [
    "Abra a mensagem com anexo.",
    "Localize a seção de anexos.",
    "Escolha Visualizar, quando o formato for compatível.",
    "Escolha Salvar e confirme o destino do arquivo."
   ],
   "Arquivos desconhecidos podem ser perigosos; não abra executáveis inesperados."
  ],
  [
   "Rascunhos e composição",
   "Criar uma mensagem",
   "Comece uma mensagem no painel de leitura.",
   [
    "Clique em Nova mensagem na barra lateral.",
    "Informe Para, Cc ou Cco, conforme necessário.",
    "Digite o assunto e o texto.",
    "Adicione anexos ou uma assinatura.",
    "Clique em Enviar e acompanhe Envios."
   ],
   "O editor utiliza por padrão o painel de leitura. É possível destacá-lo em janela independente."
  ],
  [
   "Rascunhos e composição",
   "Salvar e encontrar rascunhos",
   "Continue uma mensagem sem perdê-la.",
   [
    "Comece uma mensagem e aguarde o salvamento automático.",
    "Abra a seção Rascunhos da conta.",
    "Clique uma vez para visualizar o rascunho.",
    "Dê duplo clique ou escolha Continuar para editar.",
    "Verifique o indicador Local ou Sincronizado."
   ],
   "O salvamento local é prioritário; a sincronização remota pode depender da conexão e do servidor."
  ],
  [
   "Rascunhos e composição",
   "Excluir vários rascunhos",
   "Descarte cópias locais selecionadas.",
   [
    "Abra Rascunhos.",
    "Selecione múltiplos rascunhos usando Ctrl ou Shift, ou as caixas de seleção.",
    "Pressione Delete.",
    "Confira a quantidade e confirme."
   ],
   "A exclusão de rascunhos locais é definitiva. Verifique as cópias remotas antes de agir."
  ],
  [
   "Rascunhos e composição",
   "Alterar o modo de composição",
   "Escolha No painel de leitura ou Em janela independente para novas mensagens, respostas e encaminhamentos.",
   [
    "Abra Configurações → Composição.",
    "Em Compor, responder e encaminhar por padrão, escolha Painel de leitura ou Janela independente.",
    "Feche Configurações e clique em Nova mensagem para testar.",
    "Para o tema da janela destacada, visite Configurações → Aparência.",
    "Clique em Abrir nova mensagem em janela independente para testar imediatamente."
   ],
   "O tema do Composer em janela independente pode seguir o tema global ou ser independente."
  ],
  [
   "Rascunhos e composição",
   "Usar assinaturas por conta",
   "Configure assinaturas sem confundir identidade e conta.",
   [
    "Abra Configurações → Composição → Assinaturas.",
    "Selecione a conta ou identidade desejada.",
    "Crie ou edite o conteúdo e salve.",
    "Abra Nova mensagem com a conta correta em De.",
    "Confirme a assinatura antes de enviar."
   ],
   "Alguns provedores exigem que aliases estejam autorizados."
  ],
  [
   "Contas e pastas",
   "Trocar o estilo de navegação das contas",
   "Escolha entre seis estilos.",
   [
    "Abra Configurações → Aparência.",
    "Procure Estilo de navegação de contas e pastas.",
    "Escolha Árvore, Caixa unificada, Grupos, Favoritos, Colunas ou Abas.",
    "A alteração deve aparecer imediatamente na barra lateral.",
    "Se escolher Grupos, acesse Gerenciar grupos de contas."
   ],
   "Alterar o estilo não modifica nem move mensagens no servidor."
  ],
  [
   "Contas e pastas",
   "Criar e organizar pastas",
   "Gerencie suas pastas IMAP e favoritos.",
   [
    "Abra Configurações → Pastas e sincronização.",
    "Clique em Favoritos, ocultas e inscrições.",
    "Escolha uma conta e uma pasta.",
    "Ajuste visibilidade, favorito ou inscrição, conforme disponibilizado.",
    "Volte à barra lateral para conferir."
   ],
   "Ocultar uma pasta não a exclui do servidor."
  ],
  [
   "Contas e pastas",
   "Sincronizar mensagens",
   "Atualize a pasta em que está trabalhando.",
   [
    "Selecione a conta e a pasta desejadas.",
    "Clique em Sincronizar na barra superior.",
    "Aguarde a atualização do status.",
    "Se a conta continuar com erros, execute Configurações → Diagnóstico e avançado → Diagnóstico."
   ],
   "Não exclua contas nem redefina UIDVALIDITY como tentativa de correção."
  ],
  [
   "Aparência e leitura",
   "Escolher temas",
   "Personalize cores da janela e do editor independente.",
   [
    "Abra Configurações → Aparência.",
    "Selecione Sistema, Claro, Escuro, Focus, Ocean ou Graphite.",
    "Observe se a janela de Configurações e as colunas acompanham o tema.",
    "Em Tema do Composer (janela independente), escolha Seguir tema global ou outro tema."
   ],
   "As preferências existentes são preservadas nas atualizações."
  ],
  [
   "Aparência e leitura",
   "Marcar mensagens como lidas após 1 segundo",
   "Ajuste a pré-visualização.",
   [
    "Abra Configurações → Leitura.",
    "Em Ao permanecer na pré-visualização, escolha Marcar após 1 segundo.",
    "Volte à Caixa de entrada e selecione uma mensagem não lida.",
    "Após um segundo de pré-visualização contínua, o indicador de não lida deverá desaparecer."
   ],
   "Se mover para outra mensagem antes do prazo, a marcação anterior é cancelada."
  ],
  [
   "Privacidade e IA",
   "Controlar imagens remotas",
   "Evite rastreamento e carregamento indesejado.",
   [
    "Abra Configurações → Privacidade e segurança.",
    "Em Imagens remotas, escolha Perguntar.",
    "Mantenha Bloquear rastreamento remoto ativado.",
    "Abra uma mensagem com imagens e autorize apenas quando confiar no remetente."
   ],
   "Imagens externas podem revelar abertura da mensagem ao remetente."
  ],
  [
   "Privacidade e IA",
   "Configurar seu provedor de IA",
   "Escolha a IA e autorize o acesso às mensagens.",
   [
    "Abra Configurações → IA e RAG.",
    "Cadastre ou selecione o provedor e o modelo oferecido por sua infraestrutura.",
    "Teste a conexão, quando a opção estiver disponível.",
    "Revise as opções de privacidade e autorização para analisar mensagens.",
    "Abra uma mensagem e use uma função de IA, verificando o resultado antes de reutilizá-lo."
   ],
   "O uso de IA é opcional e suas autorizações devem respeitar a privacidade da mensagem."
  ],
  [
   "Suporte e diagnóstico",
   "Registrar e enviar diagnóstico",
   "Prepare um relatório técnico sem senhas.",
   [
    "Abra Configurações → Diagnóstico e avançado → Diagnóstico.",
    "Escolha Registrar ou visualizar ocorrências.",
    "Leia o resumo com versão, sistema operacional e tipo de falha.",
    "Clique em Preparar envio para tcsmail@thecreativesolver.com.",
    "Confira e confirme a saída do relatório antes do envio."
   ],
   "Não inclua senhas, tokens ou o conteúdo de mensagens."
  ],
  [
   "Suporte e diagnóstico",
   "O aplicativo fechou inesperadamente",
   "Recupere e reporte uma falha.",
   [
    "Abra novamente o TCS Mail.",
    "Se surgir o aviso de encerramento não confirmado, revise o resumo técnico.",
    "Escolha Enviar, Agora não ou Nunca perguntar.",
    "Em Configurações → Diagnóstico, altere entre Perguntar, Sempre enviar e Nunca enviar."
   ],
   "Um desligamento abrupto do computador também pode deixar um marcador de sessão anterior."
  ],
  [
   "Suporte e diagnóstico",
   "Relatar um defeito reproduzível",
   "Envie informações que permitam investigar o problema.",
   [
    "Registre o que tentou fazer e o resultado esperado.",
    "Anote a tela/ação, frequência e versão do aplicativo.",
    "Abra Configurações → Sobre → Enviar feedback ou Diagnóstico.",
    "Descreva passos concretos e envie o relatório para tcsmail@thecreativesolver.com."
   ],
   "Não anexe capturas com senhas, tokens, números pessoais ou conteúdo privado."
  ],
  [
   "Mensagens",
   "Marcar uma mensagem com estrela",
   "Encontre rapidamente mensagens importantes.",
   [
    "Abra a caixa ou a lista de mensagens.",
    "Selecione uma mensagem.",
    "Clique no ícone de estrela no menu ou na lista.",
    "Abra Com estrela para conferir."
   ],
   "Uma estrela não desloca a mensagem para outra pasta."
  ],
  [
   "Mensagens",
   "Mover mensagens para outra pasta",
   "Organize sem excluir mensagens.",
   [
    "Marque as mensagens desejadas.",
    "Escolha Mover para pasta no menu da lista ou da mensagem.",
    "Selecione a pasta de destino da conta.",
    "Confirme e aguarde a atualização."
   ],
   "Em IMAP, a operação depende das permissões do servidor."
  ],
  [
   "Mensagens",
   "Marcar mensagens como spam",
   "Ajude a separar mensagens indesejadas.",
   [
    "Selecione uma ou mais mensagens.",
    "Abra o menu e escolha Spam ou Marcar como spam.",
    "Confirme a ação se for solicitado.",
    "Abra a pasta Spam para verificar o resultado."
   ],
   "Falso positivo? Mova a mensagem de volta para a pasta correta."
  ],
  [
   "Mensagens",
   "Encaminhar uma mensagem",
   "Envie uma mensagem recebida a outra pessoa.",
   [
    "Abra a mensagem desejada.",
    "Escolha Encaminhar.",
    "Informe os destinatários no campo Para.",
    "Revise o texto e os anexos antes de enviar."
   ],
   "Confira dados sensíveis do e-mail original antes de compartilhar."
  ],
  [
   "Mensagens",
   "Exibir apenas texto em uma mensagem",
   "Visualize e-mails sem formatação HTML.",
   [
    "Abra o e-mail.",
    "Localize o controle de visualização no leitor.",
    "Escolha Exibir somente texto.",
    "Volte ao modo HTML se precisar conferir a formatação."
   ],
   "Imagens remotas continuam sujeitas à política de privacidade."
  ],
  [
   "Rascunhos e composição",
   "Agendar o envio de uma mensagem",
   "Prepare uma mensagem para envio futuro.",
   [
    "Abra Nova mensagem.",
    "Informe destinatário, assunto e conteúdo.",
    "Nas opções de envio, ative Agendar e escolha data e horário.",
    "Revise e confirme; acompanhe em Envios."
   ],
   "Envios futuros dependem da fila e de conectividade adequada."
  ],
  [
   "Rascunhos e composição",
   "Trocar a conta do campo De",
   "Envie usando uma identidade permitida.",
   [
    "Abra Nova mensagem.",
    "Localize o campo De.",
    "Selecione a conta/identidade de envio desejada.",
    "Confira destinatários e assinatura antes de enviar."
   ],
   "Alguns provedores exigem autorização prévia para aliases de remetente."
  ],
  [
   "Rascunhos e composição",
   "Recuperar um rascunho após fechar o editor",
   "Continue sem perder o texto.",
   [
    "Abra Rascunhos.",
    "Encontre o rascunho pelo assunto ou data.",
    "Selecione-o para pré-visualizar.",
    "Escolha Continuar editando para abrir o editor."
   ],
   "Se o rascunho não aparecer, confira o filtro e a conta selecionada."
  ],
  [
   "Contas e pastas",
   "Configurar um servidor IMAP manualmente",
   "Corrija uma detecção automática inadequada.",
   [
    "Abra Configurações → Contas.",
    "Selecione sua conta e escolha Editar.",
    "Confira host IMAP/SMTP, portas e segurança informados pelo provedor.",
    "Salve e use Testar IMAP/SMTP em Diagnóstico."
   ],
   "Uma sugestão imap.dominio não comprova que seja o servidor correto."
  ],
  [
   "Contas e pastas",
   "Adicionar pastas aos favoritos",
   "Acesse pastas importantes rapidamente.",
   [
    "Abra a navegação de contas e pastas.",
    "Localize a pasta da conta.",
    "Use a opção de adicionar aos Favoritos ou o organizador de pastas.",
    "Confirme a pasta na seção Favoritos."
   ],
   "Adicionar aos favoritos não move mensagens no servidor."
  ],
  [
   "Contas e pastas",
   "Criar uma regra de organização",
   "Automatize ações sobre mensagens que atendem a condições.",
   [
    "Abra Configurações → Regras.",
    "Crie uma regra e defina a condição de correspondência.",
    "Selecione a ação apropriada e salve.",
    "Teste primeiro com uma mensagem não importante."
   ],
   "Regras podem mover mensagens; revise as condições antes de ativar."
  ],
  [
   "Mensagens",
   "Salvar e reutilizar uma pesquisa",
   "Volte a uma busca frequente.",
   [
    "Abra Configurações → Pesquisas ou a área de pesquisas salvas.",
    "Informe os termos ou filtros desejados.",
    "Dê um nome à pesquisa e salve.",
    "Use o atalho de pesquisas salvas para aplicá-la."
   ],
   "Filtros pertencem à pesquisa; não alteram mensagens por si só."
  ],
  [
   "Aparência e leitura",
   "Redimensionar a coluna de mensagens",
   "Ajuste o espaço entre listagem e leitor.",
   [
    "Abra a visualização de mensagens.",
    "Posicione o mouse na divisória entre listagem e leitor.",
    "Arraste até a largura desejada.",
    "Solte para salvar o ajuste."
   ],
   "Em janelas estreitas, a largura mínima pode limitar o ajuste."
  ],
  [
   "Aparência e leitura",
   "Personalizar atalhos de teclado",
   "Adapte comandos de uso frequente.",
   [
    "Abra Configurações → Atalhos.",
    "Localize a função desejada.",
    "Escolha a combinação disponível para a função.",
    "Salve e teste fora dos campos de edição."
   ],
   "Atalhos globais e do sistema podem ter prioridade."
  ],
  [
   "Privacidade e IA",
   "Ativar notificações",
   "Receba avisos dos recursos habilitados.",
   [
    "Abra Configurações → Notificações.",
    "Ative as categorias de mensagens, agenda e tarefas.",
    "Verifique as permissões de notificações do sistema operacional.",
    "Faça um teste na situação real correspondente."
   ],
   "Notificações podem depender de permissões do sistema."
  ],
  [
   "Privacidade e IA",
   "Bloquear rastreamento em e-mails",
   "Reduza requisições de conteúdo remoto.",
   [
    "Abra Configurações → Privacidade e segurança.",
    "Ative Bloquear rastreamento remoto.",
    "Defina Imagens remotas como Perguntar.",
    "Abra uma mensagem e autorize imagens apenas quando confiar no remetente."
   ],
   "Mesmo conteúdo sem script pode conter recursos remotos de rastreamento."
  ],
  [
   "Primeiros passos",
   "Adicionar um contato",
   "Guarde dados de remetentes e destinatários.",
   [
    "Abra Contatos na barra lateral.",
    "Escolha Novo contato.",
    "Preencha nome e endereço de e-mail.",
    "Salve e confira na lista de contatos."
   ],
   "Se houver várias fontes de contatos, escolha a fonte apropriada."
  ],
  [
   "Primeiros passos",
   "Criar um evento no calendário",
   "Agende compromissos na agenda do TCS Mail.",
   [
    "Abra Calendário.",
    "Navegue até a data desejada.",
    "Escolha Novo evento.",
    "Informe título, início e fim e salve."
   ],
   "Verifique a fonte de calendário utilizada para a sincronização."
  ],
  [
   "Primeiros passos",
   "Criar uma tarefa",
   "Acompanhe ações pendentes.",
   [
    "Abra Calendário e acesse Tarefas, quando disponível.",
    "Escolha Nova tarefa.",
    "Informe nome, data ou prazo e salve.",
    "Revise as tarefas na agenda."
   ],
   "O local de armazenamento depende da fonte configurada."
  ]
 ],
 "en-US": [
  ["Getting started","Set up on first launch","Connect accounts and choose preferences in two steps in the same window.",[
    "Enter just your email address and use autodiscovery for Gmail, Microsoft or IMAP/SMTP.",
    "Authorize OAuth in your browser when requested; never replace mandatory OAuth with a basic password.",
    "Add accounts consecutively and proceed to Preferences only when at least one account is connected.",
    "Choose theme, notifications and in-panel or separate-window composer; defaults are enabled notifications and in-panel composer.",
    "Select Finish to save preferences and open your inbox.",
    "Going back to Accounts preserves unsaved preferences; finishing requires a saved account.",
    "Automatic backup import is not available in this candidate: keep profile files and credentials untouched."
   ],"To restore an old profile, preserve your data and follow a safe restoration procedure; never replace an open database."],
  [
   "Getting started",
   "Add an email account",
   "Connect IMAP, Gmail or Microsoft while preserving existing accounts.",
   [
    "Open Settings → Accounts.",
    "Click Add account and enter the full email address.",
    "Check detected servers against the provider instructions; edit manually if needed.",
    "Complete OAuth or provide an app password if required.",
    "Return to Inbox and click Sync."
   ],
   "Do not overwrite working server settings without checking them."
  ],
  [
   "Getting started",
   "Reconnect Gmail or Microsoft",
   "Refresh authorization when synchronization stops.",
   [
    "Open Settings → Accounts.",
    "Find the OAuth account.",
    "Click Reconnect.",
    "Complete authorization in the browser.",
    "Return to TCS Mail and run Account diagnostics if errors remain."
   ],
   "Microsoft IMAP/SMTP may need administrator authorization."
  ],
  [
   "Getting started",
   "Fix IMAP authentication errors",
   "Investigate authentication without deleting messages.",
   [
    "Open Settings → Accounts.",
    "Edit the affected IMAP/SMTP account.",
    "Confirm email address, username, server names, ports and TLS settings.",
    "Only change the credential if necessary.",
    "Go to Diagnostics → Test IMAP/SMTP."
   ],
   "Successful TCP connection does not prove successful authentication."
  ],
  [
   "Messages",
   "Read a message",
   "Use the message reader pane.",
   [
    "Choose Inbox or a folder.",
    "Click a message once in the middle column.",
    "Read the content in the Reading pane.",
    "Double-click to open a separate window if configured."
   ],
   "Choose read-mark timing in Settings → Reading."
  ],
  [
   "Messages",
   "Select multiple messages",
   "Use Ctrl, Shift, checkboxes and keyboard shortcuts.",
   [
    "Click a message.",
    "Hold Ctrl (Linux/Windows) or Command (Mac) and click other messages.",
    "Hold Shift to select a continuous range.",
    "Focus the list and press Ctrl+A or Command+A to select loaded messages.",
    "Use the action toolbar."
   ],
   "Local drafts can be selected, but IMAP actions may not apply to them."
  ],
  [
   "Messages",
   "Sort by recipient (To)",
   "Sort mail by recipient instead of sender.",
   [
    "Open Sent or another mail folder.",
    "Open the sort selector (Date) in the middle toolbar.",
    "Choose To.",
    "Click the direction control to switch ascending/descending."
   ],
   "Sorting uses recipient information stored with synchronized messages."
  ],
  [
   "Messages",
   "Search and filter messages",
   "Combine search text and existing filters.",
   [
    "Focus Search messages.",
    "Enter text or filters such as from:, subject:, is:unread and has:attachment.",
    "Choose All, Unread or Read.",
    "Clear the search to return to the full list."
   ],
   "Unsynchronized messages may not appear in local results."
  ],
  [
   "Messages",
   "Delete and restore messages",
   "Use Trash and permanent deletion deliberately.",
   [
    "Select one or more messages.",
    "Press Delete to move them to Trash.",
    "Open Trash to inspect the result.",
    "Use Restore or Move when available.",
    "Use Shift+Delete only after confirming permanent deletion."
   ],
   "Server capabilities determine available recovery actions."
  ],
  [
   "Messages",
   "Open or save attachments",
   "Preview supported attachments safely.",
   [
    "Open the message.",
    "Locate the attachments section.",
    "Choose Preview for supported formats.",
    "Choose Save and select a destination."
   ],
   "Never open unexpected executable attachments."
  ],
  [
   "Drafts and composition",
   "Compose a new message",
   "Start composing in the reader pane.",
   [
    "Click New message.",
    "Enter To, Cc or Bcc.",
    "Write the subject and message.",
    "Add attachments or a signature.",
    "Click Send and check Outbox."
   ],
   "You can detach the composer to a separate window."
  ],
  [
   "Drafts and composition",
   "Find saved drafts",
   "Continue editing an existing draft.",
   [
    "Compose a message and wait for autosave.",
    "Open Drafts for the account.",
    "Click once to preview the draft.",
    "Double-click or choose Continue to edit.",
    "Check Local or Synced status."
   ],
   "Local saving takes precedence while remote IMAP synchronization is pending."
  ],
  [
   "Drafts and composition",
   "Delete multiple drafts",
   "Discard selected local drafts.",
   [
    "Open Drafts.",
    "Use Ctrl/Shift or checkboxes to select drafts.",
    "Press Delete.",
    "Review the count and confirm."
   ],
   "Deleting local drafts cannot be undone. Review server copies separately."
  ],
  [
   "Drafts and composition",
   "Change composer location",
   "Choose the reader pane or a separate window for new messages, replies, and forwards.",
   [
    "Open Settings → Composition.",
    "Choose Reader pane or Separate window under the default composer location.",
    "Close Settings and open New message to test.",
    "Use Settings → Appearance for the detached composer theme.",
    "Click Open new message in a separate window to test it immediately."
   ],
   "Separate composer windows may follow or override the global theme."
  ],
  [
   "Drafts and composition",
   "Set a signature for each account",
   "Manage per-account signatures.",
   [
    "Open Settings → Composition → Signatures.",
    "Choose the account or sender identity.",
    "Create or edit the signature and save.",
    "Compose using the expected From identity.",
    "Review the signature before sending."
   ],
   "Aliases may require provider approval."
  ],
  [
   "Accounts and folders",
   "Change account navigation style",
   "Switch among six account navigation layouts.",
   [
    "Open Settings → Appearance.",
    "Locate Account and folder navigation.",
    "Choose Tree, Unified, Groups, Favorites, Columns or Tabs.",
    "The sidebar should update immediately.",
    "For Groups, open Manage account groups."
   ],
   "Changing layout never moves server messages."
  ],
  [
   "Accounts and folders",
   "Organize folders",
   "Manage subscriptions, hidden folders and favorites.",
   [
    "Open Settings → Folders and synchronization.",
    "Choose Favorites, hidden folders and subscriptions.",
    "Select the account and folder.",
    "Change visibility, favorite or subscription as applicable.",
    "Return to the sidebar."
   ],
   "Hiding a folder does not delete it on the server."
  ],
  [
   "Accounts and folders",
   "Synchronize a folder",
   "Update a specific mailbox.",
   [
    "Select the target account and folder.",
    "Click Sync on the toolbar.",
    "Wait for the status to update.",
    "If there are errors, open Settings → Diagnostics → Account test."
   ],
   "Do not reset UIDVALIDITY or delete accounts to troubleshoot."
  ],
  [
   "Appearance and reading",
   "Change themes",
   "Customize the main app and detached composer.",
   [
    "Open Settings → Appearance.",
    "Choose System, Light, Dark, Focus, Ocean or Graphite.",
    "Verify the settings window follows the selected theme.",
    "Set Detached composer theme to Follow global or choose another theme."
   ],
   "Existing preferences are preserved on upgrade."
  ],
  [
   "Appearance and reading",
   "Mark messages read after one second",
   "Change preview behavior.",
   [
    "Open Settings → Reading.",
    "Choose Mark after 1 second.",
    "Open Inbox and preview an unread message.",
    "Its unread status should change after one continuous second."
   ],
   "Switching messages cancels a pending timer."
  ],
  [
   "Privacy and AI",
   "Control remote images",
   "Reduce tracking from message images.",
   [
    "Open Settings → Privacy and security.",
    "Set Remote images to Ask.",
    "Leave Block remote tracking on.",
    "Allow images only when you trust the sender."
   ],
   "Remote images can reveal that a message was opened."
  ],
  [
   "Privacy and AI",
   "Choose an AI provider",
   "Select your AI model and permissions.",
   [
    "Open Settings → AI and RAG.",
    "Choose the provider and model available in your environment.",
    "Test connectivity where supported.",
    "Review message analysis privacy permissions.",
    "Use an AI feature on a message and verify the results."
   ],
   "AI is optional and requires appropriate authorization."
  ],
  [
   "Support and diagnostics",
   "Prepare a diagnostic report",
   "Share technical details without secrets.",
   [
    "Open Settings → Diagnostics.",
    "View the incident summary.",
    "Review app version, operating system and incident classification.",
    "Choose Prepare email to tcsmail@thecreativesolver.com.",
    "Review and send the prepared report."
   ],
   "Never send passwords, tokens or private message bodies."
  ],
  [
   "Support and diagnostics",
   "Recover from an unexpected shutdown",
   "Review an unconfirmed previous session.",
   [
    "Launch TCS Mail again.",
    "Review the unexpected shutdown prompt.",
    "Choose Send, Not now or Do not ask again.",
    "Change the mode in Settings → Diagnostics: Ask, Always send, Never send."
   ],
   "A sudden computer shutdown can also leave an unconfirmed-session marker."
  ],
  [
   "Support and diagnostics",
   "Report a reproducible bug",
   "Send actionable steps to support.",
   [
    "Write down the action and expected outcome.",
    "Record the screen, frequency and app version.",
    "Open Settings → About → Send feedback or Diagnostics.",
    "Provide clear steps and send to tcsmail@thecreativesolver.com."
   ],
   "Exclude passwords, tokens and private content from screenshots."
  ],
  [
   "Messages",
   "Star an important message",
   "Quickly find important messages.",
   [
    "Open a mailbox or message list.",
    "Select a message.",
    "Click the star control in the list or message menu.",
    "Open Starred to find it."
   ],
   "Starring does not move a message to another folder."
  ],
  [
   "Messages",
   "Move messages to another folder",
   "Organize messages without deleting them.",
   [
    "Select the messages.",
    "Choose Move to folder in the list or message menu.",
    "Choose a destination folder for the account.",
    "Confirm and wait for the list to update."
   ],
   "IMAP operations depend on server permissions."
  ],
  [
   "Messages",
   "Mark messages as spam",
   "Keep unwanted messages separate.",
   [
    "Select one or more messages.",
    "Open the menu and choose Spam or Mark as spam.",
    "Confirm if prompted.",
    "Open Spam to review the results."
   ],
   "For false positives, move the message back to the correct folder."
  ],
  [
   "Messages",
   "Forward a message",
   "Share a received message with someone else.",
   [
    "Open the message.",
    "Choose Forward.",
    "Enter recipients in the To field.",
    "Review content and attachments before sending."
   ],
   "Check the original message for confidential content before forwarding."
  ],
  [
   "Messages",
   "Read a message as plain text",
   "View email without HTML formatting.",
   [
    "Open a message.",
    "Find the display mode control in the reader.",
    "Choose Text only.",
    "Return to HTML if you need the original formatting."
   ],
   "Remote images still follow your privacy settings."
  ],
  [
   "Drafts and composition",
   "Schedule a message for later",
   "Prepare a message for a future send time.",
   [
    "Open New message.",
    "Enter recipients, subject and content.",
    "In send options, enable Schedule and choose date/time.",
    "Review and confirm; monitor the Outbound queue."
   ],
   "Scheduled messages rely on the queue and suitable connectivity."
  ],
  [
   "Drafts and composition",
   "Change the From account",
   "Send using an authorized identity.",
   [
    "Open New message.",
    "Find the From field.",
    "Choose the appropriate account or sender identity.",
    "Review recipients and signature before sending."
   ],
   "Some providers require aliases to be authorized before use."
  ],
  [
   "Drafts and composition",
   "Recover a draft after closing the editor",
   "Continue composing without losing text.",
   [
    "Open Drafts.",
    "Find the draft by subject or date.",
    "Select it to preview.",
    "Choose Continue editing to reopen the composer."
   ],
   "If missing, check filters and the selected account."
  ],
  [
   "Accounts and folders",
   "Configure IMAP server manually",
   "Correct an unsuitable auto-detected server.",
   [
    "Open Settings → Accounts.",
    "Choose your account and Edit.",
    "Check IMAP/SMTP hosts, ports and security as supplied by the provider.",
    "Save and use Test IMAP/SMTP under Diagnostics."
   ],
   "A suggested imap.domain name is not proof of the correct server."
  ],
  [
   "Accounts and folders",
   "Add folders to favorites",
   "Access key folders quickly.",
   [
    "Open account and folder navigation.",
    "Find the folder in the account.",
    "Use Add to favorites or the folder organizer.",
    "Verify it appears under Favorites."
   ],
   "Favoriting a folder does not move mail on the server."
  ],
  [
   "Accounts and folders",
   "Create a message rule",
   "Automate actions for messages matching conditions.",
   [
    "Open Settings → Rules.",
    "Create a rule and define its matching condition.",
    "Choose the action and save.",
    "Test first with a noncritical message."
   ],
   "Rules may move messages; review conditions before enabling."
  ],
  [
   "Messages",
   "Save and reuse a search",
   "Return to common searches quickly.",
   [
    "Open Settings → Searches or Saved searches.",
    "Enter the desired search terms or filters.",
    "Name and save the search.",
    "Use Saved searches to apply it later."
   ],
   "Filters do not change messages by themselves."
  ],
  [
   "Appearance and reading",
   "Resize the message list",
   "Allocate more space to the list or reader.",
   [
    "Open the message view.",
    "Move the pointer to the splitter between list and reader.",
    "Drag to the desired width.",
    "Release to save the adjustment."
   ],
   "On narrow windows, minimum widths may limit resizing."
  ],
  [
   "Appearance and reading",
   "Customize keyboard shortcuts",
   "Adapt shortcuts for frequent actions.",
   [
    "Open Settings → Shortcuts.",
    "Find the relevant action.",
    "Choose the available key combination.",
    "Save and test outside text fields."
   ],
   "System shortcuts may take precedence."
  ],
  [
   "Privacy and AI",
   "Enable notifications",
   "Get alerts for enabled features.",
   [
    "Open Settings → Notifications.",
    "Enable mail, calendar and task categories.",
    "Check OS notification permissions.",
    "Test the relevant behavior in practice."
   ],
   "Notifications can depend on OS permissions."
  ],
  [
   "Privacy and AI",
   "Block email tracking",
   "Reduce remote content requests.",
   [
    "Open Settings → Privacy and security.",
    "Enable Block remote tracking.",
    "Set Remote images to Ask.",
    "Open messages and allow images only for trusted senders."
   ],
   "Even script-free HTML may contain tracking resources."
  ],
  [
   "Getting started",
   "Add a contact",
   "Store recipient and sender details.",
   [
    "Open Contacts in the sidebar.",
    "Choose New contact.",
    "Enter name and email address.",
    "Save and confirm it appears in contacts."
   ],
   "If multiple contact sources exist, choose the appropriate one."
  ],
  [
   "Getting started",
   "Create a calendar event",
   "Schedule an appointment in TCS Mail.",
   [
    "Open Calendar.",
    "Navigate to the required date.",
    "Choose New event.",
    "Set title, start and end, then save."
   ],
   "Check the calendar source to understand synchronization."
  ],
  [
   "Getting started",
   "Create a task",
   "Track unfinished actions.",
   [
    "Open Calendar and Tasks, when available.",
    "Choose New task.",
    "Enter a title and any due date, then save.",
    "Review the task in your calendar."
   ],
   "Storage depends on the configured source."
  ]
 ]
};
// Additional task-specific, bilingual help: localized independently and kept offline.
GUIDES["pt-BR"].push(...[
 [
  "Primeiros passos",
  "Confirmar a versão instalada",
  "Como confirmar a versão instalada no TCS Mail.",
  [
   "Abra Configurações",
   "Entre em Sobre",
   "Confira se aparece 0.8.2-rc6 e o site oficial",
   "Se for outra versão, não apague as contas: confira o instalador"
  ],
  "A versão do aplicativo é diferente do número do pacote de origem."
 ],
 [
  "Primeiros passos",
  "Escolher a conta padrão",
  "Como escolher a conta padrão no TCS Mail.",
  [
   "Abra Configurações → Geral",
   "Encontre Conta padrão",
   "Escolha a conta desejada",
   "Crie uma mensagem e confirme o remetente"
  ],
  "A conta padrão não muda mensagens já enviadas."
 ],
 [
  "Primeiros passos",
  "Confirmar os servidores da conta",
  "Como confirmar os servidores da conta no TCS Mail.",
  [
   "Abra Configurações → Contas",
   "Edite a conta desejada",
   "Confira IMAP e SMTP com a documentação do provedor",
   "Salve somente se os valores estiverem corretos"
  ],
  "A sugestão automática imap.dominio não comprova o servidor verdadeiro."
 ],
 [
  "Primeiros passos",
  "Conferir o nome de usuário IMAP",
  "Como conferir o nome de usuário IMAP no TCS Mail.",
  [
   "Abra Configurações → Contas",
   "Edite a conta",
   "Compare o usuário IMAP com as instruções do provedor",
   "Use o diagnóstico sem apagar mensagens"
  ],
  "Alguns servidores exigem o endereço de e-mail completo."
 ],
 [
  "Primeiros passos",
  "Distinguir senha e OAuth",
  "Como distinguir senha e OAuth no TCS Mail.",
  [
   "Abra Configurações → Contas",
   "Verifique o método de autenticação da conta",
   "Se for OAuth, use Reconectar em vez de digitar uma senha comum",
   "Se for senha, confirme o método exigido pelo provedor"
  ],
  "Não altere o método por tentativa quando a conta estiver funcionando."
 ],
 [
  "Primeiros passos",
  "Adicionar uma segunda conta",
  "Como adicionar uma segunda conta no TCS Mail.",
  [
   "Abra Configurações → Contas",
   "Escolha Adicionar conta",
   "Informe o e-mail completo e finalize a autorização",
   "Confira se ambas aparecem na barra lateral"
  ],
  "Não é necessário remover a primeira conta."
 ],
 [
  "Primeiros passos",
  "Atualizar o nome exibido da conta",
  "Como atualizar o nome exibido da conta no TCS Mail.",
  [
   "Abra Configurações → Contas",
   "Edite a conta",
   "Altere o nome local de exibição",
   "Salve e confira a barra lateral"
  ],
  "O nome local não altera o endereço real do servidor."
 ],
 [
  "Primeiros passos",
  "Diferenciar caixa e pasta",
  "Como diferenciar caixa e pasta no TCS Mail.",
  [
   "Expanda a conta na coluna esquerda",
   "Identifique Caixa de entrada, Enviados e outras pastas",
   "Clique na pasta desejada",
   "Confira o nome destacado antes de agir"
  ],
  "Uma Caixa unificada agrega mensagens de várias contas."
 ],
 [
  "Primeiros passos",
  "Alterar o idioma",
  "Como alterar o idioma no TCS Mail.",
  [
   "Abra Configurações → Geral",
   "Localize Idioma do aplicativo",
   "Escolha Sistema, Português ou English",
   "Aguarde a recarga da interface"
  ],
  "A alteração não modifica o idioma dos e-mails recebidos."
 ],
 [
  "Primeiros passos",
  "Definir o aplicativo de e-mail padrão",
  "Como definir o aplicativo de e-mail padrão no TCS Mail.",
  [
   "Abra Configurações → Geral",
   "Clique em Definir TCS Mail como cliente padrão",
   "Siga a orientação exibida pelo sistema",
   "Teste um link mailto: de fonte confiável"
  ],
  "O sistema pode exigir confirmação fora do TCS Mail."
 ],
 [
  "Primeiros passos",
  "Reconhecer erro de configuração inicial",
  "Como reconhecer erro de configuração inicial no TCS Mail.",
  [
   "Abra Configurações → Contas",
   "Confira se há endereço, servidor e método de login",
   "Execute Diagnóstico da conta",
   "Compare os códigos retornados com as orientações de suporte"
  ],
  "Conexão TCP bem-sucedida não garante autenticação."
 ],
 [
  "Primeiros passos",
  "Manter dados ao atualizar",
  "Como manter dados ao atualizar no TCS Mail.",
  [
   "Feche o TCS Mail antes de instalar um novo pacote",
   "Preserve pastas de configurações e dados do usuário",
   "Atualize pelo gerenciador de pacotes da plataforma",
   "Abra Sobre para conferir a nova versão"
  ],
  "Nunca apague bancos de mensagens ou keyrings para corrigir uma instalação."
 ],
 [
  "Mensagens",
  "Verificar em qual conta está uma mensagem",
  "Como verificar em qual conta está uma mensagem no TCS Mail.",
  [
   "Abra a Caixa unificada ou uma pasta",
   "Selecione a mensagem",
   "Observe as informações de conta e pasta na visualização",
   "Abra a conta correspondente na barra lateral"
  ],
  "Caixas unificadas combinam resultados, não transferem mensagens."
 ],
 [
  "Mensagens",
  "Voltar à caixa de entrada",
  "Como voltar à caixa de entrada no TCS Mail.",
  [
   "Expanda a conta na barra lateral",
   "Clique em Caixa de entrada",
   "Limpe um filtro de pesquisa ativo, se necessário",
   "Confirme que a pasta foi selecionada"
  ],
  "Um filtro ativo pode aparentar uma pasta vazia."
 ],
 [
  "Mensagens",
  "Exibir mensagens não lidas",
  "Como exibir mensagens não lidas no TCS Mail.",
  [
   "Abra a pasta desejada",
   "Acione Não lidas na barra superior",
   "Observe a contagem e a lista",
   "Clique Todas para restaurar a visualização"
  ],
  "O filtro não apaga mensagens."
 ],
 [
  "Mensagens",
  "Voltar a exibir todas as mensagens",
  "Como voltar a exibir todas as mensagens no TCS Mail.",
  [
   "Clique Todas no topo da lista",
   "Apague o texto da caixa de pesquisa",
   "Confira se não há outros filtros ativos",
   "Sincronize a pasta se a lista continuar incompleta"
  ],
  "Filtros e mensagens não sincronizadas são causas diferentes."
 ],
 [
  "Mensagens",
  "Selecionar intervalo com Shift",
  "Como selecionar intervalo com Shift no TCS Mail.",
  [
   "Clique na primeira mensagem da lista",
   "Segure Shift",
   "Clique na última mensagem do intervalo",
   "Confira as mensagens selecionadas antes de agir"
  ],
  "A seleção se aplica às mensagens atualmente listadas."
 ],
 [
  "Mensagens",
  "Selecionar itens separados com Ctrl",
  "Como selecionar itens separados com Ctrl no TCS Mail.",
  [
   "Clique na primeira mensagem",
   "Segure Ctrl no Linux ou Windows, ou Command no macOS",
   "Clique nas outras mensagens",
   "Solte a tecla e confira a seleção"
  ],
  "Não mantenha o foco no corpo de um editor durante a seleção."
 ],
 [
  "Mensagens",
  "Desfazer uma seleção múltipla",
  "Como desfazer uma seleção múltipla no TCS Mail.",
  [
   "Abra a lista de mensagens",
   "Clique fora do conjunto selecionado, se o layout permitir",
   "Use as caixas de seleção para remover itens",
   "Confira se a barra de ações deixou de indicar várias mensagens"
  ],
  "Verifique antes de mover ou excluir mensagens em lote."
 ],
 [
  "Mensagens",
  "Ordenar por data",
  "Como ordenar por data no TCS Mail.",
  [
   "Abra uma pasta",
   "No topo da lista, abra a ordenação",
   "Escolha Data",
   "Use a seta para inverter a direção"
  ],
  "A ordem visual não altera a ordem no servidor."
 ],
 [
  "Mensagens",
  "Ordenar por remetente",
  "Como ordenar por remetente no TCS Mail.",
  [
   "Abra a pasta desejada",
   "Abra o menu de ordenação",
   "Selecione De ou Remetente quando disponível",
   "Confira a direção escolhida"
  ],
  "Pastas Enviados podem mostrar Para na lista."
 ],
 [
  "Mensagens",
  "Identificar destinatários em Enviados",
  "Como identificar destinatários em Enviados no TCS Mail.",
  [
   "Abra a conta e a pasta Enviados",
   "Observe a indicação Para na coluna central",
   "Se precisar, escolha ordenar por Para",
   "Abra a mensagem para conferir todos os destinatários"
  ],
  "Listas podem abreviar destinatários; a mensagem exibe detalhes."
 ],
 [
  "Mensagens",
  "Pesquisar por assunto",
  "Como pesquisar por assunto no TCS Mail.",
  [
   "Clique em Pesquisar mensagens",
   "Digite subject: seguido do termo",
   "Aguarde os resultados locais",
   "Apague a consulta para voltar à lista"
  ],
  "Somente mensagens disponíveis no índice local serão encontradas."
 ],
 [
  "Mensagens",
  "Pesquisar por remetente",
  "Como pesquisar por remetente no TCS Mail.",
  [
   "Abra Pesquisar mensagens",
   "Digite from: seguido do endereço ou nome",
   "Confira os resultados",
   "Use Todas para remover filtros adicionais"
  ],
  "Experimente o endereço completo quando o nome não retornar nada."
 ],
 [
  "Mensagens",
  "Encontrar mensagens com anexos",
  "Como encontrar mensagens com anexos no TCS Mail.",
  [
   "Abra a pesquisa acima da lista",
   "Digite has:attachment",
   "Aplique também a pasta ou conta desejada",
   "Abra um resultado para conferir os anexos"
  ],
  "Anexos não baixados podem exigir conexão."
 ],
 [
  "Mensagens",
  "Conferir se a mensagem foi lida",
  "Como conferir se a mensagem foi lida no TCS Mail.",
  [
   "Abra a pasta que contém a mensagem",
   "Observe o estilo de não lida ou lida",
   "Selecione a mensagem e aguarde o atraso configurado",
   "Se preciso, use a ação Marcar lida ou não lida"
  ],
  "A sincronização com o servidor pode não ser instantânea."
 ],
 [
  "Mensagens",
  "Alterar manualmente o estado de leitura",
  "Como alterar manualmente o estado de leitura no TCS Mail.",
  [
   "Selecione as mensagens",
   "Abra a ação de marcação na barra superior",
   "Escolha Lida ou Não lida",
   "Confira o indicador atualizado"
  ],
  "Algumas ações dependem da permissão da conta."
 ],
 [
  "Mensagens",
  "Usar a estrela",
  "Como usar a estrela no TCS Mail.",
  [
   "Selecione uma mensagem",
   "Clique no controle de estrela",
   "Abra Com estrela na lateral",
   "Clique novamente para remover dos favoritos"
  ],
  "Marcar estrela não move a mensagem."
 ],
 [
  "Mensagens",
  "Lidar com e-mail suspeito",
  "Como lidar com e-mail suspeito no TCS Mail.",
  [
   "Não clique em links ou anexos suspeitos",
   "Selecione a mensagem",
   "Use a ação de Spam disponível na barra",
   "Se for legítima, revise a classificação antes de excluir"
  ],
  "A análise do TCS não substitui boas práticas de segurança."
 ],
 [
  "Mensagens",
  "Conferir a origem RFC822",
  "Como conferir a origem RFC822 no TCS Mail.",
  [
   "Abra a mensagem",
   "Procure a ação de exibir fonte ou detalhes, se disponível",
   "Leia os cabeçalhos sem alterá-los",
   "Para suporte, omita endereços e tokens antes de compartilhar"
  ],
  "Cabeçalhos podem conter informações pessoais."
 ],
 [
  "Rascunhos e composição",
  "Responder a um e-mail",
  "Como responder a um e-mail no TCS Mail.",
  [
   "Abra a mensagem recebida",
   "Escolha Responder",
   "Confira remetente, destinatário e conteúdo citado",
   "Escreva e revise antes de Enviar"
  ],
  "Uma resposta pode herdar a conta original."
 ],
 [
  "Rascunhos e composição",
  "Responder a todos",
  "Como responder a todos no TCS Mail.",
  [
   "Abra a mensagem",
   "Escolha Responder a todos",
   "Confira a lista de destinatários com atenção",
   "Remova pessoas que não devem receber a resposta"
  ],
  "Responder a todos pode incluir pessoas externas."
 ],
 [
  "Rascunhos e composição",
  "Inserir cópia CC",
  "Como inserir cópia CC no TCS Mail.",
  [
   "Abra Nova mensagem",
   "Exiba CC no campo de destinatários",
   "Informe o endereço desejado",
   "Confira Para e CC antes de enviar"
  ],
  "CC é visível aos destinatários da mensagem."
 ],
 [
  "Rascunhos e composição",
  "Inserir cópia oculta BCC",
  "Como inserir cópia oculta BCC no TCS Mail.",
  [
   "Abra Nova mensagem",
   "Exiba o campo CCO ou BCC",
   "Informe o endereço",
   "Confira os destinatários antes de enviar"
  ],
  "BCC não deve aparecer na lista de destinatários visíveis aos outros."
 ],
 [
  "Rascunhos e composição",
  "Trocar o remetente da mensagem",
  "Como trocar o remetente da mensagem no TCS Mail.",
  [
   "Abra Nova mensagem",
   "Clique no campo De",
   "Escolha uma conta ou identidade autorizada",
   "Confira assinatura e remetente antes de enviar"
  ],
  "Aliases precisam ser autorizados pelo servidor de envio."
 ],
 [
  "Rascunhos e composição",
  "Definir Reply-To de uma identidade",
  "Como definir Reply-To de uma identidade no TCS Mail.",
  [
   "Abra Configurações → Composição → Identidades e aliases",
   "Crie ou edite a identidade",
   "Informe Reply-To e salve",
   "Teste com uma mensagem para sua própria conta"
  ],
  "Reply-To não substitui a autorização do remetente."
 ],
 [
  "Rascunhos e composição",
  "Aplicar assinatura em novas mensagens",
  "Como aplicar assinatura em novas mensagens no TCS Mail.",
  [
   "Abra Configurações → Composição → Assinaturas",
   "Crie ou escolha uma assinatura",
   "Associe-a à conta ou identidade",
   "Abra uma mensagem nova para conferir"
  ],
  "A assinatura pode variar entre novas mensagens e respostas."
 ],
 [
  "Rascunhos e composição",
  "Criar assinatura para respostas",
  "Como criar assinatura para respostas no TCS Mail.",
  [
   "Abra Configurações → Composição → Identidades e aliases",
   "Edite a identidade desejada",
   "Escolha a assinatura de respostas/encaminhamentos",
   "Abra uma resposta para conferir"
  ],
  "Não substitua a assinatura de novas mensagens inadvertidamente."
 ],
 [
  "Rascunhos e composição",
  "Criar um modelo de mensagem",
  "Como criar um modelo de mensagem no TCS Mail.",
  [
   "Abra Configurações → Composição → Templates",
   "Crie um template para o texto recorrente",
   "Salve com nome identificável",
   "Abra uma composição e confira a opção do template"
  ],
  "Revise os dados do destinatário antes de reutilizar modelos."
 ],
 [
  "Rascunhos e composição",
  "Escolher HTML ou texto simples",
  "Como escolher HTML ou texto simples no TCS Mail.",
  [
   "Abra Configurações → Composição",
   "Localize formato de mensagem",
   "Escolha o formato adequado",
   "Crie uma mensagem de teste e confira a apresentação"
  ],
  "Respostas podem preservar o formato recebido."
 ],
 [
  "Rascunhos e composição",
  "Formatar texto em negrito",
  "Como formatar texto em negrito no TCS Mail.",
  [
   "Abra o composer",
   "Selecione o trecho",
   "Use o botão Negrito ou Ctrl+B",
   "Revise o resultado antes do envio"
  ],
  "Em texto simples, opções de formatação podem não se aplicar."
 ],
 [
  "Rascunhos e composição",
  "Inserir um link no texto",
  "Como inserir um link no texto no TCS Mail.",
  [
   "Abra o composer em modo HTML",
   "Selecione a expressão a transformar em link",
   "Use a ação Inserir link ou Ctrl+K",
   "Informe a URL e confira o destino"
  ],
  "Não confunda texto do link com seu endereço real."
 ],
 [
  "Rascunhos e composição",
  "Usar lista numerada",
  "Como usar lista numerada no TCS Mail.",
  [
   "Abra o composer em modo HTML",
   "Posicione o cursor",
   "Use Lista numerada na barra de formatação",
   "Digite os itens e encerre a lista ao terminar"
  ],
  "A aparência pode mudar em outros clientes de e-mail."
 ],
 [
  "Rascunhos e composição",
  "Remover formatação de um trecho",
  "Como remover formatação de um trecho no TCS Mail.",
  [
   "Abra a mensagem em edição",
   "Selecione o trecho",
   "Escolha Limpar formatação na barra",
   "Confira se o conteúdo textual permaneceu correto"
  ],
  "Remover formatação não deve excluir o texto."
 ],
 [
  "Rascunhos e composição",
  "Adicionar anexo ao rascunho",
  "Como adicionar anexo ao rascunho no TCS Mail.",
  [
   "Abra Nova mensagem ou um rascunho",
   "Use o controle de anexar arquivos",
   "Selecione um arquivo permitido",
   "Confira o nome e o tamanho antes de enviar"
  ],
  "O servidor pode impor limites de tamanho."
 ],
 [
  "Rascunhos e composição",
  "Remover um anexo antes do envio",
  "Como remover um anexo antes do envio no TCS Mail.",
  [
   "Abra a composição com anexos",
   "Localize o anexo que não deseja enviar",
   "Use Remover ao lado dele",
   "Confira a lista restante antes de Enviar"
  ],
  "Remover da mensagem não apaga o arquivo original."
 ],
 [
  "Rascunhos e composição",
  "Abrir o composer em janela separada",
  "Como abrir o composer em janela separada no TCS Mail.",
  [
   "Abra Configurações → Composição → Editor",
   "Selecione janela independente",
   "Abra Nova mensagem",
   "Se a janela não abrir, use o diagnóstico em vez de fechar rascunhos"
  ],
  "O modo painel continua disponível como alternativa."
 ],
 [
  "Rascunhos e composição",
  "Restaurar o composer no painel",
  "Como restaurar o composer no painel no TCS Mail.",
  [
   "Abra Configurações → Composição → Editor",
   "Selecione No painel de leitura",
   "Feche ou salve a edição atual",
   "Abra Nova mensagem e confira o local"
  ],
  "Alterar a preferência não deve apagar rascunhos."
 ],
 [
  "Rascunhos e composição",
  "Conferir envios pendentes",
  "Como conferir envios pendentes no TCS Mail.",
  [
   "Na coluna lateral, abra Envios",
   "Observe mensagens enfileiradas, agendadas ou com falha",
   "Abra a entrada desejada",
   "Confira o estado antes de tentar novo envio"
  ],
  "Enfileirado não significa entregue ao destinatário."
 ],
 [
  "Rascunhos e composição",
  "Cancelar um envio ainda pendente",
  "Como cancelar um envio ainda pendente no TCS Mail.",
  [
   "Abra Envios",
   "Encontre a mensagem com estado cancelável",
   "Clique Cancelar",
   "Confira o estado atualizado"
  ],
  "Depois de enviado ao servidor, cancelar pode não ser possível."
 ],
 [
  "Rascunhos e composição",
  "Exibir rascunhos locais",
  "Como exibir rascunhos locais no TCS Mail.",
  [
   "Expanda a conta na barra lateral",
   "Clique em Rascunhos",
   "Limpe filtros de pesquisa da coluna central",
   "Confira se os rascunhos locais aparecem"
  ],
  "Uma contagem positiva com lista vazia pode ser efeito de filtro."
 ],
 [
  "Rascunhos e composição",
  "Retomar edição de um rascunho",
  "Como retomar edição de um rascunho no TCS Mail.",
  [
   "Abra Rascunhos da conta",
   "Clique no rascunho desejado",
   "Aguarde a abertura do editor",
   "Confira assunto, destinatários e texto antes de alterar"
  ],
  "Se a edição não abrir, preserve o rascunho e registre o erro."
 ],
 [
  "Rascunhos e composição",
  "Identificar cópias locais e remotas",
  "Como identificar cópias locais e remotas no TCS Mail.",
  [
   "Abra Rascunhos da conta",
   "Observe o que o aplicativo identifica como local ou remoto",
   "Sincronize a pasta quando houver conexão",
   "Compare os registros antes de excluir duplicações"
  ],
  "Rascunhos de outros dispositivos podem precisar de sincronização."
 ],
 [
  "Rascunhos e composição",
  "Trabalhar em rascunho sem internet",
  "Como trabalhar em rascunho sem internet no TCS Mail.",
  [
   "Abra um rascunho local disponível",
   "Edite e aguarde o salvamento local",
   "Não conclua o envio sem conexão",
   "Após reconectar, confira o estado da sincronização"
  ],
  "O servidor pode não ter recebido a última alteração."
 ],
 [
  "Rascunhos e composição",
  "Evitar perder texto ao fechar o editor",
  "Como evitar perder texto ao fechar o editor no TCS Mail.",
  [
   "Termine de digitar e aguarde a indicação de salvamento",
   "Feche o editor pelo controle próprio",
   "Abra Rascunhos novamente",
   "Confira a última alteração"
  ],
  "Não force o encerramento enquanto uma gravação estiver em andamento."
 ],
 [
  "Rascunhos e composição",
  "Selecionar rascunhos separados",
  "Como selecionar rascunhos separados no TCS Mail.",
  [
   "Abra a lista de Rascunhos",
   "Segure Ctrl ou Command",
   "Clique nos rascunhos desejados",
   "Confirme a contagem antes de excluir"
  ],
  "Selecionar não envia nem exclui nada por si só."
 ],
 [
  "Rascunhos e composição",
  "Selecionar intervalo de rascunhos",
  "Como selecionar intervalo de rascunhos no TCS Mail.",
  [
   "Abra Rascunhos",
   "Clique no primeiro rascunho",
   "Segure Shift e clique no último",
   "Revise todos os itens destacados"
  ],
  "O intervalo segue a ordenação mostrada."
 ],
 [
  "Rascunhos e composição",
  "Revisar rascunhos antes de excluir",
  "Como revisar rascunhos antes de excluir no TCS Mail.",
  [
   "Abra Rascunhos",
   "Selecione os itens",
   "Confira destinatário e assunto de cada um",
   "Confirme a exclusão apenas quando tiver certeza"
  ],
  "Uma cópia remota pode exigir tratamento separado."
 ],
 [
  "Rascunhos e composição",
  "Investigar duplicações de rascunhos",
  "Como investigar duplicações de rascunhos no TCS Mail.",
  [
   "Abra a pasta de Rascunhos",
   "Compare o texto e a data dos registros suspeitos",
   "Sincronize a pasta para atualizar as informações",
   "Preserve ambos enquanto houver dúvida"
  ],
  "Nomes iguais não provam que os rascunhos são idênticos."
 ],
 [
  "Rascunhos e composição",
  "Resolver rascunho preso após falha de rede",
  "Como resolver rascunho preso após falha de rede no TCS Mail.",
  [
   "Confira se a mensagem permanece nos rascunhos locais",
   "Reestabeleça a conexão",
   "Sincronize a conta",
   "Abra o rascunho e confira as alterações antes de enviar"
  ],
  "Evite recriar e enviar cópias antes de conferir a fila."
 ],
 [
  "Contas e pastas",
  "Expandir e recolher contas",
  "Como expandir e recolher contas no TCS Mail.",
  [
   "Localize o nome da conta na barra lateral",
   "Clique na seta de expansão",
   "Selecione uma pasta para abri-la",
   "Recolha a conta quando desejar liberar espaço"
  ],
  "Recolher não altera dados no servidor."
 ],
 [
  "Contas e pastas",
  "Exibir pastas adicionais",
  "Como exibir pastas adicionais no TCS Mail.",
  [
   "Expanda a conta",
   "Clique em Mais pastas",
   "Localize a pasta desejada",
   "Selecione-a para ver as mensagens"
  ],
  "O nome real da pasta depende do provedor."
 ],
 [
  "Contas e pastas",
  "Abrir Enviados da conta certa",
  "Como abrir Enviados da conta certa no TCS Mail.",
  [
   "Expanda a conta correta",
   "Clique em Enviados sob essa conta",
   "Confira Para na listagem",
   "Se a pasta parecer incompleta, sincronize sem refazer a conta"
  ],
  "Contas diferentes podem usar nomes remotos distintos para Enviados."
 ],
 [
  "Contas e pastas",
  "Sincronizar apenas a pasta atual",
  "Como sincronizar apenas a pasta atual no TCS Mail.",
  [
   "Selecione a pasta na barra lateral",
   "Clique Sincronizar no cabeçalho da listagem",
   "Aguarde o término da operação",
   "Confira se novas mensagens apareceram"
  ],
  "Uma pasta diferente pode não ser atualizada nesse comando."
 ],
 [
  "Contas e pastas",
  "Recuperar mensagens antigas",
  "Como recuperar mensagens antigas no TCS Mail.",
  [
   "Abra a pasta",
   "Aguarde a sincronização das páginas recentes",
   "Mantenha a pasta aberta para continuar o histórico",
   "Repita Sincronizar depois se o histórico estiver parcial"
  ],
  "Recuperação histórica pode demorar em caixas grandes."
 ],
 [
  "Contas e pastas",
  "Lidar com paginação lenta",
  "Como lidar com paginação lenta no TCS Mail.",
  [
   "Role a lista de mensagens até perto do final",
   "Aguarde a próxima página carregar",
   "Evite clicar repetidamente enquanto ela carrega",
   "Se parar, registre o diagnóstico da conta"
  ],
  "Uma página carregada não é toda a caixa."
 ],
 [
  "Contas e pastas",
  "Acessar pastas de outra conta",
  "Como acessar pastas de outra conta no TCS Mail.",
  [
   "Recolha a primeira conta se necessário",
   "Expanda a segunda conta",
   "Selecione Caixa de entrada, Enviados ou outra pasta",
   "Confirme o nome destacado"
  ],
  "A conta ativa determina o servidor consultado."
 ],
 [
  "Contas e pastas",
  "Distinguir Spam e Lixeira",
  "Como distinguir Spam e Lixeira no TCS Mail.",
  [
   "Expanda as pastas da conta",
   "Abra Spam para mensagens classificadas como suspeitas",
   "Abra Lixeira para mensagens excluídas",
   "Escolha a pasta de destino correta ao mover"
  ],
  "Mover para Spam pode treinar filtros do provedor."
 ],
 [
  "Contas e pastas",
  "Reencontrar mensagem movida",
  "Como reencontrar mensagem movida no TCS Mail.",
  [
   "Lembre a pasta de destino",
   "Abra a conta correta e selecione a pasta",
   "Pesquise por assunto ou remetente",
   "Sincronize se a mensagem ainda não aparecer"
  ],
  "A movimentação remota pode levar alguns instantes."
 ],
 [
  "Contas e pastas",
  "Conferir uma pasta unificada",
  "Como conferir uma pasta unificada no TCS Mail.",
  [
   "Abra Caixa unificada",
   "Limpe buscas e filtros ativos",
   "Confira se as contas esperadas estão habilitadas",
   "Abra a caixa individual de cada conta para comparar"
  ],
  "Caixa unificada não garante que todos os servidores estejam on-line."
 ],
 [
  "Contas e pastas",
  "Confirmar falha de autenticação sem apagar dados",
  "Como confirmar falha de autenticação sem apagar dados no TCS Mail.",
  [
   "Abra Configurações → Contas",
   "Execute o diagnóstico da conta",
   "Observe separadamente conexão e autenticação",
   "Confira configurações com o provedor antes de alterar senhas"
  ],
  "AUTHENTICATIONFAILED não prova perda de e-mails locais."
 ],
 [
  "Contas e pastas",
  "Resolver pastas com nomes diferentes",
  "Como resolver pastas com nomes diferentes no TCS Mail.",
  [
   "Abra Mais pastas sob a conta",
   "Localize Enviados, Lixeira ou Rascunhos conforme o servidor",
   "Confira o mapeamento em Configurações → Pastas e sincronização, se disponível",
   "Sincronize sem renomear pastas do servidor por tentativa"
  ],
  "Pastas especiais usam marcações IMAP que variam entre servidores."
 ],
 [
  "Aparência e leitura",
  "Seguir o tema do sistema",
  "Como seguir o tema do sistema no TCS Mail.",
  [
   "Abra Configurações → Aparência",
   "Na janela principal, selecione Sistema",
   "Feche e reabra Configurações para conferir a paleta",
   "Alterne claro/escuro no sistema quando desejar testar"
  ],
  "O tema do composer independente pode ser definido separadamente."
 ],
 [
  "Aparência e leitura",
  "Alterar o tema do composer separado",
  "Como alterar o tema do composer separado no TCS Mail.",
  [
   "Abra Configurações → Aparência",
   "Encontre Tema do Composer (janela independente)",
   "Selecione Seguir tema global ou outra opção",
   "Abra Nova mensagem em janela independente para testar"
  ],
  "O editor embutido utiliza a aparência da janela principal."
 ],
 [
  "Aparência e leitura",
  "Testar modelos de navegação 4 a 6",
  "Como testar modelos de navegação 4 a 6 no TCS Mail.",
  [
   "Abra Configurações → Aparência",
   "Encontre Navegação de contas e pastas",
   "Selecione o modelo 4, 5 ou 6",
   "Feche Configurações e confirme os controles na lateral"
  ],
  "Se algum comando deixar de responder, registre o modelo usado."
 ],
 [
  "Aparência e leitura",
  "Trocar tema sem perder uma edição",
  "Como trocar tema sem perder uma edição no TCS Mail.",
  [
   "Salve o rascunho em edição",
   "Abra Configurações → Aparência",
   "Altere o tema",
   "Retorne ao editor e confira o texto antes de enviar"
  ],
  "O tema não deve alterar o conteúdo do rascunho."
 ],
 [
  "Aparência e leitura",
  "Ajustar o tempo de marcar como lida",
  "Como ajustar o tempo de marcar como lida no TCS Mail.",
  [
   "Abra Configurações → Leitura",
   "Encontre a opção de marcar mensagem como lida",
   "Escolha o tempo desejado",
   "Abra uma mensagem e confirme o comportamento"
  ],
  "O padrão de instalação nova é 1 segundo."
 ],
 [
  "Aparência e leitura",
  "Ampliar a lista de mensagens",
  "Como ampliar a lista de mensagens no TCS Mail.",
  [
   "Posicione o cursor na divisória entre lista e leitura",
   "Arraste para ampliar a coluna central",
   "Solte a divisória",
   "Confira títulos longos após o ajuste"
  ],
  "A largura mínima depende do tamanho da janela."
 ],
 [
  "Aparência e leitura",
  "Retornar ao topo das Configurações",
  "Como retornar ao topo das Configurações no TCS Mail.",
  [
   "Abra Configurações",
   "Clique em qualquer seção lateral",
   "Espere a seção terminar de carregar",
   "Confira se o início está visível, rolando até o topo se necessário"
  ],
  "Cada aba deve começar do topo ao ser aberta."
 ],
 [
  "Aparência e leitura",
  "Escolher visualização por texto",
  "Como escolher visualização por texto no TCS Mail.",
  [
   "Abra uma mensagem",
   "Procure a opção Texto simples no visualizador, se disponível",
   "Ative-a para comparar o conteúdo",
   "Volte ao modo anterior conforme desejar"
  ],
  "Texto simples pode omitir elementos visuais do HTML."
 ],
 [
  "Aparência e leitura",
  "Alterar a orientação da lista",
  "Como alterar a orientação da lista no TCS Mail.",
  [
   "Abra Configurações → Aparência",
   "Encontre as opções de layout de leitura, se disponíveis",
   "Escolha a disposição desejada",
   "Abra a pasta e confira as proporções"
  ],
  "Nem todo tamanho de janela comporta todos os layouts."
 ],
 [
  "Aparência e leitura",
  "Voltar à configuração visual anterior",
  "Como voltar à configuração visual anterior no TCS Mail.",
  [
   "Abra Configurações → Aparência",
   "Escolha o tema anterior",
   "Restaure o modelo de navegação que preferia",
   "Confira a janela principal e o composer"
  ],
  "Aparência não precisa afetar dados de e-mail."
 ],
 [
  "Privacidade e IA",
  "Perguntar antes de carregar imagens",
  "Como perguntar antes de carregar imagens no TCS Mail.",
  [
   "Abra Configurações → Privacidade e segurança",
   "Encontre Imagens remotas",
   "Escolha Perguntar",
   "Abra um e-mail com imagens externas e decida se confia no remetente"
  ],
  "Imagens remotas podem comunicar sua abertura ao remetente."
 ],
 [
  "Privacidade e IA",
  "Bloquear rastreamento remoto",
  "Como bloquear rastreamento remoto no TCS Mail.",
  [
   "Abra Configurações → Privacidade e segurança",
   "Ative Bloquear rastreamento remoto",
   "Mantenha imagens remotas em Perguntar se desejar",
   "Teste numa mensagem de conteúdo remoto"
  ],
  "Nenhum bloqueio é absoluto contra todos os tipos de rastreamento."
 ],
 [
  "Privacidade e IA",
  "Desativar IA opcional",
  "Como desativar IA opcional no TCS Mail.",
  [
   "Abra Configurações → IA e RAG",
   "Desative o provedor ou a integração desejada",
   "Volte ao leitor ou composer",
   "Use normalmente as funções sem IA"
  ],
  "E-mail, IMAP e SMTP não exigem IA."
 ],
 [
  "Privacidade e IA",
  "Selecionar provedor de IA",
  "Como selecionar provedor de IA no TCS Mail.",
  [
   "Abra Configurações → IA e RAG",
   "Confira os provedores compatíveis disponíveis",
   "Escolha o que deseja usar",
   "Revise permissões e salve a configuração"
  ],
  "Não envie conteúdo sensível ao provedor sem consentimento apropriado."
 ],
 [
  "Privacidade e IA",
  "Reescrever mensagem com IA",
  "Como reescrever mensagem com IA no TCS Mail.",
  [
   "Abra uma composição com texto",
   "Acesse as ferramentas opcionais de IA",
   "Escolha reescrever e o estilo desejado",
   "Revise o resultado antes de aplicar ou enviar"
  ],
  "Sugestões de IA podem conter erros factuais."
 ],
 [
  "Privacidade e IA",
  "Revisar clareza e gramática",
  "Como revisar clareza e gramática no TCS Mail.",
  [
   "Abra o composer",
   "Digite o texto inicial",
   "Use Corrigir gramática e clareza quando disponível",
   "Compare sugestões e preserve sua intenção original"
  ],
  "A IA não deve enviar mensagens automaticamente."
 ],
 [
  "Privacidade e IA",
  "Confirmar uma resposta gerada",
  "Como confirmar uma resposta gerada no TCS Mail.",
  [
   "Abra a mensagem recebida e comece a resposta",
   "Solicite a sugestão à IA configurada",
   "Verifique nomes, datas, fatos e destinatários",
   "Somente depois aprove e envie"
  ],
  "Não confie em citações ou promessas não verificadas."
 ],
 [
  "Privacidade e IA",
  "Analisar e-mail sem enviar nada",
  "Como analisar e-mail sem enviar nada no TCS Mail.",
  [
   "Selecione uma mensagem",
   "Abra a função de IA disponível no leitor",
   "Escolha uma análise ou resumo",
   "Revise o resultado e feche sem responder"
  ],
  "A análise não deve ser interpretada como prova de legitimidade."
 ],
 [
  "Privacidade e IA",
  "Tratar erro do provedor de IA",
  "Como tratar erro do provedor de IA no TCS Mail.",
  [
   "Abra Configurações → IA e RAG",
   "Confira se o provedor está configurado",
   "Execute o diagnóstico da integração, quando disponível",
   "Copie a mensagem de erro sem tokens para suporte"
  ],
  "Não cole chaves privadas no relatório de suporte."
 ],
 [
  "Contatos e calendário",
  "Buscar um contato",
  "Como buscar um contato no TCS Mail.",
  [
   "Abra Contatos",
   "Digite nome ou e-mail no campo Pesquisar",
   "Selecione o resultado",
   "Confirme o endereço antes de enviar uma mensagem"
  ],
  "Contatos podem ser locais ou provenientes de uma fonte."
 ],
 [
  "Contatos e calendário",
  "Importar contatos por vCard",
  "Como importar contatos por vCard no TCS Mail.",
  [
   "Abra Contatos",
   "Clique Importar vCard",
   "Escolha o arquivo .vcf",
   "Confira os contatos adicionados"
  ],
  "Guarde uma cópia do arquivo original antes de importar."
 ],
 [
  "Contatos e calendário",
  "Exportar contatos como vCard",
  "Como exportar contatos como vCard no TCS Mail.",
  [
   "Abra Contatos",
   "Clique Exportar vCard",
   "Escolha o destino do arquivo",
   "Guarde o backup em lugar seguro"
  ],
  "Arquivos vCard contêm dados pessoais."
 ],
 [
  "Contatos e calendário",
  "Criar grupo de contatos",
  "Como criar grupo de contatos no TCS Mail.",
  [
   "Abra Contatos",
   "Clique Grupos",
   "Crie um novo grupo",
   "Inclua e confira os contatos desejados"
  ],
  "Grupos não autorizam envio em massa não solicitado."
 ],
 [
  "Contatos e calendário",
  "Configurar fonte CardDAV",
  "Como configurar fonte CardDAV no TCS Mail.",
  [
   "Abra Contatos",
   "Clique CardDAV",
   "Informe os dados da fonte conforme o serviço",
   "Salve e teste a sincronização"
  ],
  "Seu provedor pode exigir senha de aplicativo ou OAuth próprio."
 ],
 [
  "Contatos e calendário",
  "Evitar contatos duplicados",
  "Como evitar contatos duplicados no TCS Mail.",
  [
   "Abra Contatos",
   "Pesquise pelo nome e e-mail",
   "Compare os registros antes de importar novamente",
   "Preserve os dados mais completos"
  ],
  "Não exclua contatos em lote sem backup."
 ],
 [
  "Contatos e calendário",
  "Conferir dados de evento",
  "Como conferir dados de evento no TCS Mail.",
  [
   "Abra Calendário",
   "Navegue até o dia desejado",
   "Abra o evento",
   "Confira início, término e localização"
  ],
  "Verifique o fuso horário ao lidar com participantes de fora."
 ],
 [
  "Contatos e calendário",
  "Criar evento de dia inteiro",
  "Como criar evento de dia inteiro no TCS Mail.",
  [
   "Abra Calendário",
   "Escolha a data",
   "Abra Novo evento e marque Dia inteiro quando disponível",
   "Salve e confira a posição na agenda"
  ],
  "Eventos de dia inteiro não precisam de horário específico."
 ],
 [
  "Contatos e calendário",
  "Conferir lembretes e notificações",
  "Como conferir lembretes e notificações no TCS Mail.",
  [
   "Abra Configurações → Notificações",
   "Ative Agenda e lembretes",
   "Confira permissões do sistema",
   "Crie um evento de teste com lembrete quando disponível"
  ],
  "Lembretes podem depender do funcionamento do aplicativo."
 ],
 [
  "Contatos e calendário",
  "Organizar tarefas pendentes",
  "Como organizar tarefas pendentes no TCS Mail.",
  [
   "Abra Calendário ou Tarefas",
   "Veja tarefas abertas",
   "Abra uma tarefa para revisar prazos",
   "Atualize ou conclua quando necessário"
  ],
  "Nem todas as fontes de calendário compartilham tarefas."
 ],
 [
  "Suporte e diagnóstico",
  "Preparar relatório de suporte",
  "Como preparar relatório de suporte no TCS Mail.",
  [
   "Abra Configurações → Diagnóstico e avançado",
   "Abra o relatório de eventos",
   "Revise se não há dados pessoais",
   "Copie ou envie para tcsmail@thecreativesolver.com conforme sua preferência"
  ],
  "Revise qualquer relatório antes de compartilhar."
 ],
 [
  "Suporte e diagnóstico",
  "Enviar log apenas quando eu decidir",
  "Como enviar log apenas quando eu decidir no TCS Mail.",
  [
   "Abra Configurações → Diagnóstico e avançado",
   "Encontre Relatórios de falhas e suporte",
   "Selecione Sempre perguntar",
   "Confirme a preferência salva"
  ],
  "Essa é a configuração padrão de instalações novas."
 ],
 [
  "Suporte e diagnóstico",
  "Impedir envio de logs",
  "Como impedir envio de logs no TCS Mail.",
  [
   "Abra Configurações → Diagnóstico e avançado",
   "Localize a preferência de envio",
   "Selecione Nunca enviar",
   "Confira se o modo foi salvo"
  ],
  "Logs podem continuar disponíveis localmente para diagnóstico."
 ],
 [
  "Suporte e diagnóstico",
  "Autorizar envio automático de logs",
  "Como autorizar envio automático de logs no TCS Mail.",
  [
   "Abra Configurações → Diagnóstico e avançado",
   "Leia o aviso de privacidade",
   "Selecione Sempre enviar se desejar",
   "Revise se há conta de envio disponível"
  ],
  "Uma tentativa automática de envio pode ficar enfileirada."
 ],
 [
  "Suporte e diagnóstico",
  "Entender aviso de encerramento inesperado",
  "Como entender aviso de encerramento inesperado no TCS Mail.",
  [
   "Abra o TCS Mail após um fechamento forçado",
   "Leia o aviso de possível encerramento inesperado",
   "Escolha enviar, ignorar ou alterar a preferência",
   "Consulte o log se o problema se repetir"
  ],
  "Um desligamento abrupto não comprova defeito no aplicativo."
 ],
 [
  "Suporte e diagnóstico",
  "Encontrar logs sem revelar senhas",
  "Como encontrar logs sem revelar senhas no TCS Mail.",
  [
   "Abra Configurações → Diagnóstico e avançado",
   "Use a visualização de eventos recentes",
   "Copie somente o relatório necessário",
   "Confira se não há dados pessoais antes de compartilhar"
  ],
  "Não envie tokens, passwords ou o corpo de mensagens."
 ],
 [
  "Suporte e diagnóstico",
  "Diferenciar IMAP conexão e login",
  "Como diferenciar IMAP conexão e login no TCS Mail.",
  [
   "Abra o diagnóstico da conta",
   "Localize IMAP conexão e IMAP login",
   "Se conexão OK e login falha, confira usuário e autorização",
   "Não altere portas por tentativa"
  ],
  "AUTHENTICATIONFAILED normalmente indica rejeição do servidor."
 ],
 [
  "Suporte e diagnóstico",
  "Interpretar erro SMTP 535",
  "Como interpretar erro SMTP 535 no TCS Mail.",
  [
   "Abra o diagnóstico da conta",
   "Procure SMTP e o código 535",
   "Confira conta, credenciais e política do servidor",
   "Teste somente após confirmar com o provedor"
  ],
  "SMTP TCP OK não garante autenticação."
 ],
 [
  "Suporte e diagnóstico",
  "Resolver interface congelada",
  "Como resolver interface congelada no TCS Mail.",
  [
   "Anote a aba e ação que falharam",
   "Tente voltar sem repetir operações destrutivas",
   "Se necessário, reinicie o aplicativo",
   "Consulte o diagnóstico e reporte como reproduzir"
  ],
  "Não apague bancos para resolver travamentos de interface."
 ],
 [
  "Suporte e diagnóstico",
  "Registrar passos de reprodução",
  "Como registrar passos de reprodução no TCS Mail.",
  [
   "Anote a versão em Sobre",
   "Descreva a ação inicial e a sequência de cliques",
   "Informe o resultado esperado e o que aconteceu",
   "Envie um relatório sem informações pessoais"
  ],
  "Capturas com mensagens reais precisam ser anonimizadas."
 ],
 [
  "Suporte e diagnóstico",
  "Verificar se estou na versão nova",
  "Como verificar se estou na versão nova no TCS Mail.",
  [
   "Abra Sobre no TCS Mail",
   "Confira 0.8.2-rc6",
   "No Linux, verifique o executável via command -v tcs-mail",
   "Não desinstale outra versão sem identificar seus caminhos"
  ],
  "Não remova diretórios ~/.config ou ~/.local/share do aplicativo."
 ],
 [
  "Suporte e diagnóstico",
  "Recuperar erro após troca de servidor",
  "Como recuperar erro após troca de servidor no TCS Mail.",
  [
   "Abra Configurações → Contas",
   "Edite a conta afetada",
   "Recoloque os servidores comprovadamente usados antes",
   "Salve e execute Diagnóstico IMAP/SMTP"
  ],
  "Não use imap.dominio como substituição sem evidência do provedor."
 ],
 [
  "Suporte e diagnóstico",
  "Conferir se um envio chegou ao servidor",
  "Como conferir se um envio chegou ao servidor no TCS Mail.",
  [
   "Abra Envios e localize a mensagem",
   "Leia o estado em fila, agendado ou falha",
   "Confira Enviados da conta depois da sincronização",
   "Só reenvie após confirmar que não foi aceito pelo servidor"
  ],
  "Não confunda enfileirado com entregue."
 ],
 [
  "Suporte e diagnóstico",
  "Enviar uma sugestão de melhoria",
  "Como enviar uma sugestão de melhoria no TCS Mail.",
  [
   "Abra Configurações → Sobre",
   "Escolha Enviar feedback",
   "Descreva a função e o resultado desejado",
   "Revise e envie sem dados sensíveis"
  ],
  "Uma sugestão não precisa conter um log técnico."
 ],
 [
  "Suporte e diagnóstico",
  "Conferir versões do instalador",
  "Como conferir versões do instalador no TCS Mail.",
  [
   "Abra Sobre no aplicativo",
   "Confira o rótulo Release Candidate e a versão",
   "No Linux, consulte a versão do pacote instalado se necessário",
   "Reporte divergências com o caminho do executável"
  ],
  "Versão RC não é uma publicação final."
 ]
]);
GUIDES["en-US"].push(...[
 [
  "Getting started",
  "Check your installed version",
  "How to check your installed version in TCS Mail.",
  [
   "Open Settings",
   "Choose About",
   "Check for version 0.8.2-rc6 and the official website",
   "If it differs, inspect the installer without deleting accounts"
  ],
  "The app version can differ from the source archive label."
 ],
 [
  "Getting started",
  "Choose the default account",
  "How to choose the default account in TCS Mail.",
  [
   "Open Settings → General",
   "Find Default account",
   "Select the preferred account",
   "Compose a message and check From"
  ],
  "Changing the default does not rewrite sent messages."
 ],
 [
  "Getting started",
  "Check account server addresses",
  "How to check account server addresses in TCS Mail.",
  [
   "Open Settings → Accounts",
   "Edit the relevant account",
   "Compare IMAP and SMTP against the provider's instructions",
   "Save only after checking the values"
  ],
  "A proposed imap.domain host is not proof of a valid server."
 ],
 [
  "Getting started",
  "Check the IMAP username",
  "How to check the IMAP username in TCS Mail.",
  [
   "Open Settings → Accounts",
   "Edit the account",
   "Compare the IMAP username with provider instructions",
   "Run diagnostics without deleting mail"
  ],
  "Some servers require the full email address as username."
 ],
 [
  "Getting started",
  "Understand passwords and OAuth",
  "How to understand passwords and OAuth in TCS Mail.",
  [
   "Open Settings → Accounts",
   "Inspect the account authentication method",
   "For OAuth, use Reconnect instead of entering a regular password",
   "For passwords, verify what the provider requires"
  ],
  "Do not change authentication methods on a working account by guesswork."
 ],
 [
  "Getting started",
  "Add another mailbox",
  "How to add another mailbox in TCS Mail.",
  [
   "Open Settings → Accounts",
   "Choose Add account",
   "Enter the full address and complete authorization",
   "Verify both accounts appear in the sidebar"
  ],
  "There is no need to remove the first account."
 ],
 [
  "Getting started",
  "Change the mailbox label",
  "How to change the mailbox label in TCS Mail.",
  [
   "Open Settings → Accounts",
   "Edit the account",
   "Change its local display name",
   "Save and check the sidebar"
  ],
  "The local label does not change the mailbox address."
 ],
 [
  "Getting started",
  "Understand account versus folder",
  "How to understand account versus folder in TCS Mail.",
  [
   "Expand the account in the left column",
   "Locate Inbox, Sent and other folders",
   "Select the intended folder",
   "Check the active highlight before acting"
  ],
  "Unified Inbox aggregates more than one account."
 ],
 [
  "Getting started",
  "Change the interface language",
  "How to change the interface language in TCS Mail.",
  [
   "Open Settings → General",
   "Locate Application language",
   "Choose System, Portuguese or English",
   "Wait for the interface to reload"
  ],
  "The change does not translate received email content."
 ],
 [
  "Getting started",
  "Set the default email client",
  "How to set the default email client in TCS Mail.",
  [
   "Open Settings → General",
   "Select Set TCS Mail as default mail client",
   "Follow the operating system prompt",
   "Test a trusted mailto: link"
  ],
  "Your operating system may require separate confirmation."
 ],
 [
  "Getting started",
  "Diagnose first-run setup errors",
  "How to diagnose first-run setup errors in TCS Mail.",
  [
   "Open Settings → Accounts",
   "Confirm address, server and login method",
   "Run account diagnostics",
   "Compare the returned errors with support guidance"
  ],
  "A successful TCP connection does not prove authentication."
 ],
 [
  "Getting started",
  "Keep data when updating",
  "How to keep data when updating in TCS Mail.",
  [
   "Close TCS Mail before installing a new package",
   "Preserve user configuration and data folders",
   "Update using the platform package manager",
   "Open About to verify the version"
  ],
  "Never delete message databases or keyrings to fix an installer."
 ],
 [
  "Messages",
  "Identify a message's account",
  "How to identify a message's account in TCS Mail.",
  [
   "Open Unified Inbox or a folder",
   "Select the message",
   "Inspect account and folder details in the viewer",
   "Open that account in the sidebar"
  ],
  "Unified inboxes combine results without moving mail."
 ],
 [
  "Messages",
  "Return to Inbox",
  "How to return to Inbox in TCS Mail.",
  [
   "Expand the account in the sidebar",
   "Click Inbox",
   "Clear any active search filter if necessary",
   "Confirm the folder is selected"
  ],
  "An active filter may make a folder look empty."
 ],
 [
  "Messages",
  "Show unread messages",
  "How to show unread messages in TCS Mail.",
  [
   "Open the chosen folder",
   "Select Unread in the top toolbar",
   "Check the count and list",
   "Select All to restore the view"
  ],
  "Filtering does not delete messages."
 ],
 [
  "Messages",
  "Clear message filters",
  "How to clear message filters in TCS Mail.",
  [
   "Select All above the message list",
   "Clear the search input",
   "Check for remaining filters",
   "Sync the folder if the list remains incomplete"
  ],
  "Filtering and unsynced mail are different issues."
 ],
 [
  "Messages",
  "Select a range with Shift",
  "How to select a range with Shift in TCS Mail.",
  [
   "Click the first message",
   "Hold Shift",
   "Click the last message in the range",
   "Review the selection before acting"
  ],
  "Selection applies to currently listed messages."
 ],
 [
  "Messages",
  "Select nonadjacent items with Ctrl",
  "How to select nonadjacent items with Ctrl in TCS Mail.",
  [
   "Click the first message",
   "Hold Ctrl on Linux or Windows, or Command on macOS",
   "Click the additional messages",
   "Release the key and review the selection"
  ],
  "Do not keep focus in a text editor while selecting messages."
 ],
 [
  "Messages",
  "Clear a multi-selection",
  "How to clear a multi-selection in TCS Mail.",
  [
   "Open the message list",
   "Click outside the selection when supported",
   "Use checkboxes to deselect items",
   "Verify that the action bar no longer shows multiple messages"
  ],
  "Review selection before bulk move or delete."
 ],
 [
  "Messages",
  "Sort messages by date",
  "How to sort messages by date in TCS Mail.",
  [
   "Open a folder",
   "Open the sort menu above the list",
   "Choose Date",
   "Use the direction control to reverse order"
  ],
  "Visual order does not alter server contents."
 ],
 [
  "Messages",
  "Sort messages by sender",
  "How to sort messages by sender in TCS Mail.",
  [
   "Open the intended folder",
   "Open sorting",
   "Choose From or Sender when available",
   "Check ascending versus descending order"
  ],
  "Sent folders may display To instead."
 ],
 [
  "Messages",
  "Find recipients in Sent",
  "How to find recipients in Sent in TCS Mail.",
  [
   "Open the account's Sent folder",
   "Look for To in the message list",
   "Optionally sort by To",
   "Open the message to verify all recipients"
  ],
  "Lists may abbreviate recipients; details remain in the message."
 ],
 [
  "Messages",
  "Search by subject",
  "How to search by subject in TCS Mail.",
  [
   "Click Search messages",
   "Enter subject: followed by your term",
   "Wait for local results",
   "Clear the query to restore the list"
  ],
  "Only locally indexed messages can be matched."
 ],
 [
  "Messages",
  "Search by sender",
  "How to search by sender in TCS Mail.",
  [
   "Open Search messages",
   "Type from: followed by an address or name",
   "Review matches",
   "Select All to remove other filters"
  ],
  "Try the full address when a display name finds nothing."
 ],
 [
  "Messages",
  "Find email with attachments",
  "How to find email with attachments in TCS Mail.",
  [
   "Open search above the list",
   "Enter has:attachment",
   "Combine with the intended folder or account",
   "Open a match to inspect attachments"
  ],
  "Attachments not yet downloaded may require connectivity."
 ],
 [
  "Messages",
  "Check read status",
  "How to check read status in TCS Mail.",
  [
   "Open the folder containing the message",
   "Inspect its read or unread appearance",
   "Select it and wait for the configured delay",
   "Use Mark read/unread if needed"
  ],
  "Server-side flags may update after a delay."
 ],
 [
  "Messages",
  "Manually mark mail read/unread",
  "How to manually mark mail read/unread in TCS Mail.",
  [
   "Select the messages",
   "Open the marking action in the toolbar",
   "Choose Read or Unread",
   "Verify the updated indicator"
  ],
  "Some actions depend on mailbox permissions."
 ],
 [
  "Messages",
  "Use message stars",
  "How to use message stars in TCS Mail.",
  [
   "Select a message",
   "Click the star control",
   "Open Starred in the sidebar",
   "Click again to unstar"
  ],
  "Starring does not move a message."
 ],
 [
  "Messages",
  "Handle suspicious email",
  "How to handle suspicious email in TCS Mail.",
  [
   "Avoid suspicious links and attachments",
   "Select the message",
   "Use the Spam action in the toolbar",
   "If legitimate, review classification before deletion"
  ],
  "App features do not replace security precautions."
 ],
 [
  "Messages",
  "Inspect original message source",
  "How to inspect original message source in TCS Mail.",
  [
   "Open the message",
   "Use the source/details action when available",
   "Inspect headers without editing",
   "Redact addresses and tokens before sharing with support"
  ],
  "Headers may contain private information."
 ],
 [
  "Drafts and composition",
  "Reply to an email",
  "How to reply to an email in TCS Mail.",
  [
   "Open the received message",
   "Choose Reply",
   "Check sender identity, recipient and quote",
   "Write and review before Send"
  ],
  "A reply can inherit the original account identity."
 ],
 [
  "Drafts and composition",
  "Reply to all",
  "How to reply to all in TCS Mail.",
  [
   "Open the message",
   "Choose Reply all",
   "Check the entire recipient list",
   "Remove any unintended recipients"
  ],
  "Reply all may include external participants."
 ],
 [
  "Drafts and composition",
  "Add a CC recipient",
  "How to add a CC recipient in TCS Mail.",
  [
   "Open New message",
   "Reveal CC in the recipient area",
   "Enter the address",
   "Review To and CC before sending"
  ],
  "CC is visible to recipients."
 ],
 [
  "Drafts and composition",
  "Add a BCC recipient",
  "How to add a BCC recipient in TCS Mail.",
  [
   "Open New message",
   "Reveal BCC in the recipient fields",
   "Enter the address",
   "Review recipients before sending"
  ],
  "BCC should not appear in visible recipient lists."
 ],
 [
  "Drafts and composition",
  "Change the From identity",
  "How to change the From identity in TCS Mail.",
  [
   "Open New message",
   "Select the From field",
   "Choose an authorized account or identity",
   "Review the signature and From address before sending"
  ],
  "The outgoing server must authorize aliases."
 ],
 [
  "Drafts and composition",
  "Set an identity's Reply-To",
  "How to set an identity's Reply-To in TCS Mail.",
  [
   "Open Settings → Composition → Identities & aliases",
   "Create or edit an identity",
   "Set Reply-To and save",
   "Test by sending mail to yourself"
  ],
  "Reply-To does not authorize a From address."
 ],
 [
  "Drafts and composition",
  "Use a signature in new mail",
  "How to use a signature in new mail in TCS Mail.",
  [
   "Open Settings → Composition → Signatures",
   "Create or select a signature",
   "Assign it to the account or identity",
   "Open a new message to check it"
  ],
  "New-mail and reply signatures may differ."
 ],
 [
  "Drafts and composition",
  "Use a separate reply signature",
  "How to use a separate reply signature in TCS Mail.",
  [
   "Open Settings → Composition → Identities & aliases",
   "Edit the relevant identity",
   "Choose the replies/forwards signature",
   "Open a reply to verify it"
  ],
  "Avoid unintentionally replacing the new-mail signature."
 ],
 [
  "Drafts and composition",
  "Create a message template",
  "How to create a message template in TCS Mail.",
  [
   "Open Settings → Composition → Templates",
   "Create a template for recurring content",
   "Save with a clear name",
   "Open the composer and inspect template choices"
  ],
  "Review recipients before reusing templates."
 ],
 [
  "Drafts and composition",
  "Choose HTML or plain text",
  "How to choose HTML or plain text in TCS Mail.",
  [
   "Open Settings → Composition",
   "Find message format",
   "Choose the desired format",
   "Compose a test message and review its appearance"
  ],
  "Replies may preserve the original format."
 ],
 [
  "Drafts and composition",
  "Make text bold",
  "How to make text bold in TCS Mail.",
  [
   "Open the composer",
   "Select the text",
   "Use Bold or Ctrl+B",
   "Review the result before sending"
  ],
  "Plain text does not support rich formatting."
 ],
 [
  "Drafts and composition",
  "Insert a text hyperlink",
  "How to insert a text hyperlink in TCS Mail.",
  [
   "Open the HTML composer",
   "Select text to link",
   "Choose Insert link or Ctrl+K",
   "Enter the URL and check the destination"
  ],
  "Visible link text can differ from the destination."
 ],
 [
  "Drafts and composition",
  "Write a numbered list",
  "How to write a numbered list in TCS Mail.",
  [
   "Open the HTML composer",
   "Position the caret",
   "Choose Numbered list in formatting",
   "Enter the items and end the list when finished"
  ],
  "Formatting can differ across email clients."
 ],
 [
  "Drafts and composition",
  "Clear text formatting",
  "How to clear text formatting in TCS Mail.",
  [
   "Open the draft",
   "Select the text",
   "Use Clear formatting",
   "Verify the text content was preserved"
  ],
  "Clearing style should not delete text."
 ],
 [
  "Drafts and composition",
  "Attach a file to a draft",
  "How to attach a file to a draft in TCS Mail.",
  [
   "Open New message or a draft",
   "Use Attach file",
   "Select an allowed file",
   "Check filename and size before sending"
  ],
  "The server may enforce attachment size limits."
 ],
 [
  "Drafts and composition",
  "Remove an attachment before sending",
  "How to remove an attachment before sending in TCS Mail.",
  [
   "Open a composition containing attachments",
   "Locate the unwanted attachment",
   "Choose Remove beside it",
   "Review remaining files before Send"
  ],
  "Removing from the draft does not delete the original file."
 ],
 [
  "Drafts and composition",
  "Open composer in a separate window",
  "How to open composer in a separate window in TCS Mail.",
  [
   "Open Settings → Composition → Editor",
   "Select separate window",
   "Open New message",
   "If it fails, use diagnostics rather than discarding drafts"
  ],
  "The in-pane editor remains an alternative."
 ],
 [
  "Drafts and composition",
  "Return composer to reading pane",
  "How to return composer to reading pane in TCS Mail.",
  [
   "Open Settings → Composition → Editor",
   "Choose In reading pane",
   "Close or save the current draft",
   "Open New message and verify where it appears"
  ],
  "Changing this preference must not delete drafts."
 ],
 [
  "Drafts and composition",
  "Check the Outbox",
  "How to check the Outbox in TCS Mail.",
  [
   "Open Outbox in the sidebar",
   "Inspect queued, scheduled or failed items",
   "Open the relevant entry",
   "Check its state before retrying"
  ],
  "Queued does not mean delivered."
 ],
 [
  "Drafts and composition",
  "Cancel pending outgoing mail",
  "How to cancel pending outgoing mail in TCS Mail.",
  [
   "Open Outbox",
   "Find an item with a cancelable state",
   "Select Cancel",
   "Verify its updated state"
  ],
  "Cancellation may be impossible after server acceptance."
 ],
 [
  "Drafts and composition",
  "Show local drafts",
  "How to show local drafts in TCS Mail.",
  [
   "Expand the account in the sidebar",
   "Open Drafts",
   "Clear message-list search filters",
   "Check that local drafts appear"
  ],
  "A positive count with an empty list may indicate filtering."
 ],
 [
  "Drafts and composition",
  "Continue editing a draft",
  "How to continue editing a draft in TCS Mail.",
  [
   "Open the account's Drafts",
   "Select the intended draft",
   "Wait for the editor",
   "Review subject, recipients and text before editing"
  ],
  "If the editor fails, preserve the draft and record the error."
 ],
 [
  "Drafts and composition",
  "Understand local and remote drafts",
  "How to understand local and remote drafts in TCS Mail.",
  [
   "Open the account Drafts",
   "Inspect any local or remote labels",
   "Sync when connected",
   "Compare items before removing duplicates"
  ],
  "Drafts from other devices may require synchronization."
 ],
 [
  "Drafts and composition",
  "Edit a draft offline",
  "How to edit a draft offline in TCS Mail.",
  [
   "Open an available local draft",
   "Edit and allow local saving",
   "Do not expect sending while offline",
   "After reconnecting, check sync state"
  ],
  "The server may not have the latest change."
 ],
 [
  "Drafts and composition",
  "Prevent text loss when closing composer",
  "How to prevent text loss when closing composer in TCS Mail.",
  [
   "Finish typing and allow auto-save",
   "Close with the editor control",
   "Reopen Drafts",
   "Check the latest changes"
  ],
  "Avoid force-closing during a save."
 ],
 [
  "Drafts and composition",
  "Select nonadjacent drafts",
  "How to select nonadjacent drafts in TCS Mail.",
  [
   "Open Drafts",
   "Hold Ctrl or Command",
   "Click the intended items",
   "Review the selection count before deletion"
  ],
  "Selection alone does not send or delete anything."
 ],
 [
  "Drafts and composition",
  "Select a draft range",
  "How to select a draft range in TCS Mail.",
  [
   "Open Drafts",
   "Click the first draft",
   "Hold Shift and click the last",
   "Review all highlighted items"
  ],
  "The range follows the displayed sort order."
 ],
 [
  "Drafts and composition",
  "Review drafts before deletion",
  "How to review drafts before deletion in TCS Mail.",
  [
   "Open Drafts",
   "Select the items",
   "Review each subject and recipient",
   "Confirm deletion only when certain"
  ],
  "A remote copy may need separate handling."
 ],
 [
  "Drafts and composition",
  "Investigate duplicate drafts",
  "How to investigate duplicate drafts in TCS Mail.",
  [
   "Open Drafts",
   "Compare text and timestamps of suspected duplicates",
   "Sync to refresh the records",
   "Keep both copies while uncertain"
  ],
  "Matching subjects do not establish draft identity."
 ],
 [
  "Drafts and composition",
  "Handle draft after a network error",
  "How to handle draft after a network error in TCS Mail.",
  [
   "Verify the message remains in local drafts",
   "Restore connectivity",
   "Sync the account",
   "Open the draft and review changes before sending"
  ],
  "Avoid re-creating and sending copies before checking Outbox."
 ],
 [
  "Accounts and folders",
  "Expand or collapse accounts",
  "How to expand or collapse accounts in TCS Mail.",
  [
   "Find the account name in the sidebar",
   "Click its disclosure arrow",
   "Choose a folder to open it",
   "Collapse the account to save space"
  ],
  "Collapsing changes only navigation."
 ],
 [
  "Accounts and folders",
  "Show additional folders",
  "How to show additional folders in TCS Mail.",
  [
   "Expand the account",
   "Choose More folders",
   "Find the relevant folder",
   "Select it to see messages"
  ],
  "Folder names depend on the provider."
 ],
 [
  "Accounts and folders",
  "Open the correct Sent folder",
  "How to open the correct Sent folder in TCS Mail.",
  [
   "Expand the intended account",
   "Open its Sent folder",
   "Look for To in the list",
   "If incomplete, sync instead of recreating the account"
  ],
  "Different providers may name Sent differently."
 ],
 [
  "Accounts and folders",
  "Sync the current folder",
  "How to sync the current folder in TCS Mail.",
  [
   "Select the folder in the sidebar",
   "Click Sync above the list",
   "Wait for the operation",
   "Check for new messages"
  ],
  "Other folders may not refresh with this action."
 ],
 [
  "Accounts and folders",
  "Recover older mail",
  "How to recover older mail in TCS Mail.",
  [
   "Open the folder",
   "Wait for recent pages to sync",
   "Keep it open to allow history loading",
   "Sync again later if history remains partial"
  ],
  "History loading can take time in large mailboxes."
 ],
 [
  "Accounts and folders",
  "Handle slow mail pagination",
  "How to handle slow mail pagination in TCS Mail.",
  [
   "Scroll the message list near its end",
   "Wait for the next page",
   "Avoid repeated clicks while loading",
   "If it stalls, record account diagnostics"
  ],
  "One loaded page is not the entire mailbox."
 ],
 [
  "Accounts and folders",
  "Switch to another account folder",
  "How to switch to another account folder in TCS Mail.",
  [
   "Collapse the first account if helpful",
   "Expand the second account",
   "Choose Inbox, Sent or another folder",
   "Verify the active selection"
  ],
  "The active account determines which server is queried."
 ],
 [
  "Accounts and folders",
  "Understand Spam versus Trash",
  "How to understand Spam versus Trash in TCS Mail.",
  [
   "Expand account folders",
   "Open Spam for unwanted mail",
   "Open Trash for deleted mail",
   "Choose the correct folder when moving items"
  ],
  "Moving to Spam can affect provider filtering."
 ],
 [
  "Accounts and folders",
  "Find a moved message",
  "How to find a moved message in TCS Mail.",
  [
   "Recall the destination folder",
   "Open the correct account and folder",
   "Search by subject or sender",
   "Sync if it is still missing"
  ],
  "Remote moves may take time to appear."
 ],
 [
  "Accounts and folders",
  "Check a unified view",
  "How to check a unified view in TCS Mail.",
  [
   "Open Unified Inbox",
   "Clear active search filters",
   "Check that expected accounts are enabled",
   "Compare each account's individual Inbox"
  ],
  "Unified Inbox does not mean every server is online."
 ],
 [
  "Accounts and folders",
  "Check authentication failures safely",
  "How to check authentication failures safely in TCS Mail.",
  [
   "Open Settings → Accounts",
   "Run the account diagnostic",
   "Distinguish connection from authentication",
   "Check provider settings before changing credentials"
  ],
  "AUTHENTICATIONFAILED does not mean local mail was lost."
 ],
 [
  "Accounts and folders",
  "Handle differently named special folders",
  "How to handle differently named special folders in TCS Mail.",
  [
   "Open More folders for the account",
   "Find Sent, Trash or Drafts according to the server",
   "Check mappings under Settings → Folders & sync when available",
   "Sync without randomly renaming server folders"
  ],
  "IMAP special folders can be named differently."
 ],
 [
  "Appearance and reading",
  "Follow system appearance",
  "How to follow system appearance in TCS Mail.",
  [
   "Open Settings → Appearance",
   "Set main window theme to System",
   "Reopen Settings to verify colors",
   "Switch OS light/dark mode to test if desired"
  ],
  "Separate composer windows may have a different theme."
 ],
 [
  "Appearance and reading",
  "Change separate composer theme",
  "How to change separate composer theme in TCS Mail.",
  [
   "Open Settings → Appearance",
   "Find Composer theme (separate window)",
   "Choose Follow global theme or another option",
   "Open a new separate composer window to test"
  ],
  "The in-pane composer uses the main window theme."
 ],
 [
  "Appearance and reading",
  "Test account navigation styles 4 to 6",
  "How to test account navigation styles 4 to 6 in TCS Mail.",
  [
   "Open Settings → Appearance",
   "Find Account and folder navigation",
   "Choose model 4, 5 or 6",
   "Close Settings and inspect sidebar controls"
  ],
  "If a control becomes unresponsive, record the chosen model."
 ],
 [
  "Appearance and reading",
  "Switch themes safely while composing",
  "How to switch themes safely while composing in TCS Mail.",
  [
   "Allow the current draft to save",
   "Open Settings → Appearance",
   "Change the theme",
   "Return to the editor and review text before sending"
  ],
  "Theme changes must not alter draft content."
 ],
 [
  "Appearance and reading",
  "Change mark-as-read delay",
  "How to change mark-as-read delay in TCS Mail.",
  [
   "Open Settings → Reading",
   "Find the mark-as-read delay",
   "Choose the intended time",
   "Open a message and check behavior"
  ],
  "The first-run default is one second."
 ],
 [
  "Appearance and reading",
  "Give the message list more width",
  "How to give the message list more width in TCS Mail.",
  [
   "Place the pointer on the list/reader divider",
   "Drag to widen the message list",
   "Release the divider",
   "Inspect long subject lines"
  ],
  "Minimum widths depend on the window size."
 ],
 [
  "Appearance and reading",
  "Return to top of Settings",
  "How to return to top of Settings in TCS Mail.",
  [
   "Open Settings",
   "Choose a section in the sidebar",
   "Wait for content to load",
   "Check the top is visible, scrolling there if needed"
  ],
  "Each settings page should start at the top."
 ],
 [
  "Appearance and reading",
  "Read as plain text",
  "How to read as plain text in TCS Mail.",
  [
   "Open a message",
   "Find Plain text view when available",
   "Use it to compare content",
   "Return to the previous mode as needed"
  ],
  "Plain text can omit HTML visual elements."
 ],
 [
  "Appearance and reading",
  "Change list layout",
  "How to change list layout in TCS Mail.",
  [
   "Open Settings → Appearance",
   "Find reading layout options if available",
   "Choose the layout",
   "Open a folder and check proportions"
  ],
  "Not every window size supports all layouts."
 ],
 [
  "Appearance and reading",
  "Restore previous appearance",
  "How to restore previous appearance in TCS Mail.",
  [
   "Open Settings → Appearance",
   "Choose the previous theme",
   "Restore your preferred navigation mode",
   "Check main window and composer"
  ],
  "Appearance changes should not affect email data."
 ],
 [
  "Privacy and AI",
  "Ask before loading remote images",
  "How to ask before loading remote images in TCS Mail.",
  [
   "Open Settings → Privacy & security",
   "Find Remote images",
   "Choose Ask",
   "Open mail with external images and decide whether to trust the sender"
  ],
  "Remote images can disclose message opening."
 ],
 [
  "Privacy and AI",
  "Block remote tracking",
  "How to block remote tracking in TCS Mail.",
  [
   "Open Settings → Privacy & security",
   "Enable Block remote tracking",
   "Keep remote images set to Ask if preferred",
   "Test on a message with external content"
  ],
  "No setting prevents every tracking technique."
 ],
 [
  "Privacy and AI",
  "Disable optional AI",
  "How to disable optional AI in TCS Mail.",
  [
   "Open Settings → AI & RAG",
   "Disable the relevant provider or integration",
   "Return to reader or composer",
   "Use non-AI mail features normally"
  ],
  "Email, IMAP and SMTP do not require AI."
 ],
 [
  "Privacy and AI",
  "Select an AI provider",
  "How to select an AI provider in TCS Mail.",
  [
   "Open Settings → AI & RAG",
   "Review supported providers",
   "Select your preferred provider",
   "Review permissions and save settings"
  ],
  "Avoid sending sensitive content without appropriate consent."
 ],
 [
  "Privacy and AI",
  "Rewrite a draft with AI",
  "How to rewrite a draft with AI in TCS Mail.",
  [
   "Open a composition with text",
   "Open optional AI tools",
   "Choose a rewrite style",
   "Review the output before applying or sending"
  ],
  "AI suggestions can contain factual errors."
 ],
 [
  "Privacy and AI",
  "Review clarity and grammar",
  "How to review clarity and grammar in TCS Mail.",
  [
   "Open the composer",
   "Write the initial draft",
   "Use Correct grammar and clarity when available",
   "Compare suggestions with your intended meaning"
  ],
  "AI assistance must not send mail automatically."
 ],
 [
  "Privacy and AI",
  "Check an AI-generated reply",
  "How to check an AI-generated reply in TCS Mail.",
  [
   "Open the received email and start a reply",
   "Request a suggestion from your configured AI",
   "Check names, dates, facts and recipients",
   "Approve and send only after review"
  ],
  "Do not trust unverified claims or promises."
 ],
 [
  "Privacy and AI",
  "Analyze email without sending",
  "How to analyze email without sending in TCS Mail.",
  [
   "Select a message",
   "Open the AI option in the reader",
   "Request analysis or a summary",
   "Review the result and close without replying"
  ],
  "An AI analysis cannot prove a message is legitimate."
 ],
 [
  "Privacy and AI",
  "Troubleshoot AI-provider errors",
  "How to troubleshoot AI-provider errors in TCS Mail.",
  [
   "Open Settings → AI & RAG",
   "Check the provider configuration",
   "Run integration diagnostics when available",
   "Copy a redacted error message for support"
  ],
  "Never paste private API keys into support reports."
 ],
 [
  "Contacts & calendar",
  "Search a contact",
  "How to search a contact in TCS Mail.",
  [
   "Open Contacts",
   "Enter name or address in Search",
   "Select the result",
   "Verify the address before sending"
  ],
  "Contacts may be local or sourced externally."
 ],
 [
  "Contacts & calendar",
  "Import contacts from vCard",
  "How to import contacts from vCard in TCS Mail.",
  [
   "Open Contacts",
   "Choose Import vCard",
   "Select a .vcf file",
   "Review the imported contacts"
  ],
  "Keep a copy of the original file before import."
 ],
 [
  "Contacts & calendar",
  "Export contacts as vCard",
  "How to export contacts as vCard in TCS Mail.",
  [
   "Open Contacts",
   "Choose Export vCard",
   "Select the destination",
   "Store the backup securely"
  ],
  "vCard files contain personal data."
 ],
 [
  "Contacts & calendar",
  "Create a contact group",
  "How to create a contact group in TCS Mail.",
  [
   "Open Contacts",
   "Choose Groups",
   "Create a group",
   "Add and review its members"
  ],
  "Groups do not authorize unsolicited bulk mail."
 ],
 [
  "Contacts & calendar",
  "Configure a CardDAV source",
  "How to configure a CardDAV source in TCS Mail.",
  [
   "Open Contacts",
   "Choose CardDAV",
   "Enter source details provided by your service",
   "Save and test synchronization"
  ],
  "Your provider may require app passwords or a separate OAuth flow."
 ],
 [
  "Contacts & calendar",
  "Avoid duplicate contacts",
  "How to avoid duplicate contacts in TCS Mail.",
  [
   "Open Contacts",
   "Search by name and address",
   "Compare entries before importing again",
   "Preserve the more complete record"
  ],
  "Do not bulk-delete contacts without a backup."
 ],
 [
  "Contacts & calendar",
  "Check event details",
  "How to check event details in TCS Mail.",
  [
   "Open Calendar",
   "Navigate to the relevant day",
   "Open the event",
   "Review start, end and location"
  ],
  "Check time zones for participants elsewhere."
 ],
 [
  "Contacts & calendar",
  "Create an all-day event",
  "How to create an all-day event in TCS Mail.",
  [
   "Open Calendar",
   "Choose the date",
   "Open New event and select All day when available",
   "Save and check its placement"
  ],
  "All-day events do not need specific times."
 ],
 [
  "Contacts & calendar",
  "Check reminders and notifications",
  "How to check reminders and notifications in TCS Mail.",
  [
   "Open Settings → Notifications",
   "Enable Calendar and reminders",
   "Check OS permissions",
   "Create a test event with a reminder when available"
  ],
  "Reminder delivery can depend on the app being active."
 ],
 [
  "Contacts & calendar",
  "Review pending tasks",
  "How to review pending tasks in TCS Mail.",
  [
   "Open Calendar or Tasks",
   "Review open tasks",
   "Open one to inspect due dates",
   "Update or complete as needed"
  ],
  "Not all calendar sources sync tasks."
 ],
 [
  "Support and diagnostics",
  "Prepare a support report",
  "How to prepare a support report in TCS Mail.",
  [
   "Open Settings → Diagnostics & advanced",
   "Open the event report",
   "Review it for personal data",
   "Copy or send to tcsmail@thecreativesolver.com according to preference"
  ],
  "Review any report before sharing."
 ],
 [
  "Support and diagnostics",
  "Ask before sending logs",
  "How to ask before sending logs in TCS Mail.",
  [
   "Open Settings → Diagnostics & advanced",
   "Find Crash reports and support",
   "Select Always ask",
   "Confirm the saved preference"
  ],
  "This is the default on new installs."
 ],
 [
  "Support and diagnostics",
  "Never send logs",
  "How to never send logs in TCS Mail.",
  [
   "Open Settings → Diagnostics & advanced",
   "Locate report submission preference",
   "Choose Never send",
   "Verify it was saved"
  ],
  "Local diagnostic data may still exist."
 ],
 [
  "Support and diagnostics",
  "Allow automatic reports",
  "How to allow automatic reports in TCS Mail.",
  [
   "Open Settings → Diagnostics & advanced",
   "Read the privacy explanation",
   "Choose Always send if desired",
   "Check that an outgoing account is available"
  ],
  "An automatic sending attempt may remain queued."
 ],
 [
  "Support and diagnostics",
  "Understand unexpected-close warnings",
  "How to understand unexpected-close warnings in TCS Mail.",
  [
   "Open TCS Mail after a forced shutdown",
   "Read the possible unexpected-close notice",
   "Choose send, dismiss or change preference",
   "Inspect logs if it repeats"
  ],
  "Abrupt shutdown alone does not prove an app bug."
 ],
 [
  "Support and diagnostics",
  "Find safe logs",
  "How to find safe logs in TCS Mail.",
  [
   "Open Settings → Diagnostics & advanced",
   "Use recent events view",
   "Copy only the needed report",
   "Review for private data before sharing"
  ],
  "Never share tokens, passwords or message bodies."
 ],
 [
  "Support and diagnostics",
  "Tell IMAP connection from authentication",
  "How to tell IMAP connection from authentication in TCS Mail.",
  [
   "Open account diagnostics",
   "Find IMAP connection and IMAP login",
   "If connectivity passes but login fails, check username and authorization",
   "Avoid random port changes"
  ],
  "AUTHENTICATIONFAILED usually means server rejection."
 ],
 [
  "Support and diagnostics",
  "Understand SMTP 535",
  "How to understand SMTP 535 in TCS Mail.",
  [
   "Open account diagnostics",
   "Find SMTP and status code 535",
   "Check account, credentials and server policy",
   "Test only after confirming provider settings"
  ],
  "SMTP TCP OK does not establish successful authentication."
 ],
 [
  "Support and diagnostics",
  "Troubleshoot an unresponsive view",
  "How to troubleshoot an unresponsive view in TCS Mail.",
  [
   "Record the tab and failed action",
   "Try going back without repeating destructive operations",
   "Restart if needed",
   "Inspect diagnostics and report reproduction steps"
  ],
  "Do not delete databases to fix UI freezes."
 ],
 [
  "Support and diagnostics",
  "Record reproduction steps",
  "How to record reproduction steps in TCS Mail.",
  [
   "Note the version in About",
   "Write the starting state and click sequence",
   "Describe expected versus actual behavior",
   "Send a report without personal information"
  ],
  "Screenshots of real mail must be anonymized."
 ],
 [
  "Support and diagnostics",
  "Verify the newly installed app",
  "How to verify the newly installed app in TCS Mail.",
  [
   "Open About in TCS Mail",
   "Check 0.8.2-rc6",
   "On Linux, locate the executable with command -v tcs-mail",
   "Do not uninstall unknown versions by guessing paths"
  ],
  "Do not delete app folders under ~/.config or ~/.local/share."
 ],
 [
  "Support and diagnostics",
  "Recover after changing mail servers",
  "How to recover after changing mail servers in TCS Mail.",
  [
   "Open Settings → Accounts",
   "Edit the affected account",
   "Restore the previously verified server addresses",
   "Save and rerun IMAP/SMTP diagnostics"
  ],
  "Do not assume imap.domain is a verified replacement."
 ],
 [
  "Support and diagnostics",
  "Check outgoing delivery state",
  "How to check outgoing delivery state in TCS Mail.",
  [
   "Open Outbox and find the message",
   "Read queued, scheduled or failed status",
   "Check Sent in that account after syncing",
   "Retry only after confirming server did not accept it"
  ],
  "Do not confuse queued with delivered."
 ],
 [
  "Support and diagnostics",
  "Send feature feedback",
  "How to send feature feedback in TCS Mail.",
  [
   "Open Settings → About",
   "Choose Send feedback",
   "Describe the feature and desired outcome",
   "Review and send without sensitive data"
  ],
  "Feature feedback does not require technical logs."
 ],
 [
  "Support and diagnostics",
  "Inspect installed release candidate",
  "How to inspect installed release candidate in TCS Mail.",
  [
   "Open About",
   "Check Release Candidate and version",
   "On Linux, inspect the installed package version if needed",
   "Report discrepancies with the executable path"
  ],
  "An RC is not a final release."
 ]
]);
const normalize=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function searchGuides(locale,query,category=''){
 const corpus=GUIDES[locale]||GUIDES['pt-BR'];
 const needle=normalize(query).trim().replace(/[–—:.,]+/g,' ');
 const words=needle.split(/\s+/).filter(Boolean);
 const matches=corpus.filter(([cat,title,summary,steps,note])=>{
  if(category&&cat!==category)return false;
  if(!words.length)return true;
  const haystack=normalize([cat,title,summary,...steps,note].join(' '));
  return words.every(word=>haystack.includes(word));
 });
 if(!words.length)return matches;
 // Prefer direct task/title hits, keeping the full text searchable.
 return matches.sort((a,b)=>{
  const score=item=>words.reduce((n,word)=>n+(normalize(item[1]).includes(word)?8:0)+(normalize(item[2]).includes(word)?3:0),0);
  return score(b)-score(a);
 });
}
// RC6: bilingual interactive move/delete guidance, available offline and searchable.
const RC6_MOVEMENT_GUIDES = {
 'pt-BR': [
  ['Mensagens','Mover mensagens entre pastas','Arraste uma ou várias mensagens para outra pasta da mesma conta.',
   ['Selecione uma ou várias mensagens da mesma conta usando Ctrl/Command ou Shift.',
    'Arraste uma mensagem selecionada para uma pasta visível na lateral; confirme o destino.',
    'Alternativamente, clique com o botão direito na mensagem e escolha Mover…; escolha a pasta pelo nome legível e clique em Mover.',
    'Apenas pastas selecionáveis aceitam mensagens. Em contas diferentes, mova separadamente.',
    'Se uma movimentação falhar, verifique a mensagem de erro e repita somente o que restou.'],
   'Os identificadores das pastas IMAP nunca são alterados pela tradução; somente o nome exibido muda.'],
  ['Mensagens','Localizar Excluir no menu de contexto','Use a ação Excluir que agora aparece entre as primeiras opções.',
   ['Clique com o botão direito em uma mensagem ou numa seleção.',
    'Clique em Excluir, perto do topo do menu, para enviar à Lixeira.',
    'Na Lixeira, Excluir definitivamente exige confirmação e não pode ser desfeito.',
    'Use a rolagem do menu ou as setas do teclado para encontrar as demais ações.'],
   'Arrastar mensagens não as exclui; mover para Lixeira é uma operação de pasta que deve ser confirmada.']
 ],
 'en-US': [
  ['Messages','Move messages between folders','Drag one or more messages to another folder of the same account.',
   ['Select messages from the same account using Ctrl/Command or Shift.',
    'Drag a selected message to a visible folder in the sidebar, then confirm.',
    'Alternatively right-click a message and choose Move…; select the readable folder name and click Move.',
    'Only selectable folders accept messages; move messages from different accounts separately.',
    'If some messages fail to move, read the error and retry only the remaining ones.'],
   'IMAP mailbox identifiers are never translated: only their display labels are decoded.'],
  ['Messages','Find Delete in the context menu','Delete is now close to the top of the message actions menu.',
   ['Right-click a message or multiple selected messages.',
    'Choose Delete near the top to move messages to Trash.',
    'In Trash, permanently deleting messages requires confirmation and cannot be undone.',
    'Scroll the menu or use arrow keys to access the additional actions.'],
   'Dragging messages does not delete them. Moving to Trash is a folder operation requiring confirmation.']
 ]
};
for (const lang of ['pt-BR','en-US']) GUIDES[lang].push(...RC6_MOVEMENT_GUIDES[lang]);

export function renderHelpCenter(panel,{onFeedback=()=>{}}={}){
 const en=getLocale()==='en-US',locale=en?'en-US':'pt-BR';
 const txt=en?{title:'TCS Mail Help',intro:'Practical instructions you can follow. Search a task or choose a topic.',search:'Search: e.g. drafts, sync, accounts…',all:'All topics',clear:'Clear',count:'guides',more:'Show more guides',shown:'shown',empty:'No guide found. Try a different word or clear filters.',steps:'Step by step',note:'Important',feedback:'Report a problem',back:'Back to articles'}:{title:'Ajuda do TCS Mail',intro:'Instruções práticas, do primeiro clique à conclusão. Pesquise uma tarefa ou escolha um assunto.',search:'Pesquisar: rascunhos, sincronizar, contas…',all:'Todos os assuntos',clear:'Limpar',count:'guias',more:'Mostrar mais guias',shown:'exibidos',empty:'Nenhum guia encontrado. Pesquise outro termo ou limpe os filtros.',steps:'Passo a passo',note:'Atenção',feedback:'Informar um problema',back:'Voltar aos artigos'};
 const categories=[...new Set(GUIDES[locale].map(x=>x[0]))];
 panel.innerHTML=`<section class="tcsHelpPage"><header class="tcsHelpHeader"><span class="tcsHelpEyebrow">TCS Mail · ${en?'Support':'Suporte'}</span><h2>${txt.title}</h2><p>${txt.intro}</p><label class="tcsHelpSearchWrap"><span aria-hidden="true">⌕</span><input id="helpSearch" type="search" autocomplete="off" aria-label="${txt.search}" placeholder="${txt.search}"></label><div id="helpTopics" class="tcsHelpTopics" aria-label="${en?'Help topics':'Assuntos de ajuda'}"><button class="active" data-help-category="">${txt.all}</button>${categories.map(x=>`<button data-help-category="${esc(x)}">${esc(x)}</button>`).join('')}</div></header><div class="tcsHelpToolbar"><span id="helpResultCount" aria-live="polite"></span><button id="helpClear">${txt.clear}</button></div><div id="helpList" class="tcsHelpArticles"></div><button id="helpMore" class="tcsHelpMore" type="button" hidden>${txt.more}</button><footer class="tcsHelpFoot"><button id="helpFeedback">${txt.feedback}</button></footer></section>`;
 const $=selector=>panel.querySelector(selector);let category='',shown=18,found=[];
 function render(reset=true){
  if(reset)shown=18;
  const q=$('#helpSearch').value;
  found=searchGuides(locale,q,category);
  $('#helpResultCount').textContent=`${found.length} ${txt.count} · ${Math.min(shown,found.length)} ${txt.shown}`;
  const list=$('#helpList');list.replaceChildren();
  $('#helpMore').hidden=shown>=found.length;
  if(!found.length){list.textContent=txt.empty;return}
  // Render only visible results; hundreds of long articles must not lock Settings.
  const fragment=document.createDocumentFragment();
  for(const [cat,title,summary,steps,note] of found.slice(0,shown)){
   const details=document.createElement('details');details.className='tcsHelpArticle';
   const safeSteps=steps.map(step=>`<li>${esc(step)}</li>`).join('');
   details.innerHTML=`<summary><span class="tcsHelpArticleTitle">${esc(title)}</span><span class="tcsHelpArticleSummary">${esc(summary)}</span><small>${esc(cat)}</small></summary><div class="tcsHelpInstructions"><h4>${txt.steps}</h4><ol>${safeSteps}</ol>${note?`<p class="tcsHelpNote"><strong>${txt.note}:</strong> ${esc(note)}</p>`:''}</div>`;
   fragment.append(details);
  }
  list.append(fragment);
 }
 $('#helpMore').addEventListener('click',()=>{shown+=24;render(false)});
 $('#helpSearch').addEventListener('input',()=>render());$('#helpSearch').addEventListener('keydown',event=>{if(event.key==='Enter'){const first=$('#helpList details');if(first){first.open=true;first.scrollIntoView({block:'nearest'});event.preventDefault()}}});
 panel.querySelectorAll('[data-help-category]').forEach(button=>button.addEventListener('click',()=>{category=button.dataset.helpCategory||'';panel.querySelectorAll('[data-help-category]').forEach(b=>b.classList.toggle('active',b===button));render()}));
 $('#helpClear').addEventListener('click',()=>{category='';$('#helpSearch').value='';panel.querySelector('[data-help-category=""]')?.click();$('#helpSearch').focus()});$('#helpFeedback').onclick=onFeedback;render();
}
