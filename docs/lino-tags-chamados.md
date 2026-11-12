# Lino · tags de chamados

Planejamento do fluxo em que o Lino etiqueta um chamado do ServiceNow com muitas tags de contexto, mostra esse conjunto num grafo e permite desclassificar uma tag de todos os cards. A bancada visual está em `extensao/designer/` e usa estado local. Ela não grava na instância.

A memória central da Mila foi consultada em 12/11/2026 para o projeto `retrografos` e o assunto “Lino tags chamados”. A conexão SSH falhou. Este documento não depende de memória recuperada.

## Onde isto mora

O Lino já é a extensão Chrome em `extensao/` (painel, regras e grafo) e a API `/api/global/lino` descrita em `servicenow/LINO.md`. No working tree atual, em `main`, esses arquivos ainda não estão materializados: estão nos commits `origin/main` e `feat/retrografos-implementacao` (`55a8894`). A bancada foi adicionada na pasta da extensão, que é o lugar do produto, sem abrir um app paralelo e sem reescrever o painel que não está neste checkout.

O painel já classifica por regras de palavra-chave, abre o detalhe do nó com duplo clique e só então oferece **Remover dos chamados**, com confirmação. Este plano muda o gesto: o duplo clique já pede a desclassificação. O efeito continua o mesmo da API `GET /impacto` + `POST /remover`: a tag sai dos chamados classificados com ela. A confirmação continua obrigatória.

A instância de desenvolvimento usada como referência é `https://dev217534.service-now.com/incident_list.do?sysparm_query=numberSTARTSWITHDEMO`. Nada neste fluxo fez login nem alterou incidente.

## Contexto

O Lino não substitui a lista nativa. A lista já mostra a tag do registro e as ações de audiência, ver registros com a tag e remover tag. O plugin opera em cima do card aberto ou da lista filtrada: confere permissão, extrai contexto, propõe várias tags de uma vez, desenha o grafo e guarda as palavras que a pessoa decidiu ignorar.

A mascote se chama Lina. O produto se chama Lino.

### O que foi visto na lista

| Número | Descrição | Tag nativa | Outros campos lidos |
| --- | --- | --- | --- |
| DEMO20261004003 | [DEMO] Erro ao renovar sessão | `erro_sessao` | Aberto em 2026-10-09 02:00:00, prioridade 4 - Low, estado Resolved, categoria Inquiry, atualizado em 2026-11-11 14:44:21 por admin |
| DEMO20261004002 | [DEMO] Erro ao renovar sessão | `erro_sessao` | Só descrição e tag |
| DEMO20261004001 | [DEMO] Erro ao renovar sessão | `erro_sessao` | Só descrição e tag |
| DEMO20261003008 | [DEMO] Tempo limite ao consultar protocolos | `timeout_protocolos` | Só descrição e tag |
| DEMO20261003007 | [DEMO] Tempo limite ao consultar protocolos | `timeout_protocolos` | Só descrição e tag |
| DEMO20261003006 | [DEMO] Tempo limite ao consultar protocolos | `timeout_protocolos` | Só descrição e tag |

09/10/2026 cai numa sexta-feira. A tag de dia `sexta` sai dessa data real. Data, pessoa, local e sistema de abertura não foram lidos nos outros cinco números; a bancada não inventa esses campos para eles.

Três contextos do DEMO20261004003 existem só para mostrar o tipo pedido e estão marcados como exemplo: local “Agência BH Centro”, sistema “Portal do cliente” e nome “Marina Costa”. Não vieram da lista.

## Atores

- **Analista com permissão.** Lê e altera o incidente e pode criar tag e vínculo. É quem classifica, ignora palavra e desclassifica no grafo.
- **Pessoa sem permissão.** Entra no Lino e é barrada antes de ver tags ou grafo.
- **Lina.** Condensa o estado: conferindo acesso, acesso negado, chamado em análise, grafo.
- **ServiceNow.** Dono do registro, da tag nativa e da permissão. O Lino não redesenha a lista.

## Histórias

### Passar pelo portão de permissão

Como analista, quero que o Lino confira se posso categorizar antes de mostrar tags, para não começar uma classificação que a conta não pode gravar.

Critérios:

