
# Lino no Chrome

O Lino categoriza incidentes do ServiceNow com tags nativas. Ele usa a sessão da aba ativa e a API instalada na mesma instância. O grafo reúne vínculos persistidos que o analista pode consultar. Veja o [roteiro do piloto](../servicenow/LINO.md) para instalar e homologar a API.

1. No Chrome 116 ou superior, abra `chrome://extensions`, ative **Modo do desenvolvedor** e use **Carregar sem compactação** com esta pasta. Se a extensão já estiver instalada, use **Recarregar**.
2. Abra um incidente salvo ou a lista clássica de incidentes, clique no ícone do Lino e conecte a origem do ServiceNow quando solicitado. **Configurações** permite ajustar a instância e importar a base de regras em JSON.
3. No formulário, clique em **Classificar e aplicar tags**. Na lista, selecione até 25 incidentes da página e use a mesma ação. Os detalhes mostram a origem e o resultado de cada tag.
4. Busque uma tag no grafo, filtre pelo tipo ou escolha na lista. Abra os detalhes com duplo clique em um nó ou com Enter. **Remover dos chamados** consulta toda a instância e mostra o impacto antes de confirmar. **Ignorar nas próximas análises** é uma preferência da sua conta neste navegador e pode ser revertida em **Termos ignorados**.

O JSON usa a estrutura `value[].fields` descrita abaixo. O campo opcional `Rotulo` define como o Lino exibe o termo da regra, com acentos e espaços.

Para validar localmente, execute `node --test extensao/tests/*.test.mjs` na raiz do repositório.

## Problemas e mudanças no RetroGrafos

Ao abrir um problema ou uma mudança no ServiceNow, o Lino oferece um atalho para o painel RetroGrafos. As instruções abaixo se referem a esse painel.

A extensão usa regras locais em formato de lista do SharePoint para sugerir tags nativas de incidentes, problemas e mudanças do ServiceNow.

## Instalação local

1. No Chrome 116 ou superior, abra `chrome://extensions` e ative **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e selecione esta pasta. Se a versão anterior já estiver instalada, use **Recarregar** na ficha da extensão.
3. Abra o painel pelo ícone do RetroGrafos. Em **Configurar**, ajuste a origem da instância (a inicial é `https://dev217534.service-now.com`) e o prazo de revisão (30 dias por padrão).
4. Abra uma lista clássica ou um registro já salvo. Use **Usar aba atual** ou cole a URL completa. Clique em **Analisar consulta** e autorize a origem solicitada pelo Chrome.
5. Revise as sugestões e marque as tags e os registros desejados. Cada lote permite até 25 registros. Confira o resultado e use **Próxima página** para avançar pela lista nativa.

A extensão usa a sessão aberta do ServiceNow em abas de trabalho. Se ela expirar, entre na instância pela aba de trabalho e tente novamente. A extensão confirma as tags após reabrir o registro. Quando o controle **Add Tag** estiver indisponível, use **Copiar tags** e **Abrir registro** para aplicar manualmente ou encaminhar a lista a alguém com permissão. Depois, selecione as mesmas tags e use **Conferir novamente**.

A tag `retrografos_validado` é aplicada após a conferência das alterações escolhidas. Quando a revisão vence, **Reanalisar** compara as regras atuais com as tags presentes e propõe a retirada das etiquetas antigas que esta extensão registrou como próprias para a conta em uso. Você escolhe as remoções antes de aplicar.

## Mapa e processamento

A análise e a aplicação usam até três abas de trabalho sem mudar a aba em foco. Mantenha o painel aberto para acompanhar o lote. O mapa cresce conforme os registros encontram palavras-chave e a revisão aparece quando a análise termina. Clique em um termo para filtrar a revisão. Durante a aplicação, os pontos ficam verdes quando validados e âmbar quando precisam de atenção.

## Regras da lista simulada

A [lista inicial](lista-demo.json) usa `value[].fields`. Para cada regra, informe:

| Coluna | Valor |
| --- | --- |
| `Title` | Nome da etiqueta com letras minúsculas, números e sublinhado |
| `PalavrasChave` | Lista de palavras ou frases |
| `Campos` | Lista de nomes técnicos permitidos, exibidos na configuração |
| `TiposTarefa` | Lista com `incident`, `problem` ou `change_request` |
| `Ativa` | `true` ou `false` |

Uma palavra ou frase inteira em qualquer campo selecionado é suficiente para sugerir a etiqueta. A comparação ignora maiúsculas e acentos. Regras de uma mesma etiqueta agrupam os motivos. Importe ou edite a lista e use **Salvar configuração**. O JSON e a origem ficam no armazenamento local da extensão.

## Verificação local

Na raiz do repositório, execute `node --test extensao/tests/*.test.mjs`. Para homologar na PDI, use um registro fictício de cada tipo, aplique uma tag inédita para o registro, reabra o formulário e confirme a etiqueta no menu. Analise novamente e repita a aplicação para confirmar que a etiqueta é reconhecida como existente.
