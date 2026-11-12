# Política de privacidade do Lino

O Lino é uma extensão de navegador para classificar incidentes no ServiceNow e consultar as tags nativas desses incidentes. Esta página descreve o que fica no navegador e o que não sai da instância.

## O que a extensão lê

Na instância ServiceNow que você autorizar, o Lino lê a página aberta (lista ou registro de incidente, problema ou mudança) e chama a API Lino dessa mesma instância, com a sessão que você já tem. A classificação e a remoção de tags acontecem no ServiceNow. A extensão não envia o conteúdo dos chamados para outro servidor.

## O que fica neste navegador

- A origem da instância, a base de regras e o prazo de revisão.
- Se o mascote está ativo, o tamanho escolhido e a posição na página.
- Métricas locais: tipo de evento, horário, tipo de interface e duração, quando houver. Não entram número, título, descrição nem identidade do chamado. O buffer guarda até 500 eventos e 200 KB por 30 dias. Exportar e apagar são ações manuais, em Configurações.

## Permissões

- **Aba ativa e scripts:** para mostrar o mascote e operar na página do ServiceNow que você está usando.
- **Armazenamento e alarmes:** para as preferências, as métricas e a limpeza do que venceu.
- **Acesso ao site:** só `https://*.service-now.com`, e só depois que você conecta a instância.

## Contato

O responsável pela publicação informa, na ficha da Chrome Web Store, o e-mail para pedidos sobre estes dados.