- A primeira tela pergunta a permissão e não mostra chamado nem grafo.
- Com permissão, o chamado DEMO20261004003 abre já com as tags propostas.
- Sem uma resposta, as etapas Chamado e Grafo ficam desabilitadas.

### Ver o bloqueio quando não há acesso

Como pessoa sem permissão, quero uma frase clara de bloqueio, para entender que o processo parou.

Critérios:

- A frase visível é exatamente: “Infelizmente você não tem acesso para o processo de categorização.”
- Lina aparece no estado de alerta.
- Não há chips, grafo nem ação de desclassificar.
- “Verificar de novo” volta à pergunta e não concede acesso sozinho.

### Gerar tags de contexto ao abrir um chamado

Como analista, quero que o card aberto vire tags de situação, pessoa, data, dia, local e sistema, para o contexto da etiqueta ficar preso ao chamado.

Critérios, no DEMO20261004003:

- A descrição gera `erro`, `renovar` e `sessao` (rótulo “sessão”).
- A data de abertura gera `2026_10_09` (rótulo 09/10/2026) e o dia gera `sexta`.
- Quem atualizou gera a tag de pessoa `admin`, sem a marca de exemplo.
- A tag nativa `erro_sessao` aparece como “Já no ServiceNow”.
- Local, sistema e nome de exemplo aparecem com a marca “exemplo”.
- DEMO20261004002 e DEMO20261004001 mostram a mesma descrição e `erro_sessao`, sem data nem pessoa inventadas.

### Aceitar a explosão intencional de tags

Como analista, quero receber várias tags de uma vez, para enxergar no grafo o que é agrupamento e o que é ruído.

Critérios:

- O prefixo `[DEMO]` vira a tag `demo` nos seis chamados.
- DEMO20261004003 reúne, no mínimo, as onze tags: `erro`, `renovar`, `sessao`, `demo`, `2026_10_09`, `sexta`, `admin`, `agencia_bh_centro`, `portal_do_cliente`, `marina_costa`, `erro_sessao`.
- Os três chamados de protocolo reúnem `tempo`, `limite`, `consultar`, `protocolos`, `demo` e `timeout_protocolos`.
- A interface chama essa quantidade de explosão, não de erro.

### Ignorar stopwords automaticamente

Como analista, quero que artigos e conectivos não virem tag, para a situação ficar só com as palavras que nomeiam o problema.

Critérios:

- “Erro ao renovar sessão” não gera tag `ao`.
- “Tempo limite ao consultar protocolos” também não gera `ao`.
- `ao` aparece na lista do que ficou de fora, com o motivo stopword.
- A lista inicial é a deste documento e a de `extensao/designer/tags-contexto.mjs`.

### Manter uma lista de palavras ignoradas

Como analista, quero guardar palavras que não são palavra-chave para mim, para o Lino não propô-las de novo.

Critérios:

- Ignorar “renovar” no DEMO20261004003 tira `renovar` dos três chamados de sessão e mostra a palavra na base de ignorados.
- A base é da pessoa, separada das stopwords e das tags só desclassificadas.
- Uma palavra ignorada não volta enquanto permanecer na base.
- Restaurar o exemplo limpa a base só na bancada.

### Bloquear informação sensível por padrão

Como analista, quero que CPF, e-mail, telefone, token e senha nunca virem tag, para o grafo não espalhar dado sensível.

Critérios:

- Um texto fictício, fora dos chamados DEMO, é varrido só para demonstrar a regra.
- A interface lista as categorias e-mail, CPF, telefone, token e senha.
- O valor casado não aparece na tela nem no objeto devolvido pela regra.
- Os seis chamados DEMO não recebem tag vinda desse texto.

### Ver as tags no grafo

Como analista, quero ver as tags ligadas pela situação que compartilham, para achar um agrupamento que não faz sentido.

Critérios:

- `demo` fica no centro e liga `erro_sessao` e `timeout_protocolos`.
- `erro`, `renovar` e `sessao` ligam em `erro_sessao`.
- `tempo`, `limite`, `consultar` e `protocolos` ligam em `timeout_protocolos`.
- Cada nó diz em quantos chamados a tag está. `demo` conta 6. `erro_sessao` conta 3. `timeout_protocolos` conta 3.

### Desclassificar uma tag em todos os chamados

Como analista, quero dois cliques num nó que não faz sentido, para o Lino tirar aquela tag de todos os chamados classificados com ela.

