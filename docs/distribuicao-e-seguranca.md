# Distribuir o Lino com segurança

O pacote que as pessoas instalam sai de `node scripts/empacotar.mjs`. Ele copia só o que a extensão executa para `dist/lino-<versão>/` e gera `dist/lino-<versão>.zip`. Testes, o demo do rig e este tipo de documentação ficam de fora. A pasta `dist/` não entra no Git.

## Por que não há um certificado para embutir

No Windows, um executável pode levar um certificado de assinatura de código. No Chrome, a extensão publicada **não** recebe um certificado seu. Quem assina o pacote é a Chrome Web Store, com a chave da própria loja, no momento em que o ZIP é aceito. A pessoa vê o nome do publicador e o cadeado da loja, não um arquivo `.pfx` dentro da extensão.

A confiança vem de três coisas que você configura na conta, não no código:

1. Conta de desenvolvedor do Chrome Web Store, com a taxa única de registro e verificação em duas etapas.
2. Verificação do publicador. Se a empresa usa Google Workspace, a distribuição **privada** limita a instalação ao domínio. Fora isso, use a visibilidade **não listada**: só quem tem o link instala, e a loja continua assinando e atualizando.
3. A ficha da extensão: propósito único, política de privacidade e a justificativa de cada permissão. O texto pronto para publicar está em [politica-de-privacidade.md](politica-de-privacidade.md).

O ZIP carregado em modo de desenvolvedor não passa por essa assinatura. O Chrome mostra o aviso de extensão não reconhecida. Serve para o piloto na sua máquina, não para distribuir.

## O que o pacote já declara

O manifesto pede só o que o Lino usa, e a página da extensão só executa script da própria pasta:

| Permissão | Por quê |
| --- | --- |
| `activeTab` | Ler a aba do ServiceNow que a pessoa está vendo, depois que ela aciona o Lino. |
| `scripting` | Inserir o mascote e falar com a página autenticada, sem pedir o site inteiro de antemão. |
| `storage` | Guardar origem, regras, tamanho do pet, posição e métricas neste navegador. |
| `alarms` | Apagar a cópia temporária do grafo e as métricas vencidas. |
| `https://*.service-now.com/*` | Origem opcional, pedida só quando a pessoa conecta a instância. |

Não há `eval`, `new Function` nem script vindo de outro site. A CSP das páginas da extensão é `script-src 'self'; object-src 'self'`. O empacotador recusa o ZIP se isso mudar ou se um ícone, o service worker ou um recurso do manifesto não existir.

## Publicar

1. Gere os ícones uma vez, com o Playwright no mesmo módulo dos testes visuais: `node scripts/gerar-icones.cjs`. Eles ficam em `extensao/assets/icones/` e entram no Git.
2. Suba a versão em `extensao/manifest.json` (`0.5.0`, depois `0.5.1` ou `0.6.0`).
3. Rode `node scripts/empacotar.mjs`.
4. No painel da Chrome Web Store, envie o ZIP, preencha a ficha com a política de privacidade e escolha não listada ou privada.
5. Quando a revisão aprovar, quem já instalou recebe a versão nova sozinho. Não redistribua o ZIP por e-mail: a atualização e a assinatura passam pela loja.