Critérios:

- Dois cliques em `demo` abrem a confirmação com os seis números DEMO.
- Enter ou Espaço no nó em foco fazem o mesmo.
- O botão “Desclassificar tag em foco” também abre a confirmação.
- Depois de confirmar, `demo` some do grafo e dos seis cards.
- `erro_sessao` e `timeout_protocolos` permanecem.
- A tag desclassificada entra na lista “Desclassificadas no grafo” e não entra sozinha na base de ignorados.

### Confirmar antes de alterar vários chamados

Como analista, quero rever os cards afetados antes da desclassificação, para não limpar um agrupamento por engano.

Critérios:

- O diálogo nomeia a tag, a quantidade e os números.
- Cancelar fecha o diálogo e não muda card nenhum.
- O botão que recebe foco ao abrir é Cancelar.
- Confirmar é a ação destrutiva, em cereja, com texto escuro.

### Entender vazio, falta de permissão e erro

Como analista, quero um recado quando não há tag, quando o acesso falta ou quando a desclassificação não acontece, para saber o que fazer em seguida.

Critérios:

- Sem permissão, a mensagem é a frase de acesso negado e o grafo não abre.
- Se a desclassificação falha, o texto é “Não consegui desclassificar a tag. Os chamados continuam como estavam.” e nenhuma tag sai.
- Com todas as tags removidas, o grafo diz: “Nenhuma tag neste conjunto. Restaure o exemplo na bancada se quiser ver o grafo de novo.”
- Restaurar o exemplo devolve as tags dos seis DEMO.

## Regras de extração e normalização

A tag gravável continua no contrato da extensão: minúsculas, sem acento, só `a-z`, `0-9` e `_`, no máximo 80 caracteres.

1. Separar o texto em palavras. Hífen, colchete e pontuação não fazem parte da palavra.
2. Normalizar: `sessão` vira o id `sessao` e o rótulo visível continua “sessão”.
3. Jogar fora token de um caractere, stopword e item da base de ignorados.
4. Varrer dado sensível no texto cru e substituir o trecho por espaço antes de tokenizar. Só a categoria segue.
5. A descrição vira várias tags de situação. Pessoa, local, sistema e data viram uma tag cada, não uma tag por sílaba. “Marina Costa” é `marina_costa`. “09/10/2026” é `2026_10_09`.
6. A tag nativa entra inteira, como já está no ServiceNow: `erro_sessao`, `timeout_protocolos`.
7. O prefixo `[DEMO]` vira `demo` de propósito. É o ruído compartilhado que o grafo serve para excluir.

Exemplo: “Erro ao renovar sessão” → `erro`, `renovar`, `sessao`. `ao` fica de fora.

## Stopwords iniciais

Artigos e contrações: a, o, os, as, um, uma, uns, umas, de, da, do, das, dos, dum, duma, num, numa, ao, aos, à, às, pelo, pela, pelos, pelas.

Conjunções: e, ou, mas, que, se, como.

Preposições: em, na, no, nas, nos, para, pra, por, com, sem, entre, sobre, até, após, ante, sob, desde, via.

Pronomes: ele, ela, eles, elas, lhe, lhes, me, mim, te, ti, vos, meu, minha, teu, tua, seu, sua, seus, suas, nosso, nossa, este, esta, esse, essa, estes, estas, esses, essas, isto, isso, aquele, aquela, aquilo.

Apoio que não nomeia a situação: não, sim, já, também, mais, menos, muito, pouco, bem, mal, quando, onde, porque, qual, quais, cada, todo, toda, todos, todas, outro, outra, outros, outras, mesmo, mesma, ser, foi, são, está, estar, eram, era, tem, ter, há, havia.

A comparação usa a forma normalizada (`não` → `nao`, `é` → `e`). A lista canônica está em `STOPWORDS` no módulo.

## Dado sensível

Regra de produto, não uma varredura para coletar segredo. O valor casado é descartado. A interface só pode dizer a categoria.

| Categoria | O que não vira tag |
| --- | --- |
| E-mail | Trecho com `@` e domínio |
| CPF | Onze dígitos no formato com ou sem pontuação |
| Telefone | Número com DDD entre parênteses ou com hífen de telefone |
| Token | Prefixo `tok_`, `sk_`, `sk-` ou `bearer` seguido de um identificador |
| Senha | A palavra senha, password, passwd ou secret e o valor que vem em seguida |

Um número de incidente como DEMO20261004003 não é tokenizado a partir do campo número, então não é testado como CPF. A data estruturada vira tag de data e não passa pela regra de telefone.

## Duplo clique no grafo

1. A pessoa vê o nó com o rótulo e a quantidade de chamados.
2. Dois cliques, Enter, Espaço ou o botão “Desclassificar tag em foco” abrem o diálogo.
3. O diálogo lista cada número que ainda tem a tag. No caso de `demo`, os seis DEMO.
4. Cancelar não altera nada. O foco inicial é Cancelar.
5. Confirmar percorre esses chamados e tira só aquela tag. As outras tags do card ficam.
6. Na instância real, esse passo continua dependendo de `GET /impacto` e `POST /remover`, com a identidade da conta. A bancada só altera o estado local.

Desclassificar não é ignorar. Ignorar guarda a palavra para a próxima análise. Desclassificar limpa o que já foi classificado.

## Estados

- **Conferindo acesso.** Lina acena. As outras etapas estão desligadas.
- **Sem permissão.** Lina em alerta, frase de bloqueio, sem tags.
- **Chamado.** Tags propostas, o que ficou de fora e os seis cards.
- **Grafo.** Plataforma com os nós. A lista “Efeito nos cards” repete as tags que ainda restam.
- **Vazio.** Nenhuma tag no conjunto, com o convite para restaurar o exemplo.
- **Erro.** A desclassificação não ocorreu e os cards seguem iguais. Na bancada, a falha é um interruptor de simulação.

## Fora de escopo

- Login, cookie, credencial e qualquer escrita na instância `dev217534`.
- Substituir a lista nativa, a audiência da tag ou o menu “Remove tag” do ServiceNow.
- Editar o painel escuro da extensão neste checkout. A bancada é a referência visual do fluxo novo.
- Problemas, mudanças e o painel RetroGrafos.
- Redesenhar o logotipo oficial. O brandbook manda usar o arquivo eletrônico original; a bancada escreve “L&Co” em texto e usa o átomo como ícone do Lino, o mesmo desenho que a Lina leva no capacete.
- Embutir a Roobert. A fonte é comercial (Displaay). A tela usa Inter Variable, já licenciada na extensão, na pilha `Roobert, Inter`.
- Varredura ofensiva de segredos. Só as cinco categorias acima, sem devolver o valor.

## Marca na bancada

Extraído do manual Localiza&Co (abril de 2023), páginas de cor e de tipo. Os hexadecimais estão no PDF, não são aproximação:

- Verde Localiza `#7DDE21`
- Preto `#000000` e branco `#FFFFFF` na paleta principal, cerca de 95% da peça
- Cereja `#FF3853` só na ação destrutiva
- Baunilha `#F3E7CB` só como luz quente no fundo, sem formar um segundo bloco de cor
- Títulos em peso forte e texto em peso regular. Na tela, Inter no lugar da Roobert
- Tom: curto, direto, de gente. A frase de bloqueio não é suavizada

O vidro é diurno de propósito. O painel da extensão é escuro e denso; o manual pede cena clara. A bancada põe painéis translúcidos, desfoque, borda de luz e a plataforma hexagonal da Lina sobre o verde, com o campo colorido aparecendo por trás.

## Como abrir a bancada

Na raiz do repositório:

```powershell
python -m http.server 8765
```

Abrir `http://127.0.0.1:8765/extensao/designer/index.html`.

Módulo ES não abre bem em `file://`. O servidor estático basta. Não há passo de build.

Para as regras sem o browser:

```powershell
node --test extensao/designer/tags-contexto.test.mjs
```

## Verificação prevista na bancada

1. Recusar o acesso e ler a frase de bloqueio.
2. Verificar de novo, permitir, e ver as tags do DEMO20261004003, inclusive `ao` de fora e os três exemplos marcados.
3. Abrir o grafo, dar dois cliques em `demo`, cancelar e confirmar que os seis cards ainda têm a tag.
4. Confirmar a desclassificação e ver `demo` sumir dos seis cards, com `erro_sessao` ainda nos três de sessão.
