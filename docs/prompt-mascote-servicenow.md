# Prompt mestre · Mascote Lino no ServiceNow

> Cole todo o conteúdo abaixo da linha em uma IA de UI, código, imagem ou animação. Anexe junto:
> - as imagens de `docs/mascote-referencia/` e o avatar em `extensao/assets/`;
> - os arquivos do rig em `extensao/assets/mascote/` (`mascote.svg`, `mascote-poses.css`, `RIG.md`).
> Itens marcados com **[PREENCHER: …]** dependem de uma decisão do time. Não os invente; deixe a decisão visível na sua resposta.

---

## 1. Seu papel

Você é, ao mesmo tempo:

1. **Diretor de arte de personagem**: mantém a consistência de um mascote 3D que já existe. Não redesenha, não "melhora" a anatomia, não troca o estilo.
2. **Designer de interface de produto** para ferramentas de trabalho (ITSM). Pensa em densidade, hierarquia, estados, tokens e acessibilidade, não em landing page.
3. **Engenheiro front-end de extensões Chrome (Manifest V3)**: entrega código que roda dentro de páginas do ServiceNow sem quebrar a interface nativa.
4. **Animador técnico**: transforma poses em máquinas de estado e presets de um rig SVG (atributos e classes CSS), sem quebrar a API do rig, e prepara rasters de destaque.

Trabalhe com o código e os assets reais descritos abaixo. Quando algo não estiver definido aqui, declare a suposição e marque como **[PREENCHER]** em vez de inventar.

---

## 2. Contexto do produto, ancorado no código

### 2.1 O que é

**RetroGrafos** é um projeto que classifica chamados do ServiceNow com **tags nativas** e mostra as ligações entre tags e chamados como **grafo**. A peça que interessa aqui é a **extensão Chrome** em `extensao/`:

- `manifest.json`: MV3, nome **"Lino · Tags ServiceNow"**, versão `0.3.0`, `minimum_chrome_version: 116`. Permissões: `activeTab`, `scripting`, `storage`, `sidePanel`. `optional_host_permissions: ["https://*/*"]`. Service worker: `painel-worker.js`, que só abre o side panel ao clicar no ícone. Side panel: `painel.html`. Opções: `opcoes.html`.
- **Hoje não existe content script.** Toda leitura da página é feita sob demanda com `chrome.scripting.executeScript` (funções `serviceNow()` em `lino-api.mjs`, `lerPagina()` em `navegacao.mjs`, e o arquivo injetado `formulario.js`).
- Instância padrão: `https://dev217534.service-now.com` (`PADRAO` em `regras.mjs`). A origem é configurável em `opcoes.html` e salva em `chrome.storage.local` (`config`).
- Lado ServiceNow: Scripted REST API `/api/global/lino` com `GET /acesso`, `POST /classificar`, `GET /grafo`, `GET /impacto`, `POST /remover` (`servicenow/LINO.md`).

Há **dois fluxos** de UI com sistemas visuais diferentes:

| Fluxo | Arquivos | Escopo | Visual atual |
| --- | --- | --- | --- |
| **Lino** (principal) | `painel.html`, `lino.mjs`, `lino.css`, `lino-api.mjs`, `lino-grafo.mjs` | Incidentes (`incident`) | Escuro, verde "vidro" (`.vidro` com `backdrop-filter`), fonte Inter embutida em `assets/InterVariable.woff2` |
| **RetroGrafos legado** | `legado.html`, `painel.mjs`, `painel.css`, `navegacao.mjs`, `grafo.mjs`, `lote.mjs`, `grupos.mjs`, `formulario.js` | Problemas (`problem`) e mudanças (`change_request`), aberto pelo botão **"Abrir problemas e mudanças"** | Claro, Bootstrap 5 (`vendor/bootstrap.min.css`), verde-petróleo `#106350`, fonte declarada "Source Sans 3" (não está embutida) |

### 2.2 Como a ferramenta detecta as telas do ServiceNow hoje

Use estas regras como base da detecção do mascote. Elas já existem no código:

- **Lista clássica (list view)**: `location.pathname === "/<tabela>_list.do"` e a grade `#<tabela>_table` existe. Os registros são os links `a[href]` da grade com `/<tabela>.do?sys_id=<32 hex>`, e o título vem da célula com `headers` contendo `short_description` (`lino-api.mjs`, rota `contexto`; `navegacao.mjs`, `lerPagina`). A lista vazia é reconhecida pelo texto "No records to display" ou "Nenhum registro para exibir".
- **Registro (form view)**: `location.pathname === "/<tabela>.do"`, `sys_id` com 32 hex (registro já salvo, então `sys_id=-1` fica de fora) e o campo de número visível: `#<tabela>.number` ou `#sys_readonly.<tabela>.number` (`formulario.js`, `localizar()` e `campoVisivel()`).
- **Next Experience com UI clássica embutida**: URL `/now/nav/ui/classic/params/target/<URL codificada>`. O código decodifica o alvo interno (`lote.mjs`, `consultaURL`; `painel.mjs`) e lê o documento do iframe `iframe#gsft_main` / `iframe[name='gsft_main']` quando é da mesma origem (`lino-api.mjs`, `formulario.js`).
- **Tabelas suportadas**: `incident | problem | change_request` (`lote.mjs`, `tabelas`; `regras.mjs`, `TIPOS`). O fluxo Lino trata só `incident`. `problem` e `change_request` caem no estado `legado`.
- **Estados que não são tela de trabalho**: login (`/login.do`, `/login_with_sso.do`, `/logout.do`, ou campo `input[type=password]`), texto de sessão expirada, acesso negado ("access denied", "security constraints", "acesso negado"…), origem diferente da configurada, e o resultado `incompativel`.
- **Workspaces (`/now/sow/…`, `/now/workspace/…`, `/now/cwf/…`) não são detectados hoje**, mas **passam a ser suportados**: Service Operations Workspace e os workspaces do Next Experience. A especificação está na seção 8.1.

### 2.3 Como o progresso é mostrado hoje (a "barra gigante")

- **Fluxo legado (`legado.html` + `painel.mjs`)**:
  - O cabeçalho tem a navegação `.etapas` com `data-etapa="consulta" | "acesso" | "revisao" | "resultado"`, e a etapa atual recebe `aria-current="step"`.
  - A seção `#processamento` reúne o título `#progresso-titulo`, o contador `#progresso-contador` ("7 / 18"), o `<progress id="progresso">`, o texto `#progresso-detalhe` ("Até 3 registros em segundo plano", "Processamento concluído", "N registros precisam de atenção") e o grafo SVG `#grafo` (viewBox `420×290`) dentro de um bloco escuro `#132f2c` que ocupa a largura do painel.
  - Essa seção é atualizada pela função `progresso(acao, feitos, total, falhas)`.
  - O processamento usa até 3 abas de trabalho em segundo plano (`SIMULTANEOS = 3` em `grupos.mjs`; abas criadas com `chrome.tabs.create({active: false})`), e cada lote tem no máximo 25 registros (`LIMITE` em `lote.mjs`).
- **Fluxo Lino (`painel.html` + `lino.mjs`)**: não há barra. O progresso aparece como texto em `#contexto-texto` e `#resultado-status` (por exemplo "Aplicando as tags · 5 de 20 incidentes", com lotes de 5 por requisição). O mascote do painel é o avatar `#lino` (75×75) em `assets/lino-avatar.webp`.
- **Decidido: as duas formas de progresso viram balões.** No legado, o `#processamento` com o `<progress id="progresso">`. No fluxo Lino, as mensagens de progresso escritas em `#contexto-texto` e `#resultado-status`.

### 2.4 Como os gráficos são feitos hoje

Não há biblioteca de gráficos. Os únicos "gráficos" são grafos SVG desenhados à mão:

- `lino-grafo.mjs`, `desenhar(svg, tags, abrirTag, abrirIncidente)`: viewBox `540×350`, até **8 tags** (no centro e numa elipse interna) e **14 incidentes** (na elipse externa), arestas em curva quadrática, nós com `role="button"` e `tabindex=0`. A tag abre com duplo clique ou Enter. `agrupar()` filtra por busca e por tipo (`TIPOS_LINO`: Sistema, Módulo, Serviço, Local, Pessoa, Equipe, Data, Dia, Identificador, Termo).
- `grafo.mjs`, `criarGrafo(svg, legenda, aoFiltrar)`: grafo incremental de palavras-chave × registros (viewBox `420×290`, até **16 termos**), distribuído pelo ângulo áureo `2.399963`. Nós ficam `validado` (verde) ou `pendente` (âmbar) durante a aplicação.
- Resultado da classificação (`mostrarResultado` em `lino.mjs`): totais `adicionada`, `existente` ("já presente") e `falha`, mais `negados` e `falhasDeRegistro`. Hoje aparecem só como texto, e são bons candidatos a mini-gráfico.
- Fora da extensão, `src/retrografos/dashboard.py` gera um painel HTML local com um grafo SVG `700×420`.
- **[PREENCHER: existem outros gráficos planejados (séries temporais, recorrência por sistema, distribuição por tag)? Se sim, quais dados e volumes.]**

### 2.5 Tokens e estilo existentes

- `lino.css`: `color-scheme: dark`, fundo `#101612`, texto `#f4f8f2`, `--verde: #7dde21`, `--suave: #c1cec0`, `--linha: #374739`, `--superficie: #1a251d`, foco `#a8f769`, perigo `#502c29` / `#ffe0d9`. Raios de `.65rem` a `1rem`. Botão `.primario` verde. A animação de diálogo (`surgir`) só roda com `prefers-reduced-motion: no-preference`. Também respeita `prefers-reduced-transparency` e `prefers-contrast: more`.
- `painel.css` (legado): `--bs-primary: #106350`, fundo `#edf3f1`, texto `#152e2a`, linha `#c5d6cf`, cabeçalho `#102e2a`.
- O microcopy existente é em PT-BR, em sentence case, direto e sem pedidos de desculpa. Exemplos: "Verificando a aba ativa…", "Classificar e aplicar tags", "Sessão do ServiceNow encerrada", "Entre novamente para continuar.", "Revise as sugestões antes de aplicar as tags.", "Lote conferido. Veja o resultado em cada registro."
- **Decidido: prevalece o sistema escuro e verde do fluxo Lino (`lino.css`)** para balões, chips, aba expandida (`grafico.html`) e todas as telas novas. O legado (`legado.html` + `painel.css`, hoje sobre Bootstrap claro) migra para esses tokens. As regras dos balões sobre o fundo claro do ServiceNow estão na seção 5.3.

### 2.6 O mascote que já existe: Lino

- **Nome oficial: Lino** (masculino), o mesmo nome da extensão. Ele fala em primeira pessoa, no masculino.
- Os rasters com o nome antigo do personagem foram removidos. O painel usa `assets/lino-avatar.webp` e o rig SVG.
- Referências anexadas (copiadas para `docs/mascote-referencia/`):
  - `01-robo-happy-comemorando.png`: feliz pulando com os braços abertos. É a imagem mais limpa, sem overlay de player.
  - `02-comemorando-frame-video-0s02.png`: mesma pose, frame 0:02 de um vídeo de 6 s, com overlay de player.
  - `03-acenando-frame-video-0s05.png`: de pé acenando com a mão direita do personagem.
  - `04-pensativo-frame-video-0s05.png`: mão no headset e boca séria.
  - `05-confuso-lampada-frame-video-0s05.png`: confuso, com lâmpada e "?" acima.
- Já no produto:
  - Os rasters antigos de busto e de alerta saíram do repositório: o de alerta tinha timestamp de player e pesava cerca de 1 MB. As pontas verde-limão dos dedos foram **descartadas**: o canônico são mãos totalmente pretas.
  - **Rig SVG feito à mão** em `extensao/assets/mascote/`, descrito no `RIG.md`:
    - `mascote.svg`: 17,0 KB (17.361 bytes), cerca de 4,0 KB gzip (4.088 bytes), vista frontal, 75 ids `m-*`, sem raster e sem filtros. Depois do acabamento com a skill `anatomy` (relatório em `docs/anatomy-lino.md`), ele ganhou:
      - os clipPaths `m-cfist` e `m-cfist-curl`, que fazem os vincos dos dedos terminarem na borda da mão;
      - a fivela `m-belt-buckle`;
      - `m-shadow` como um grupo de 3 elipses (halo e contato);
      - as juntas dos joelhos em `--mascot-green-light`.
    - `mascote-poses.css`: 5,7 KB, cerca de 1,5 KB gzip, com poses, loops e a classe `is-paused`;
    - `demo.html`: demo standalone;
    - `build-demo.mjs`: copia o SVG para o demo.

    O rig já cobre os presets de saudação, analisando, dúvida, sucesso e apontar, além de piscar, falar e andar. **É a base do mascote dentro da página** (seção 6.5).
- **[PREENCHER: o arquivo de vídeo original de 6 s (Grok) está disponível? Ele só serviria a onboarding e comunicação (seção 7.5).]**
- **Marca: a logo "L&CO" no peito fica** (uso autorizado), com as regras de simplificação em tamanho pequeno (seções 6.7 e 6.8).

---

## 3. Objetivo

Lapidar a experiência da extensão com um **mascote vivo dentro do ServiceNow**:

1. O Lino **aparece e anda** na página só em **lista** (list view) ou **registro** (form view) suportados, e fica oculto nas outras telas.
2. As etapas da análise deixam de ser uma barra grande e viram **balões de fala** curtos do Lino.
3. Resultados e grafos aparecem como **mini-gráfico no balão**, ou viram um botão **"Expandir"** que abre a visualização completa numa **aba da extensão**.
4. O personagem existente ganha **model sheet, turnaround, poses e animações consistentes** e prontas para o navegador.
5. Tudo é validado por **KPIs numéricos** e **critérios de aceite verificáveis**.

---

## 4. Restrições (não negociáveis)

1. **Não redesenhe o Lino.** Parta das referências. A silhueta, as proporções, a paleta e os acessórios ficam iguais. As correções permitidas são só as de consistência listadas em 6.3. **Também não quebre a API do rig SVG** (ids `m-*`, pivôs, atributos `data-*`, classes `is-*` e variáveis `--mascot-*`, seção 6.8).
2. **Nunca bloqueie a UI nativa.** O mascote não pode cobrir nem capturar cliques em:
   - cabeçalho e paginação da lista (`#<tabela>_table` thead, os controles `[id$='_next']`);
   - botões de formulário (Update, Save, Submit);
   - `#toggleMoreOptions`, `#tags_menu` e `#document_tags`, que o `formulario.js` usa para aplicar tags;
   - modais nativos do ServiceNow;
   - em workspace: a barra de ações do registro, o painel lateral contextual (à direita no SOW), a barra de abas e subabas, e a paginação e o cabeçalho da lista. Esses retângulos são medidos via `consultarProfundo` (por papel ARIA `toolbar`, `tablist` e `navigation`, e pelas bordas da viewport), e o Lino escolhe o canto livre.
3. **Não aparece nas abas de trabalho da extensão.** As abas abertas por `painel.mjs` com `active: false` (`abasTrabalho`, `listaTab`) são automatizadas. O mascote ali atrapalharia `formulario.js`. O content script pergunta ao service worker se a aba é de trabalho e, se for, fica em `oculto`.
4. **Isolamento total de CSS**: um host próprio (`<lino-mascote>`) com `attachShadow({mode: "closed"})` e `:host { all: initial; }`. Nenhum seletor global. Nenhum estilo do ServiceNow vaza para dentro, e nenhum estilo vaza para fora.
5. **Fontes**: `@font-face` dentro de shadow root é ignorado pelo Chrome. Registre a Inter embutida com `document.fonts.add(new FontFace("Lino Inter", "url(" + chrome.runtime.getURL("assets/InterVariable.woff2") + ")"))`, com nome de família exclusivo, e declare `web_accessible_resources` para os assets usados na página, restrito à origem configurada.
6. **Permissões mínimas**: continue usando `optional_host_permissions`. Registre o content script só depois que o usuário autorizar a origem, com `chrome.scripting.registerContentScripts({id: "lino-mascote", matches: [origem + "/*"], js: [...], runAt: "document_idle", allFrames: false})`, e remova o registro quando a permissão for revogada (`chrome.permissions.onRemoved`). O script roda **só no frame de topo** e lê o `gsft_main` quando for da mesma origem.
7. **Telemetria apenas local (fechado)**: nenhuma métrica, evento ou log sai do navegador. Não há endpoint, beacon, `fetch` para terceiros nem SDK de analytics.
   - As métricas ficam só em `chrome.storage.local`, na chave `lino:metricas`. É um buffer circular de no máximo 500 eventos ou 200 KB, com retenção de 30 dias.
   - Os eventos não contêm dados de chamados: nada de `sys_id`, número, título ou usuário. Só tipo de evento, tipo de tela (`lista`, `registro`, `workspace-lista`, `workspace-registro`), durações e contagens.
   - Em `opcoes.html`, o usuário pode **Exportar métricas** (download manual de um JSON) e **Apagar métricas**.
   - As únicas requisições de rede do mascote são para a própria instância (as rotas existentes `/api/global/lino/*`) e para arquivos da extensão.
8. **Movimento**: quando `prefers-reduced-motion: reduce` está ativo, não há caminhada, pulo, digitação animada nem deslizamento. Só troca de pose estática com fade de até 150 ms. Nada pisca mais de 3 vezes por segundo.
9. **Stack**: JavaScript ES modules puro, como no repositório, sem framework e sem build obrigatório. Testes com `node --test extensao/tests/*.test.mjs`. O mascote na página usa o **rig SVG existente** (`extensao/assets/mascote/`) com CSS e WAAPI. Nenhum runtime de animação extra (Rive, Lottie, GSAP) entra na extensão (ver 6.5).
10. **Idioma**: toda a UI é em PT-BR, com o tom do microcopy existente (seção 2.5).

---

## 5. Princípios de design que você deve aplicar

### 5.1 Intenção antes de pixels

Responda por escrito antes de propor qualquer tela:

- **Quem**: analista de service desk ou coordenador de ITSM, no meio de uma fila de incidentes, com várias abas abertas e pressa. Já está no ServiceNow há horas e não quer um assistente que atrapalhe.
- **O verbo**: classificar chamados com tags e entender ligações (grafo) sem sair da lista ou do registro.
- **Sensação**: "colega de laboratório no canto da bancada": presente, discreto, preciso, simpático só nos momentos certos (sucesso, erro). Não é um chatbot, não é um Clippy.

### 5.2 Exploração de domínio (entregue as quatro saídas)

- **Domínio** (mínimo de 5 itens): bancada de laboratório, etiqueta de amostra, tag e etiqueta nativa, central de atendimento (headset), fila de chamados, grafo e constelação de ligações, átomo, prancheta.
- **Mundo de cor**: deve vir do próprio personagem (seção 6.2): jaleco off-white, capacete verde corporativo, visor quase preto, verde-limão dos olhos e da logo, amarelo do átomo.
- **Assinatura (proposta a validar)**: o **"balão-etiqueta"**. O balão tem a forma de uma etiqueta de amostra de laboratório e um chip com o nome da etapa. Quando a etapa termina, o balão se recolhe num **chip de tag** (`✓ Acesso`, `✓ 18 incidentes`) que se enfileira acima do Lino. O histórico vira, literalmente, uma fileira de tags, que é o assunto do produto. A assinatura deve aparecer em pelo menos 5 lugares concretos: balão, chip de histórico, botão "Expandir", estado minimizado e cabeçalho da aba expandida.
- **Padrões a rejeitar**, cada um com a sua alternativa:
  - barra de progresso horizontal → contador tabular dentro do balão, com régua fina;
  - toast genérico no canto → balão com cauda apontando para o Lino;
  - card de métrica "número grande + rótulo pequeno" → frase com o número no texto e mini-barra.

### 5.3 Fundações

- **Tokens com nomes do mundo do produto** (exemplos a refinar): `--lino-jaleco`, `--lino-capacete`, `--lino-visor`, `--lino-lima`, `--lino-atomo`, `--balao-fundo`, `--balao-tinta`, `--balao-borda`, `--etiqueta-chip`. Proibido usar valores hex soltos fora dos tokens.
- **Sistema visual: o de `lino.css`**, escuro e verde. Os tokens dos balões, chips e da aba expandida derivam dele:

  | Token | Valor (de `lino.css`) | Uso |
  | --- | --- | --- |
  | `--balao-fundo` | `#1a251d` (`--superficie`), opaco (pelo menos 96%) | superfície do balão |
  | `--balao-fundo-elevado` | `#202d24` | chip ativo, tooltip do mini-gráfico |
  | `--balao-tinta` | `#f4f8f2` | texto primário (cerca de 14,8:1 sobre `--balao-fundo`) |
  | `--balao-tinta-2` | `#c1cec0` (`--suave`) | texto secundário (cerca de 9,7:1) |
  | `--balao-acao` | `#7dde21` (`--verde`) | botão primário, régua de progresso, check (cerca de 9,3:1) |
  | `--balao-foco` | `#a8f769` | anel de foco |
  | `--balao-perigo-fundo` / `--balao-perigo-tinta` | `#502c29` / `#ffe0d9` | estado de erro |
  | `--etiqueta-chip` | `#27352a`, com borda `#50644e` | chips de histórico |
  | `--balao-borda` | `rgba(193, 206, 192, .22)` | borda interna |
  | `--balao-contorno` | `rgba(16, 22, 18, .35)` | contorno externo de 1 px |

- **Balões sobre o fundo claro do ServiceNow** (UI16 e Next Experience no tema claro):
  - A superfície escura contrasta cerca de 15:1 com o branco, então o recorte do balão é nítido sem sombra pesada.
  - Use **uma** sombra curta e sutil, `0 1px 2px rgb(5 10 5 / .22), 0 8px 20px rgb(5 10 5 / .22)`. Sem `backdrop-filter` e sem o `.vidro` translúcido na página: o texto do balão nunca pode depender do que está por baixo (listas densas), e o blur custa desempenho.
  - Combine a borda interna `--balao-borda` com o contorno externo `--balao-contorno`. Assim o balão continua delimitado também no tema escuro do Next Experience, quando o contraste com o fundo cai.
  - A cauda do balão usa o mesmo fundo, a mesma borda e o mesmo contorno.
  - O rig do Lino já tem contorno escuro (`--mascot-outline`), então se separa do fundo claro sem halo.
  - No tema escuro do ServiceNow, mantenha os mesmos tokens. Só a sombra sobe para `.35` de opacidade.
- **Texto em 4 níveis** (primário, secundário, terciário, muted). **Bordas** em escala, com rgba de baixa opacidade. **Uma** estratégia de profundidade: recomendo uma sombra sutil única para o balão e uma sombra elíptica no chão para o Lino, sem misturar com bordas pesadas.
- **Espaçamento**: unidade base de 4 px, com escala de 4, 8, 12, 16 e 24.
- **Raio**: 6 px nos chips, 12 px no balão, com cauda em SVG.
- **Tipografia**: Inter (já embutida). Os números usam `font-variant-numeric: tabular-nums`. O rótulo da etapa vai em 11–12 px, peso 600, tracking +0,02em. O texto do balão vai em 13–14 px, peso 450. Nunca abaixo de 11 px.
- **Estados obrigatórios** em todo elemento interativo: default, hover, active, focus-visible, disabled. Os dados também têm estados: carregando, vazio e erro.
- **Movimento**: easing de desaceleração `cubic-bezier(.2,.7,.2,1)`, 120–200 ms em micro-interações, sem bounce na UI. O "pulo" é exclusivo do personagem no estado `comemorando`.
- **Autocrítica obrigatória** antes de entregar:
  - teste de troca: se a fonte e o layout mudassem para o padrão, alguém perceberia?
  - teste de piscar: a hierarquia continua clara com a vista desfocada?
  - teste de assinatura: os 5 lugares existem?
  - teste de token: os nomes soam como "Lino e laboratório" ou como template?

---

## 6. Especificação B: personagem (partir do mascote existente)

### 6.1 Ficha do personagem (trava de consistência)

**Lino** é um robô **chibi** em estilo **3D cartoon lustroso** (plástico brilhante, sombreamento suave, contornos limpos, sem textura de pele nem de metal riscado), com proporção de cerca de **2,6 cabeças de altura**.

| Parte | Descrição canônica |
| --- | --- |
| Cabeça | Grande, arredondada, casco **branco brilhante**, com uma **faixa verde** larga de frente para trás no topo e o **ícone de átomo amarelo** (núcleo e 3 órbitas) centralizado na faixa |
| Visor | Faixa **preta** horizontal, lustrosa, com **dois olhos grandes verde-limão** redondos e um brilho branco no canto superior de cada um. Os olhos são a principal ferramenta de expressão |
| Boca | Na parte branca abaixo do visor. Expressiva: sorriso aberto com língua rosada, linha séria, "O" de surpresa. Sem nariz |
| Headset | Conchas **verde e branco** nas duas laterais e **microfone preto** curvo saindo da lateral esquerda do personagem (direita de quem olha) até a boca |
| Tronco | **Peito verde** com a logo **"L&CO"** em verde-limão, em duas linhas ("L&" / "CO"). Faixa preta na cintura e quadril verde |
| Jaleco | **Jaleco branco de laboratório** aberto, com gola, um bolso no peito e dois bolsos inferiores, na altura da coxa |
| Braços | Ombros e antebraços brancos com juntas pretas. **Faixa verde** no ombro. **Antebraço com o emblema de engrenagem ou sol verde** e dois pontos verdes |
| Mãos | **Pretas, articuladas**, 4 dedos e polegar, lustrosas |
| Pernas | Juntas pretas. **Caneleiras brancas com o emblema de engrenagem ou sol verde** |
| Pés | **Botas brancas com sola e biqueira verdes** |
| Costas | **Mochila ou casco verde** arredondado, visível atrás dos ombros |

### 6.2 Paleta de referência (hex aproximados extraídos dos rasters 3D)

> Os valores finais usados na página vêm do rig SVG (`--mascot-*`). Veja o mapeamento na seção 6.6.

| Token | Hex aprox. | Onde |
| --- | --- | --- |
| `--lino-capacete` | `#23802B` | faixa do capacete, peito, conchas do headset, sola |
| `--lino-capacete-sombra` | `#0B5820` | sombras do verde, mochila em sombra |
| `--lino-lima` | `#98D040` (brilho até `#B6E35A`) | olhos, logo "L&CO" |
| `--lino-atomo` | `#F0D030` | ícone do átomo (único amarelo do personagem) |
| `--lino-jaleco` | `#ECEDE6` (realce `#F7F8F2`) | casco, jaleco, botas |
| `--lino-visor` | `#102020` | visor, mãos, juntas (preto levemente esverdeado) |
| `--lino-boca` | `#D06050` | interior da boca e língua |

### 6.3 Inconsistências que o model sheet precisa resolver

1. **Mãos: decidido.** O canônico são mãos **totalmente pretas**, como nas imagens novas. As pontas verde-limão do raster antigo de busto são descartadas no rig e nos rasters.
2. O emblema e os pontos verdes do antebraço aparecem só num braço, e a faixa verde só num ombro. **Decisão de design sua, registrada no model sheet**: assimetria proposital ou não, e em qual lado ficam. Aplique a mesma escolha ao rig e aos rasters.
3. Comprimento do jaleco e número de bolsos.
4. Orientação do átomo (fixa, sempre frontal).
5. A plataforma hexagonal verde do chão **não faz parte do personagem**.

### 6.3.1 Regras de acabamento (valem para o rig e para os rasters)

Vêm da revisão com a skill `anatomy` (`docs/anatomy-lino.md` e a seção "Regras de acabamento" do `RIG.md`). Uma pose que viole qualquer uma delas é reprovada.

1. **Uma cor de destaque.** O verde-limão (`--mascot-lime` / `--lino-lima`) aparece **só nos olhos e na logo "L&CO"**. Juntas, botas, sola, fone e mochila usam os outros verdes (`--mascot-green`, `--mascot-green-dark`, `--mascot-green-light`). No rig, os centros das juntas dos joelhos já usam `--mascot-green-light`.
2. **Toda linha termina em algo.** Cada vinco, costura ou painel termina no contorno ou numa junta. Não pode haver traço solto numa face lisa. No rig, os vincos dos dedos são recortados pela silhueta da mão (`m-cfist`, `m-cfist-curl`), e o contorno é redesenhado por cima.
3. **Só peças reais.** Desenhe só detalhes que existem no robô: fivela (`m-belt-buckle`), juntas, punhos, costura e bolsos do jaleco, emblemas. Nada de linhas, pontos ou texturas decorativas.
4. **Volume discreto.**
   - Sombra de contato suave sob os pés (`m-shadow`, 3 elipses: halo difuso e contato), que **encolhe e clareia no pulo** (`m-jump-shadow`).
   - Brilho especular **só no topo das peças brancas**, com luz vindo do **alto à esquerda**. Nos rasters, use a mesma direção de luz (seção 6.9).
5. **Hierarquia de cor.** O branco é o casco. O verde é a estrutura e a roupa. O preto são as juntas e as mãos. O visor escuro emoldura os olhos, que são o **primeiro ponto de atenção**: no teste de piscar, o olhar deve cair primeiro nos olhos.
6. **Nenhum texto no desenho além da logo "L&CO".** Falas, rótulos, números e "?" escritos ficam no balão, fora do SVG e fora dos rasters. A lâmpada com "?" é um ícone (`m-lightbulb-question`), não texto.

### 6.4 Entregas de consistência (antes de qualquer animação)

Essas folhas são **referência do time**. Elas servem a dois públicos: ao refino do rig SVG (6.8) e aos rasters de destaque (6.9).

1. **Model sheet** com fundo neutro: frente, 3/4 frente, perfil, 3/4 costas e costas (turnaround de 5 vistas), na mesma escala e com linhas-guia de altura (topo da cabeça, visor, ombro, cintura, joelho, sola). A vista 3/4 alimenta a vista opcional de andar do rig.
2. **Folha de expressões** alinhada aos valores do rig: `data-eyes` (`normal`, `closed`, `happy`, `worried`, e o novo `wide`) e `data-mouth` (`smile`, `happy`, `neutral`, `serious`, `talk-a`, `talk-o`, e o novo `surprised`).
3. **Folha de mãos** alinhada a `data-hand-*` (`relaxed`, `open-wave`, `pointing`, `thinking`, e os novos `holding` e `open-up`).
4. **Folha de cores** com os hex finais (seção 6.6) e regras de uso.
5. **Folha de tamanho pequeno**: o rig em 64, 80, 96 e 120 px, nos modos `data-detail="full"` e `"low"`, e o avatar `data-view="head"` em 24 e 40 px (ver 6.7 e 6.8).

### 6.5 Formato de entrega: híbrido (decidido)

| Contexto | Formato | Motivo |
| --- | --- | --- |
| **Na página do ServiceNow** (64–120 px de altura): todos os estados, expressões, piscar, fala e andar | **Rig SVG inline** `extensao/assets/mascote/mascote.svg` (17,0 KB, cerca de 4,0 KB gzip) com `mascote-poses.css` (5,7 KB, cerca de 1,5 KB gzip), dentro do Shadow DOM, animado por CSS e WAAPI | Um asset só cobre todas as poses e expressões. É nítido em qualquer DPI, as cores vêm de custom properties e não há requisições de imagem na página do ServiceNow |
| **Contextos de destaque**: aba expandida `grafico.html`, cabeçalho do painel (`#lino` em `painel.html`), avatar, onboarding e material de comunicação | **Raster 3D em WebP com alfa** (seção 6.9) | Preserva o brilho e o volume do render 3D, que o rig flat não reproduz |

**Regras de uso do rig na página:**

- **Carga**:
  - Faça `fetch(chrome.runtime.getURL("assets/mascote/mascote.svg"))`, pegue o texto e insira o SVG **inline** no shadow root, uma vez por instância.
  - Aplique `mascote-poses.css` como constructable stylesheet (`shadowRoot.adoptedStyleSheets`) ou como `<style>` dentro do shadow.
  - `<img src="mascote.svg">` **não serve**: só mostra a pose neutra, sem tema nem animação.
  - Declare `mascote.svg` e `mascote-poses.css` em `web_accessible_resources`.
- **Âncora**:
  - O `viewBox` é `0 0 256 320`, com os pés em `(128, 310)`.
  - Posicione o SVG pela base, com `transform-origin: 50% 96.9%`.
  - A proporção é 4:5: com 96 px de altura, a largura é 76,8 px; com 120 px, é 96 px.
- **API do rig** (estável, descrita em `extensao/assets/mascote/RIG.md`). Não a quebre.
  - Atributos no `<svg class="mascote">`: `data-pose` (`neutral | wave | think | confused | jump | point`), `data-eyes` (`normal | closed | happy | worried`), `data-mouth` (`smile | happy | neutral | serious | talk-a | talk-o`), `data-hand-l` / `data-hand-r` (`relaxed | open-wave | pointing | thinking`) e `data-props` (`bulb`).
  - Classes de loop: `is-idle`, `is-blinking`, `is-walking`, `is-talking`.
  - `is-paused` congela todos os loops (`animation-play-state: paused`) sem mudar a pose.
  - `-l` / `-r` são os lados **da tela**. As partes `-r` ficam num grupo espelhado com os mesmos pivôs e o mesmo sinal: `rotate(+θ)` abre o membro para fora dos dois lados.
- **Controlador** (`mascote.js`): só troca atributos e classes do `<svg>`.
  - Movimentos do contêiner (entrada, saída, deslocamento ao andar) usam **WAAPI no elemento host**, nunca em partes do rig.
  - O WAAPI em partes do rig (ex.: `#m-elbow-l`) só é permitido para efeitos que o CSS não cobre. Use `svg.querySelector` dentro do shadow; o `transform-origin` já vem do `<style>` do SVG.
  - **Lip-sync**: enquanto o texto do balão aparece, alterne `data-mouth` entre `talk-a`, `talk-o` e `neutral` a cada cerca de 120 ms, e volte à boca anterior no fim.
- **Movimento calmo**:
  - As transições internas do rig são uma mola com **uma única ultrapassagem**, como em `.45s cubic-bezier(.34, 1.4, .5, 1)` e no `m-pop` da lâmpada. Nada de vários quiques nem molas oscilantes, e os loops são lentos (respiração de 3,2 s, cabeça de 4,6 s).
  - A mola é permitida **só no personagem**. A UI (balões, chips, botões) segue sem bounce (seção 5.3).
  - Aplique **`is-paused`** quando o Lino sair da viewport (`IntersectionObserver`), quando a aba ficar oculta (`visibilitychange`) e depois de 30 s de `idle` sem eventos. Remova a classe ao voltar.
- **Reduced motion**: `mascote-poses.css` já desliga todas as animações e transições do rig, e as poses continuam aplicadas de forma estática. O controlador também precisa:
  - parar o lip-sync (boca fixa `smile` ou `neutral`);
  - não usar `is-walking`;
  - trocar a translação do host por um fade de até 150 ms.
- **Lottie e Rive não são adotados.** O caminho para Lottie descrito no `RIG.md` fica só como opção futura e exigiria converter os gradientes com `var()` em cores fixas.

### 6.6 Mapeamento de tokens: `--lino-*` (design) ↔ `--mascot-*` (rig)

As custom properties `--mascot-*` são a **API de tema do rig**. Os tokens `--lino-*` são os **tokens de design** da UI e dos rasters. No `:host` do Shadow DOM, ligue um ao outro (`--mascot-green: var(--lino-capacete)` etc.).

**Fonte da verdade (recomendação):** os valores do rig, já afinados para o desenho flat. Os rasters de destaque são color-graded para esses valores, e não o contrário.

| Token de design | Variável do rig | Valor do rig | Valor aprox. do raster de referência |
| --- | --- | --- | --- |
| `--lino-capacete` | `--mascot-green` | `#1F8927` | `#23802B` |
| `--lino-capacete-sombra` | `--mascot-green-dark` | `#0B5E1F` | `#0B5820` |
| `--lino-capacete-brilho` | `--mascot-green-light` | `#45BE4F` | n/a |
| `--lino-lima` | `--mascot-lime` | `#8DD63F` | `#98D040` |
| `--lino-atomo` | `--mascot-yellow` | `#F2DF3A` | `#F0D030` |
| `--lino-jaleco` | `--mascot-white` | `#F2F5F3` | `#ECEDE6` |
| `--lino-jaleco-sombra` | `--mascot-white-shade` | `#AFC0BD` | n/a |
| `--lino-juntas` (mãos e juntas) | `--mascot-black` | `#1B2728` | `#102020` |
| `--lino-visor` | `--mascot-visor` | `#05170E` | `#102020` |
| `--lino-contorno` | `--mascot-outline` | `#0B1716` | n/a |
| `--lino-boca` | `--mascot-tongue` | `#E9727B` | `#D06050` |

O `--verde: #7dde21` de `lino.css` está próximo de `--mascot-lime`. Proponha um único verde de ação para a UI e justifique.

### 6.7 Limitações conhecidas do rig (itens a evoluir)

1. **Só vista frontal.** O "andar" é um ciclo frontal (passo alternado e balanço do corpo). **É proibido espelhar com `scaleX(-1)`**, porque a logo "L&CO" ficaria invertida. A direção do deslocamento é dada só pela translação do host. **Evolução opcional:** vista 3/4 para andar (ver 6.8).
2. **O brilho espelha junto**: as partes `-r` vivem em um grupo com `matrix(-1 0 0 1 256 0)`, então os gradientes do lado direito também espelham (a luz fica simétrica). Se isso for corrigido, mantenha os pivôs e o sinal dos ângulos.
3. **Mãos simplificadas**: só existem 4 variações (`relaxed`, `open-wave`, `pointing`, `thinking`). Faltam `holding` (prancheta), `open-up` (alerta) e `fist`.
4. **A logo fica ilegível abaixo de cerca de 80 px** (vira uma mancha verde-limão). Use a versão simplificada (ver 6.8, `data-detail`).
5. **Contorno fino em tamanho pequeno**: `stroke-width: 2.4` no viewBox de 320 equivale a cerca de 0,72 px a 96 px e cerca de 0,48 px a 64 px. Em `data-detail="low"`, aumente o contorno para 4–5 unidades.
6. **Ids repetidos com várias instâncias**: os gradientes (`url(#m-gw)`…) resolvem para o primeiro id. **Cada instância vive no próprio Shadow DOM**, e todos os seletores são escopados (`shadowRoot.querySelector`), nunca `document.getElementById`.
7. **Precisa ser inline** (ver 6.5).
8. **Estados que o rig ainda não cobre** (devem ser adições, sem mudar valores existentes):
   - `data-pose`: `alert`, `sleep`, `present`, `point-l` (apontar para a esquerda da tela; hoje o `point` usa o braço `-r`, que aponta para a direita);
   - `data-eyes`: `wide`;
   - `data-mouth`: `surprised` (hoje dá para usar `talk-o` provisoriamente);
   - mãos: `holding` e `open-up`;
   - `data-props`: `zzz` e `clipboard`;
   - recorte de cabeça para o estado minimizado.
9. **Loops infinitos**: `jump` roda em loop (`.9s infinite`) e `wave` também. O controlador limita `jump` a 1–2 ciclos e depois volta para `idle`.
10. **Piscar em intervalo fixo**: `m-blink` usa 4,2 s fixos. Para soar natural, o controlador sorteia `animation-duration` ou `animation-delay` entre 3 e 6 s.
11. **O visual é mais flat que o render 3D.** A identidade (seção 6.1) precisa ser reconhecível nos dois. O checklist de 12 traços vale para o rig e para os rasters.

### 6.8 Refino do rig SVG (o que você deve entregar)

**Preserve sem exceção:**

- todos os ids `m-*` existentes (75 hoje, incluindo `m-belt-buckle` e os clipPaths `m-cfist` e `m-cfist-curl`) e a hierarquia, com `m-shadow` como grupo de 3 elipses;
- a classe `is-paused` e as regras de acabamento da seção 6.3.1;
- os pivôs da tabela do `RIG.md`: `m-body` (128,310), `m-head` (128,94), `m-arm-l` (82,110), `m-elbow-l` (76,140), `m-hand-l` (72,188), `m-leg-l` (104,192), `m-knee-l` (104,236), `m-eye-l` (107,57.5), `m-eyelid-l` (107,43), `m-mouth` (128,87), `m-lightbulb-question` (206,40), `m-speech-anchor` (186,22);
- o `viewBox="0 0 256 320"`, os nomes e valores atuais de `data-*`, as classes `is-*` e os nomes das `--mascot-*`.

**Permitido:**

- melhorar paths e proporções na direção das referências 3D;
- adicionar novos valores de atributo (lista em 6.7, item 8);
- adicionar novos ids com prefixo `m-`;
- adicionar `data-detail="full | low"`. O `low` troca `m-chest-logo` por um bloco verde-limão liso, oculta os emblemas e engrossa o contorno, e o controlador o aplica automaticamente quando a altura renderizada for menor que 80 px;
- adicionar `data-view="front | head"`. O `head` recorta para a cabeça e o headset, para o estado minimizado de 24–40 px; o recorte pode ser feito trocando o `viewBox` por JS;
- **opcional**: `data-view="three-quarter-l | three-quarter-r"` para andar, em grupos novos (`m-34-*`), sem alterar a vista frontal. Cada lado é desenhado separadamente (proibido espelhar).

**Proibido:** raster embutido, `<filter>`, `<foreignObject>`, `<text>` ou fontes (a logo continua em traços e é o único "texto" do desenho), espelhamento global, e detalhe decorativo sem peça correspondente (seção 6.3.1).

**Orçamento:** o SVG fica em até 24 KB sem compressão e até 6 KB gzip. O CSS de poses fica em até 8 KB sem compressão e até 2,5 KB gzip. Anime só `transform` e `opacity`.

**Depois de editar:**

1. Rode `node extensao/assets/mascote/build-demo.mjs`.
2. Revise cada preset da seção 7.1 com **zoom de 4×** (SVG com cerca de 1.000 px de altura) e também em **64 e 96 px** (e 120 px). Uma face lisa sem motivo, um traço que termina no ar ou o limão fora dos olhos e da logo reprovam a pose.
3. Atualize o `RIG.md`, incluindo a seção "Regras de acabamento".
4. Crie `extensao/tests/mascote-rig.test.mjs`, que lê o SVG e verifica:
   - presença de todos os ids obrigatórios (incluindo `m-belt-buckle`, `m-cfist` e `m-cfist-curl`) e pivôs declarados (`data-pivot`);
   - ausência de `<image>`, `<filter>`, `<text>` e de `scaleX(-1)` global;
   - que o limão (o alias interno `--_l`, a classe `.ln` e o gradiente dos olhos) só aparece dentro de `m-eye-l`, `m-eye-r` e `m-chest-logo`;
   - que `mascote-poses.css` define `is-paused`;
   - que os valores de `data-*` são aceitos pelo CSS.

### 6.9 Raster de destaque (escopo reduzido)

O pipeline abaixo vale **só** para os assets de destaque. Eles nunca são carregados na página do ServiceNow.

1. **Limpeza das referências**: remova os overlays de player (tempo "0:02 / 0:06" e "0:05 / 0:06", ícone de mudo, barra inferior), a barra "robo-happy.png" do visualizador, o fundo de escritório (incluindo o "CO" da parede) e o timestamp do raster antigo de alerta.
2. **Remoção de fundo** com matting de alfa suave, sem halo verde. Revise as mãos pretas e o microfone.
3. **Plataforma hexagonal**: remova-a do personagem. Ela vira o asset opcional `lino-pedestal.webp`, usado só em destaque. A sombra vem de um asset separado (`lino-sombra.webp`).
4. **Master** em 512×512, com os pés em `y = 488` e o centro em `x = 256`. Mesma câmera (frontal, cerca de 10° acima, 50 mm) e mesma luz (principal no alto à esquerda, preenchimento suave, rim fria fraca) em todos.
5. **Color grade** para os valores do rig (seção 6.6).
6. **Exportação** em WebP com alfa, qualidade de cerca de 80, em 2× do tamanho exibido. Cada arquivo fica em até 40 KB.

| Arquivo (`extensao/assets/mascote/destaque/`) | Uso | Tamanho exibido |
| --- | --- | --- |
| `lino-avatar-40.webp`, `lino-avatar-64.webp`, `lino-avatar-128.webp` | `#lino` em `painel.html` e cabeçalho da aba expandida | 40, 64 e 128 px |
| `lino-destaque-saudacao.webp` | Onboarding e cabeçalho do painel | até 200 px |
| `lino-destaque-apresentando.webp` | Cabeçalho de `grafico.html` | até 160 px |
| `lino-destaque-comemorando.webp` | Fim de análise na aba expandida e comunicação (a partir da ref 01) | até 200 px |
| `lino-destaque-pensando.webp` | Estado carregando de `grafico.html` (ref 04) | até 160 px |
| `lino-destaque-confuso.webp` | Estado vazio de `grafico.html` (ref 05) | até 160 px |
| `lino-destaque-alerta.webp` | Estado de erro no painel, no lugar do raster antigo de 1 MB | até 160 px |
| `lino-pedestal.webp`, `lino-sombra.webp` | Opcionais, em destaque | n/a |
| `docs/mascote-referencia/model-sheet.webp`, `turnaround.webp`, `expressoes.webp` | Só referência do time; não são empacotados | n/a |

Quando o avatar for exibido abaixo de 40 px, use o rig com `data-view="head"` e `data-detail="low"` em vez do raster.

---

## 7. Especificação C: estrutura de movimentos

### 7.1 Presets do rig (cada estado é pose + expressão + mãos + props + loops, sem frames)

| Estado | Ref. | `data-pose` | `data-eyes` | `data-mouth` | `data-hand-l` | `data-hand-r` | `data-props` | Classes | No rig hoje? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `oculto` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | host `hidden` | n/a |
| `entrada` | 03 | `neutral` → `wave` | `normal` | `happy` | `open-wave` | `relaxed` | n/a | `is-walking` → `is-idle is-blinking` | sim |
| `saudacao` | 03 | `wave` | `normal` | `happy` | `open-wave` | `relaxed` | n/a | `is-blinking` | sim |
| `idle` | n/a | `neutral` | `normal` | `smile` | `relaxed` | `relaxed` | n/a | `is-idle is-blinking` | sim |
| `andar` | n/a | `neutral` | `normal` | `smile` | `relaxed` | `relaxed` | n/a | `is-walking is-blinking` | sim (frontal) |
| `pensando` | 04 | `think` | `normal` | `serious` | `thinking` | `relaxed` | n/a | `is-blinking` | sim |
| `falando` | n/a | estado-base | estado-base | `talk-a`/`talk-o`/`neutral` (JS, a cada 120 ms) | estado-base | estado-base | n/a | `+ is-talking` | sim |
| `apontando` (para a direita) | n/a | `point` | `normal` | `smile` | `relaxed` | `pointing` | n/a | `is-blinking` | sim |
| `apontando` (para a esquerda) | n/a | `point-l` | `normal` | `smile` | `pointing` | `relaxed` | n/a | `is-blinking` | **novo** |
| `apresentando` | n/a | `present` | `happy` | `smile` | `holding` | `holding` | `clipboard` | `is-idle is-blinking` | **novo** |
| `comemorando` | 01, 02 | `jump` (1–2 ciclos) | `normal` | `happy` | `open-wave` | `open-wave` | n/a | n/a | sim |
| `confuso` | 05 | `confused` | `worried` | `serious` | `thinking` | `relaxed` | `bulb` | `is-blinking` | sim |
| `alerta` | raster antigo de alerta | `alert` | `wide` | `surprised` (provisório: `talk-o`) | `open-up` | `open-up` | n/a | n/a | **novo** (parcial) |
| `dormindo` | n/a | `sleep` | `closed` | `neutral` | `relaxed` | `relaxed` | `zzz` | `is-idle` | **novo** (olhos existem) |
| `acordar` | n/a | `sleep` → `neutral` (transição de .45 s) | `closed` → `normal` | `smile` | `relaxed` | `relaxed` | n/a | `is-blinking` | derivado |
| `minimizado` | raster antigo de busto | `neutral` + `data-view="head"` | `normal` | `smile` | n/a | n/a | n/a | `is-blinking` | **novo** |
| `saida` | 03 | `wave` (curto) | `normal` | `smile` | `open-wave` | `relaxed` | n/a | `is-walking` + WAAPI no host | sim |

Como o Lino fica por padrão no canto inferior direito, "apontar para a tabela" normalmente precisa de `point-l`. Até ele existir, use `point` só quando o Lino estiver à esquerda do alvo.

### 7.2 Máquina de estados

| Estado | Gatilho | Duração | Animação | Loop | Transições permitidas |
| --- | --- | --- | --- | --- | --- |
| `oculto` | Tela não suportada, aba de trabalho, mascote desativado, ou sem permissão de origem | n/a | n/a | n/a | `entrada` |
| `entrada` | 1ª detecção de lista ou registro suportado na aba (por sessão de aba) | 1,6 s (0,8 andando e 0,8 acenando) | WAAPI `translateX` no host (`cubic-bezier(.2,.7,.2,1)`) com `is-walking`, depois o preset `saudacao` | não | `idle`, `falando` |
| `saudacao` | Fim da `entrada`, ou clique no Lino depois de 10 min ou mais | 0,9 s (cerca de 1 ciclo de `m-wave` .75 s mais a transição) | CSS do preset | não (o controlador volta ao `idle`) | `idle` |
| `idle` | Padrão | `m-breathe` 3,2 s e `m-head-idle` 4,6 s | CSS | sim; `is-paused` com a aba oculta, fora da viewport ou depois de 30 s sem eventos | todos |
| piscar | Classe `is-blinking` | 0,25 s por piscada, intervalo sorteado entre 3 e 6 s | CSS `m-blink` | sim | n/a |
| `andar` | Reposicionamento (snap de canto, ir até perto da tabela) | ciclo de 0,64 s, no máximo 1,2 s por deslocamento | `is-walking` mais WAAPI no host, no máximo 240 px/s | sim, enquanto desloca | `idle`, `apontando`, `saida` |
| `pensando` | Etapa de análise ativa | contínuo | CSS do preset | sim (piscar e pupilas) | `falando`, `apresentando`, `comemorando`, `confuso`, `alerta` |
| `falando` | Balão novo ou texto em digitação | duração do texto mais 0,4 s | `is-talking` mais lip-sync por JS | sim | estado-base anterior |
| `apontando` | Lista detectada pela 1ª vez, ou balão com referência à tabela | 0,45 s de transição mais 0,8 s parado | CSS do preset | não | `idle` |
| `apresentando` | Balão com mini-gráfico | 0,45 s de transição, depois parado | CSS do preset | parado | `idle`, `comemorando` |
| `comemorando` | Lote concluído sem falhas (`falha = 0`, `negados = 0`, `falhasDeRegistro = 0`; ou `status === "Validado"` em todos no legado) | 0,9–1,8 s (1–2 ciclos de `m-jump`) | CSS `jump` | não; no máximo 1 vez por minuto | `idle` |
| `confuso` | Sem dados: lista vazia, "Sem correspondências", "Nenhuma regra corresponde…", grafo vazio | 2 s de coçar (`m-scratch` 4×), depois parado com `bulb` flutuando | CSS do preset | parado | `idle`, `pensando` |
| `alerta` | 401, 403, 404/503 da integração, "Processamento interrompido", falhas de tag | 0,45 s, depois parado | CSS do preset | parado até haver ação | `idle` |
| `dormindo` | 90 s sem interação e sem análise ativa | contínuo, lento | CSS do preset | sim | `acordar` |
| `acordar` | Hover, clique ou novo evento enquanto dorme | 0,45 s | transição do rig | não | `idle`, `saudacao` |
| `minimizado` | O usuário minimiza | estático | troca de `viewBox` mais escala do host de 160 ms | n/a | `saudacao` ao expandir |
| `saida` | Navegação para tela não suportada, ou o usuário fecha | 0,6 s | WAAPI no host (`ease-in`, translação e fade) | não | `oculto` |

**Prioridade** (maior interrompe menor): `alerta` > `confuso` > `comemorando` > `apresentando` > `apontando` > `falando` > `pensando` > `andar` > `idle` > `dormindo`. Estados one-shot só são interrompidos por um estado de prioridade maior. Eventos de menor prioridade entram numa fila de 1 posição (o mais recente vence).

**Reduced motion**: os presets continuam (são estáticos). Não há `is-walking`, lip-sync, pulo nem translação; o host faz só fades de até 150 ms.

Entregue a máquina como:

- **JSON** com `presets` (exemplo abaixo), `transicoes` e `prioridade`;
- **diagrama Mermaid `stateDiagram-v2`**.

```json
{"presets": {
  "idle":     {"pose": "neutral",  "eyes": "normal",  "mouth": "smile",   "handL": "relaxed",  "handR": "relaxed", "props": "",     "classes": ["is-idle", "is-blinking"]},
  "pensando": {"pose": "think",    "eyes": "normal",  "mouth": "serious", "handL": "thinking", "handR": "relaxed", "props": "",     "classes": ["is-blinking"]},
  "confuso":  {"pose": "confused", "eyes": "worried", "mouth": "serious", "handL": "thinking", "handR": "relaxed", "props": "bulb", "classes": ["is-blinking"]}
}}
```

### 7.3 Prompt para refinar o rig SVG (IA de vetor ou código)

```
Você vai refinar extensao/assets/mascote/mascote.svg, um rig SVG de um mascote robô chibi.
Leia RIG.md e mascote-poses.css antes. NÃO quebre a API: mantenha todos os ids m-*, a hierarquia,
os pivôs (data-pivot e transform-origin no <style>), o viewBox 0 0 256 320 com pés em (128,310),
os valores atuais de data-pose/data-eyes/data-mouth/data-hand-l/data-hand-r/data-props,
as classes is-idle/is-blinking/is-walking/is-talking e as variáveis --mascot-*.
Objetivos: (1) aproximar proporções e detalhes das referências 3D anexadas (cabeça branca com faixa verde
e átomo amarelo, visor preto com olhos verde-limão com brilho, headset verde/branco com microfone,
jaleco com bolsos, peito verde com "L&CO" em traços, mãos pretas articuladas, emblemas de engrenagem/sol,
botas brancas com sola verde, mochila verde); (2) adicionar, como novos valores, data-pose alert|sleep|present|point-l,
data-eyes wide, data-mouth surprised, mãos holding|open-up, props zzz|clipboard, data-detail full|low,
data-view front|head; (3) opcional: vista 3/4 para andar em grupos novos m-34-* (dois lados desenhados,
sem espelhar). Proibido: <image>, <filter>, <foreignObject>, fontes, scaleX(-1) global.
Orçamento: SVG ≤ 24 KB (≤ 6 KB gzip), CSS ≤ 8 KB (≤ 2,5 KB gzip), animar só transform/opacity.
Entregue: SVG, CSS de poses atualizado, diff do RIG.md e a lista de ids adicionados.
```

### 7.4 Prompts de geração de imagem (só para os rasters de destaque)

Os prompts estão em inglês porque os geradores respondem melhor assim. Anexe `01-robo-happy-comemorando.png` (identidade) e a pose mais próxima. Use força alta para a identidade e média para a pose.

**Bloco de trava (prefixe em todos):**

```
CHARACTER LOCK — "Lino": glossy 3D cartoon chibi robot, ~2.6 heads tall, exactly matching the reference images.
Big rounded glossy white head with a wide green stripe over the top and a yellow atom icon centered on the stripe;
glossy black horizontal visor with two large round lime-green eyes with white specular highlights; expressive mouth on
the white face below the visor, no nose; green-and-white headset with a black curved microphone boom; open white lab coat
with chest pocket and two lower pockets; green chest panel with lime "L&CO" logo in two lines; black waist band; black
articulated glossy hands (4 fingers + thumb); white forearms and shin guards with green gear/sun emblem; white boots with
green soles and toe caps; rounded green backpack shell. Palette: #1F8927 green, #0B5E1F deep green, #8DD63F lime,
#F2DF3A yellow atom, #F2F5F3 off-white, #1B2728 near-black. Same proportions, same materials, same details.
CAMERA/LIGHT LOCK: front view slightly from above (~10°), 50mm, key light top-left, soft fill, faint cool rim light.
FRAMING LOCK: full body, centered, feet soles on the same baseline, 512x512, character ~86% of canvas height, empty margin.
BACKGROUND: solid flat #FF00FF magenta (for keying), no floor, no platform, no shadow, no props unless stated, no text, no UI.
NEGATIVE: no redesign, no extra accessories, no mirrored logo, no hexagon platform, no office background, no video player UI.
```

> Use fundo **magenta `#FF00FF`**, nunca verde (chroma key verde apagaria o personagem).

Prompts (adicione depois do bloco de trava):

1. **Model sheet / turnaround** (referência do time e base para a vista 3/4 do rig): `Character turnaround sheet, 5 views in one row at identical scale: front, 3/4 front, side profile, 3/4 back, back (backpack shell visible). Neutral standing pose, arms relaxed. Thin guide lines at head top, visor, shoulders, waist, knees, soles. Flat light-gray background for this sheet only.`
2. **Expressões** (referência para os `data-eyes` e `data-mouth` do rig): `Expression sheet, head only, 3x3 grid: neutral, eyes closed, happy arcs, worried, wide surprised, big open smile with tongue, serious flat mouth, surprised "O", sleepy.`
3. **Destaque, saudação**: `Standing, waving with the right hand raised, open happy smile.` (ref. `03-…`)
4. **Destaque, apresentando**: `Holding a blank white rounded-corner clipboard with both hands at chest height, screen facing viewer and completely blank, proud smile; clipboard must not cover the eyes.`
5. **Destaque, comemorando**: limpeza e color grade da ref. `01-…`: `Same pose as reference: mid-jump, both arms wide open, big open smile.`
6. **Destaque, pensando**: `Right hand touching the headset, serious mouth, eyes glancing up-left.` (ref. `04-…`)
7. **Destaque, confuso**: `Hand on headset, worried eyes, small light bulb with a yellow "?" above the head.` (ref. `05-…`)
8. **Destaque, alerta** (refazer o raster antigo de alerta): `Startled standing pose, round "O" mouth, eyes wide, hands slightly raised and open at hip height.`
9. **Avatar**: `Head only, front view, headset visible, neutral happy smile, centered, tight crop with 8% margin.`
10. **Pedestal e sombra** (opcionais): `The green hexagonal floor platform from the reference, isolated, clean, top 3/4 view, transparent background.` e `Soft elliptical contact shadow only, transparent background.`

### 7.5 Vídeo (opcional, só para onboarding e comunicação)

Na página do ServiceNow, a animação vem **só do rig**. Clipes de vídeo servem apenas para onboarding e material de comunicação:

- WebM VP9 com alfa (a partir do fundo magenta) ou MP4 sem alfa sobre um fundo da marca;
- de 2 a 4 s, câmera travada, começando e terminando na pose neutra.

Sugestões:

- `From neutral, wave 3 times, return to neutral.` (base `03-…`)
- `From neutral, crouch, jump with both arms wide open (match reference 01 at the peak), land, return to neutral.` (base `01-…`/`02-…`)

O vídeo original de 6 s do Grok, se existir, pode servir de base (ver seção 14).

---

## 8. Especificação A: presença do mascote na página do ServiceNow

### 8.1 Regras de detecção (função pura e testável `classificarTela(doc, url, origem)`)

Retorne `{tipo: "lista" | "registro" | "oculto", interface: "classica" | "workspace", tabela, sysId?, total?, motivo}`:

1. Se `url.origin !== origem` configurada, retorne `oculto` com `motivo: "origem"`.
2. Se for login ou logout, tiver `input[type=password]`, ou o texto contiver sessão expirada ou acesso negado (os mesmos regex de `navegacao.mjs` e `lino-api.mjs`), retorne `oculto`.
3. Se `url.pathname` começar com `/now/nav/ui/classic/params/target/`, use o documento de `iframe#gsft_main` quando for da mesma origem. Caso contrário, use o alvo decodificado, como em `consultaURL`.
4. **Lista**: o caminho corresponde a `^/(incident|problem|change_request)_list\.do$` **e** existe `#<tabela>_table` (ou o texto de lista vazia). O `total` é o número de linhas com link de registro válido.
5. **Registro**: o caminho corresponde a `^/(incident|problem|change_request)\.do$`, `sys_id` tem 32 hex e o campo de número está visível.
6. **Workspaces** (Service Operations Workspace e workspaces do Next Experience), com `interface: "workspace"`. A detecção é **primeiro pela URL e depois confirmada no DOM**:
   - **Prefixos de workspace**: `^/now/sow/`, `^/now/workspace/[^/]+/` (ex.: `/now/workspace/agent/`) e `^/now/cwf/[^/]+/` (ex.: `/now/cwf/agent/`).
   - **Registro**: `^/now/(?:sow|workspace/[^/]+|cwf/[^/]+)/record/(incident|problem|change_request)/([a-f0-9]{32})(?:/|$)`. O segmento depois de `record/` é a tabela e o seguinte é o `sys_id`. Registro novo (`-1`) ou `sys_id` inválido fica `oculto`.
   - **Lista**: `^/now/(?:sow|workspace/[^/]+|cwf/[^/]+)/list/params/(?:.*/)?table/(incident|problem|change_request)(?:/|$)`.
     - Quando a rota não traz `table/` (variantes com `list-id/<id>`), leia a tabela no DOM: atributo `table` ou propriedade equivalente do componente de lista.
     - Se não for possível determinar a tabela, a tela é `oculto`, com `motivo: "tabela-desconhecida"`.
   - **Confirmação no DOM, atravessando shadow roots abertos.** Os workspaces são compostos de web components com Shadow DOM aninhado, então `document.querySelector` não basta.
     - Implemente `consultarProfundo(raiz, seletor, {maxNos: 5000, maxProfundidade: 12})`. Ela percorre `element.shadowRoot` **abertos** e os iframes da mesma origem, e para nos limites. **Shadow roots fechados não são lidos.** Nesse caso, a URL é a fonte da verdade e a confirmação no DOM é dispensada.
     - Registro: confirme que existe o componente de formulário ou cabeçalho de registro com o número do registro.
     - Lista: confirme que existe a grade com linhas. O `total` é o número de linhas visíveis com `sys_id` válido, quando legível. Se não for, `total` fica indefinido e o balão diz "Lista de incidentes aberta." em vez de "Encontrei N…".
   - **Abas internas do workspace**: o SOW abre vários registros em subabas, e a URL reflete a subaba ativa. Cada troca de subaba é uma navegação, reavaliada pela seção 8.2.
   - **[PREENCHER: confirmar na instância os padrões de URL exatos de lista e registro (incluindo as variantes `list-id/…` e `sub/…`) e os nomes dos componentes e atributos de lista, formulário e cabeçalho de registro usados na confirmação no DOM.]**
7. **Ações em workspace**:
   - **Incidentes (fluxo Lino)**: classificar funciona, porque a classificação usa a API `/api/global/lino/classificar` só com os ids. A rota `contexto` de `lino-api.mjs` precisa ser estendida para reconhecer o registro (id da URL) e a lista (ids lidos com `consultarProfundo`) em workspace.
   - **Problemas e mudanças (fluxo legado)**: o `formulario.js` depende do menu clássico **Add Tag** (`#toggleMoreOptions`, `#tags_menu`), que não existe no workspace. O balão oferece **Abrir no formulário clássico** (`registroURL()` de `lote.mjs`) em vez de tentar aplicar tags ali.
8. Qualquer outra tela é `oculto`. **[PREENCHER: ampliar para outras tabelas `task` (por exemplo `sc_req_item`, `sc_task`)?]**
9. `problem` e `change_request` mostram o Lino, mas as ações levam ao fluxo legado ("Abrir problemas e mudanças").

Cubra com testes em `extensao/tests/mascote.test.mjs` uma matriz de **pelo menos 32** URLs e DOMs simulados:

- **UI clássica**: lista com e sem registros, registro salvo, registro novo (`sys_id=-1`), Next Experience com iframe, login, acesso negado, home, dashboard, outra origem, `sys_user_list.do`, `problem.do` e `change_request_list.do`.
- **Workspace**:
  - `/now/sow/record/incident/<32 hex>`;
  - `/now/sow/record/incident/-1` (oculto);
  - `/now/sow/record/problem/<32 hex>` (legado, com "Abrir no formulário clássico");
  - `/now/sow/list/params/table/incident` com linhas;
  - a mesma lista sem linhas;
  - lista `list-id/…` com a tabela lida do DOM;
  - lista `list-id/…` sem tabela legível (oculto);
  - `/now/workspace/agent/record/incident/<32 hex>`;
  - `/now/cwf/agent/record/change_request/<32 hex>`;
  - página inicial do SOW (`/now/sow/home`, oculto);
  - registro com Shadow DOM aninhado de 3 níveis abertos (confirmado);
  - registro com shadow root fechado (confirmado só pela URL);
  - DOM com mais de 5.000 nós (`consultarProfundo` para no limite sem travar);
  - workspace de outra origem (oculto).

### 8.2 Ciclo de vida e navegação SPA

- Reavalie a tela, com debounce de 300 ms, quando houver:
  - `navigation` `navigatesuccess` (Navigation API) e `popstate`;
  - `load` do `iframe#gsft_main`;
  - `MutationObserver` limitado ao `body` do documento ativo (observe só `childList` e `subtree`, e desligue quando estiver `oculto` há mais de 10 s sem mudanças de URL). Em workspace, o `MutationObserver` não atravessa shadow roots: observe também os shadow roots abertos do contêiner principal encontrados por `consultarProfundo`, no máximo 3 observadores, e reavalie principalmente por navegação de URL;
  - `visibilitychange`;
  - a mensagem `lino:reavaliar` vinda do worker (`chrome.tabs.onUpdated`).
- **Histerese**: esconda só depois de **2 avaliações negativas consecutivas** (cerca de 600 ms), para não piscar durante o recarregamento do iframe. Ao mudar de lista para registro, o Lino **não sai**: anda ou troca de pose e fala o novo contexto.
- `entrada` toca no máximo uma vez por aba a cada 30 min (`chrome.storage.session`). Nas outras vezes, ele aparece direto em `idle` com fade.
- Pause todas as animações com `is-paused` no rig, e pause o WAAPI do host, quando `document.hidden` for verdadeiro ou quando o host estiver fora da viewport (`IntersectionObserver`).

### 8.3 Posição, arraste e controles

- O host é `position: fixed` e o contêiner raiz tem `pointer-events: none`. Só o Lino, o balão e os botões recebem eventos.
- **Posição padrão**: canto inferior direito, a 24 px das bordas. Antes de posicionar, meça os retângulos da UI nativa a evitar (restrição 2) e escolha o canto livre mais próximo.
- **Arrastável** com Pointer Events (com `setPointerCapture`). Ao soltar, encaixa no canto mais próximo andando (ou com fade, em reduced motion). Salve a posição em `chrome.storage.local` com a chave `lino:posicao:<origem>`.
- **Controles** (aparecem em hover e foco, alvo mínimo de 24×24 px):
  - **Minimizar**: vira o avatar de 40 px;
  - **Ocultar nesta página**;
  - **Desativar o Lino**, com reativação em `opcoes.html`, que ganha o campo "Mostrar o Lino nas telas do ServiceNow".
- **Teclado**: o Lino é um `<button aria-label="Lino, assistente do RetroGrafos. Abrir mensagens">`. `Esc` fecha o balão, as setas movem 16 px quando o modo "mover" está ativo e `Enter` expande o avatar. **Nunca roube o foco** da página.
- **z-index**: fica acima do conteúdo da lista e do formulário e **abaixo dos modais nativos**. Comece em `z-index: 1040` e valide. **[PREENCHER: confirmar na instância o z-index dos modais (GlideModal ou Next Experience).]** Se um modal nativo abrir (`.modal.in`, ou `[role=dialog][aria-modal=true]` fora do host, incluindo os encontrados por `consultarProfundo` dentro dos shadow roots do workspace), o Lino minimiza sozinho.
- **Área**: em repouso, o Lino (rig 4:5) tem no máximo 96×120 px; o padrão é cerca de 77×96 px. O balão tem largura entre 240 e 320 px e altura máxima de 40vh, com rolagem interna.

### 8.4 Contrato de mensagens

Os eventos fluem do side panel para o service worker e dele para o content script da aba alvo:

```js
{tipo: "lino:etapa", fluxo: "lino" | "legado", etapa, estado: "ativo" | "concluido" | "erro" | "aguardando",
 texto?, feitos?, total?, dados?, acao?: {rotulo, comando}}
{tipo: "lino:resultado", fluxo, totais: {adicionada, existente, falha, negados, falhasDeRegistro}, grafico?}
{tipo: "lino:aba-de-trabalho?"} → {trabalho: boolean}
{tipo: "lino:expandir", grafico} → o worker grava em chrome.storage.session e abre grafico.html
```

- **Aba alvo no fluxo Lino**: `sessao.tabId`.
- **Aba alvo no fluxo legado**: a aba ativa do usuário, se for da origem e suportada, e nunca as abas de trabalho. **[PREENCHER: confirmar.]**
- **Fallback**: se a página não tiver content script (sem permissão ou tela oculta), o side panel mostra os mesmos balões empilhados ao lado de `#lino`.

---

## 9. Especificação D: balões no lugar da barra de progresso

### 9.1 Comportamento

- **Uma etapa equivale a um balão.** O balão ativo mostra o rótulo da etapa (chip), uma frase curta (até 90 caracteres, no máximo 2 linhas) e, quando houver contagem, o contador tabular "7 de 18" com uma régua fina de 3 px dentro do balão. A barra grande deixa de existir.
- **Estados do balão**:
  - **digitando**: 3 pontos, no máximo 600 ms. Nunca atrase o texto real só para "parecer" digitação; em reduced motion não há digitação.
  - **ativo**: Lino em `pensando`.
  - **concluído**: ícone de check e o balão se recolhe em **chip de histórico** depois de 1,2 s.
  - **erro**: borda e ícone de perigo, o texto diz o que aconteceu e o que fazer, com um botão de ação. Fica visível até haver ação ou até ser fechado.
  - **aguardando ação do usuário**: por exemplo, a autorização.
- **Etapas curtas**: as que duram menos de 400 ms não geram balão próprio e são fundidas na seguinte, para evitar piscadas.
- **Empilhamento**: no máximo **1 balão ativo e 3 chips** visíveis. Os mais antigos ficam em "Ver histórico" (lista expansível, no máximo 20 itens por análise). Uma nova análise limpa o histórico.
- **Final**: o balão de resultado fica por 12 s e depois recolhe para o chip "Resultado". O balão de erro não some sozinho.
- **Acessibilidade**:
  - uma única região `role="status" aria-live="polite"` visualmente oculta, que anuncia **só mudanças de etapa e o resultado**. As atualizações do contador são anunciadas no máximo a cada 25% ou a cada 5 s;
  - os erros usam `role="alert"`;
  - o balão visível tem `aria-hidden` sobre o texto já anunciado, para não haver leitura dupla;
  - os botões dos balões são alcançáveis por Tab dentro do host.
- **Painéis, nos dois fluxos**:
  - **Legado** (`legado.html`): `#processamento` perde o `<progress>`, o `#progresso-contador`, o `#progresso-detalhe` e o bloco grande. Ficam só a linha de chips de etapa (substituindo `.etapas`, ainda com `aria-current="step"`) e o grafo.
  - **Lino** (`painel.html` + `lino.mjs`): as mensagens de progresso deixam de ser escritas como texto corrido.
    - `#contexto-texto` mantém só o contexto estático (o título do incidente ou "Incidentes da página").
    - "Verificando a aba ativa…", "Carregando o grafo…", "Aplicando as tags · i de N incidentes" e o resumo final, hoje escritos em `#contexto-texto` e `#resultado-status` pelas funções `situacao()`, `classificar()` e `mostrarResultado()`, viram eventos `lino:etapa` e `lino:resultado`.
    - O painel mostra a mesma linha de chips de etapa. A `details#resultados` continua disponível como **Ver detalhes**.
  - **Fallback**: sem content script na aba, os balões aparecem no próprio painel (seção 8.4).

### 9.2 Microcopy por etapa real (PT-BR, primeira pessoa, tom do produto)

Fluxo **Lino** (`lino.mjs`):

| Etapa (código) | Ativo | Concluído | Erro ou alternativa (com ação) |
| --- | --- | --- | --- |
| `aba` (`verificar`, "Verificando a aba ativa…") | "Estou olhando esta aba…" | "Instância confirmada." | Outra origem: o Lino fica oculto |
| `permissao` (`chrome.permissions.contains`) | n/a | "Conexão autorizada." | Aguardando: "Preciso da sua autorização para ler esta aba." + **Conectar ao ServiceNow** |
| `contexto` (rota `contexto`) | "Lendo a tela…" | Lista: "Encontrei 18 incidentes nesta página." · Registro: "Incidente INC0010023 aberto." | Legado: "Problemas e mudanças ficam no painel RetroGrafos." + **Abrir problemas e mudanças** · Lista vazia: "Esta lista não tem incidentes para classificar." (`confuso`) |
| `acesso` (`GET /acesso`) | "Conferindo seu acesso…" | "Acesso confirmado." | 401: "Sua sessão do ServiceNow terminou. Entre novamente para continuar." + **Entrar no ServiceNow** · 403: "Você não tem acesso para categorizar chamados." + **Verificar novamente** · 404/503: "A integração do Lino ainda não está disponível nesta instância." (`alerta`) |
| `preferencias` | (menos de 400 ms, fundida) | n/a | "Não consegui ler seus termos ignorados." |
| `grafo` (`GET /grafo`, "Carregando o grafo…") | "Montando o grafo de tags…" | "12 tags ligadas a 31 incidentes." + mini-grafo ou **Expandir** | Vazio: "Classifique um incidente para começar o grafo." (`confuso`) · Erro: "Não consegui atualizar o grafo. Tente novamente." + **Atualizar grafo** |
| `classificar` (lotes de 5) | "Classificando 5 de 20 incidentes…" | n/a | "O ServiceNow não confirmou a classificação. Tente novamente para conferir as tags." |
| `resultado` (`mostrarResultado`) | n/a | "8 tags adicionadas · 3 já presentes." (`comemorando` se não houver falha) + mini-barras | "2 tags falharam e 1 incidente ficou sem acesso." + **Ver detalhes** (`alerta`) |

Fluxo **legado** (`painel.mjs`):

| Etapa (`data-etapa`) | Ativo | Concluído | Erro ou alternativa |
| --- | --- | --- | --- |
| `consulta` (`consultaURL`) | "Lendo a consulta da URL…" | "Consulta: `active=true^priority=1`." (ou "Todos os registros") | Sem filtro: "Esta lista não tem filtro. Selecione cada registro antes de aplicar." · Erro: "Use a URL de uma lista de incidentes, problemas ou mudanças." |
| `acesso` (`sessao`, `leitura`, `gravacao`) | "Conferindo sessão, leitura e gravação…" | "Sessão identificada e lista acessível." | "Sessão expirada. Entre na aba de trabalho e volte ao painel." + **Abrir aba de trabalho** · "Acesso negado a esta tabela." |
| `revisao` (`progresso("Analisando registros")`) | "Analisando 7 de 18 registros, até 3 por vez…" | "Pronto. Revise as sugestões antes de aplicar as tags." | "3 registros precisam de atenção." (`alerta` leve) |
| `resultado` (`rodar`: "Aplicando tags" ou "Conferindo tags") | "Aplicando tags · 4 de 10 registros…" | "Lote conferido. Veja o resultado em cada registro." (`comemorando` se todos estiverem validados) | "Processamento interrompido: {motivo}." (`alerta`) |

Regras de texto:

- O verbo do botão é o mesmo do resultado ("Aplicar tags" leva a "Tags aplicadas").
- Erros não pedem desculpas, dizem o que aconteceu e como resolver.
- Números sempre em algarismos.
- Nomes técnicos (`sys_id`, rota) nunca aparecem no balão.

---

## 10. Especificação E: gráficos no balão ou na aba expandida

### 10.1 Critérios de decisão

| Situação | Onde renderizar |
| --- | --- |
| Totais do resultado (até 5 categorias: adicionadas, já presentes, falhas, sem acesso, falhas de registro) | **No balão**: barras horizontais empilhadas ou barras curtas com rótulo e número |
| Série com até 30 pontos (por exemplo, tags por dia) | **No balão**: sparkline sem eixo, com o valor final em texto |
| Grafo com até 6 nós no total (até 2 tags e 4 incidentes) | **No balão**: versão simplificada de `desenhar()`, sem rótulos de incidente |
| Grafo com mais de 6 nós, mais de 30 pontos, mais de 5 categorias, rótulo cortado em mais de 20% dos caracteres, ou necessidade de filtro, busca ou clique em nó | **Botão "Expandir"**: o balão mostra só o resumo ("12 tags · 31 incidentes") e uma miniatura não interativa |
| Grafo incremental do legado (`criarGrafo`, até 16 termos) durante a análise | Resumo no balão ("9 termos encontrados até agora") e grafo completo no painel ou na aba expandida |

- **Tamanhos**: a área do gráfico no balão vai de 240×96 px (mínimo) a 288×140 px (máximo). Rótulos com pelo menos 11 px e contraste de pelo menos 4,5:1. Elementos gráficos com contraste de pelo menos 3:1 contra o fundo do balão.
- **Interações no balão**: só tooltip em hover e foco com o valor exato. Nada de zoom ou filtro (isso pertence à aba expandida).
- Cada mini-gráfico tem uma **alternativa textual**: um `<figure>` com `<figcaption>` e uma tabela visualmente oculta com os dados.

### 10.2 Aba expandida

- É a nova página da extensão `grafico.html` + `grafico.mjs`. Ela reutiliza `lino.css`, `desenhar()` e `agrupar()` de `lino-grafo.mjs` e `criarGrafo()` de `grafo.mjs`, com busca, filtro por `TIPOS_LINO`, legenda e lista acessível das tags, como no painel.
- **Passagem de dados**:
  1. O content script envia `lino:expandir` ao worker.
  2. O worker grava `chrome.storage.session` com a chave `lino:grafico:<uuid>`, contendo `{origem, fluxo, geradoEm, tipo, dados}`. São só dados agregados, `sys_id`, número e título curto, sem descrição longa.
  3. O worker abre `chrome.tabs.create({url: chrome.runtime.getURL("grafico.html#" + uuid)})`.
  4. A página lê e apaga a chave depois de 10 min (TTL).
- Os links de registro na aba usam `registroURL()` de `lote.mjs` e abrem em uma nova aba com `rel="noopener"`.
- Estados da aba: carregando, vazio ("Este gráfico expirou. Gere a análise novamente.") e erro.
- Cabeçalho com o Lino em `apresentando` (avatar 64 px, com `lino-pedestal.webp` opcional).

---

## 11. KPIs de design e usabilidade (com metas)

Toda medição de uso é **local** (`lino:metricas` em `chrome.storage.local`, exportada manualmente em `opcoes.html`). Nada é enviado para fora (restrição 7).

| KPI | Como medir | Meta |
| --- | --- | --- |
| Tempo até o Lino aparecer depois da navegação para tela suportada | `performance.now()` do evento de navegação até o primeiro frame visível, gravado em `lino:metricas` | p75 ≤ **500 ms** (UI clássica) e ≤ **800 ms** (workspace) |
| Tempo até a primeira informação útil (TTFI) | Da detecção até o balão com contexto ("18 incidentes nesta página"), gravado em `lino:metricas` | p75 ≤ **1,0 s** |
| Latência do 1º balão depois de iniciar a análise | Do clique até o balão `ativo` | ≤ **300 ms** |
| Precisão da detecção | Matriz de testes da seção 8.1 (clássica e workspace) | **0 falsos positivos** em 32+ casos; falsos negativos ≤ **5%** |
| Custo da leitura profunda em workspace | Tempo de `consultarProfundo` por reavaliação | p95 ≤ **8 ms**; nunca mais de 5.000 nós visitados |
| Privacidade da telemetria | Inspeção de `lino:metricas` e DevTools Network | **0** campos com `sys_id`, número, título ou usuário; **0** requisições fora da origem da instância e da extensão |
| Taxa de dispensa (minimizar, ocultar ou desativar na 1ª sessão) | Contadores em `lino:metricas`, consolidados a partir das exportações manuais do piloto | ≤ **20%** minimizam e ≤ **5%** desativam |
| Intrusividade em repouso | Área do Lino ÷ viewport de 1366×768 | ≤ **1,5%** (120×120 ≈ 1,4%) |
| Intrusividade com balão | (Lino + balão) ÷ viewport | ≤ **8%**; **0** sobreposições com os elementos da restrição 2 |
| Cliques bloqueados na UI nativa | Teste automatizado com `elementFromPoint` sobre os alvos da restrição 2 | **0** |
| FPS durante a animação | Performance panel, notebook médio, CPU 4× throttle | ≥ **55 fps**; 0 long tasks acima de 50 ms causadas pelo mascote |
| CPU em repouso | Depois de 30 s de `idle`, com a animação pausada | ≈ **0%** (sem rAF ativo) |
| Peso do mascote na página (SVG, CSS de poses, controlador JS e balões) | gzip, medido no build | ≤ **35 KB** no total: SVG ≤ **6 KB** (hoje 4,0 KB, 4.088 bytes), CSS ≤ **2,5 KB** (hoje 1,5 KB), JS do controlador e dos balões ≤ **25 KB** |
| Requisições de imagem raster na página do ServiceNow | DevTools Network filtrado por `chrome-extension://` | **0** (o SVG é inline; só `mascote.svg` e o CSS são lidos, uma vez por página) |
| Rasters de destaque | Tamanho dos arquivos | ≤ **40 KB** cada; ≤ **400 KB** no conjunto; carregados só em páginas da extensão |
| Propriedades animadas | Auditoria do CSS e do WAAPI | só `transform` e `opacity`; 0 animações de layout ou de `filter` |
| Impacto no carregamento do ServiceNow | LCP com e sem extensão | ≤ **+50 ms**; o script roda em `document_idle` |
| Memória | Heap snapshot | ≤ **15 MB** |
| Contraste | Texto do balão / UI e ícones | ≥ **4,5:1** / ≥ **3:1** (WCAG 2.2 AA) |
| Alvo de toque | Botões do host | ≥ **24×24 px** (WCAG 2.5.8) |
| Leitor de tela | NVDA + Chrome | 1 anúncio por etapa; 0 anúncios duplicados |
| Reduced motion | Emulação no DevTools | 0 deslocamentos ou loops; só fades de até 150 ms |
| Consistência do personagem | Checklist de 12 traços (seção 6.1) e as 6 regras de acabamento (seção 6.3.1) em cada preset do rig e em cada raster, revisados em zoom de 4× e em 64 e 96 px | **100%** aprovados; 0 espelhamentos com `scaleX(-1)`; 0 traços soltos; limão fora dos olhos e da logo = 0 |
| Compatibilidade da API do rig | `extensao/tests/mascote-rig.test.mjs` | **100%** dos ids, pivôs e valores de `data-*` existentes preservados |
| Legibilidade em tamanho pequeno | Revisão visual em 64 e 80 px | `data-detail="low"` aplicado automaticamente abaixo de 80 px; silhueta reconhecível em 64 px por ≥ 4 de 5 avaliadores |
| Clareza do microcopy | Teste com 5 analistas: "o que o Lino está fazendo agora?" | ≥ **4 de 5** acertam em todas as etapas |

---

## 12. Formato de saída esperado

Entregue nesta ordem e com estes títulos:

1. **Brief de direção**: intenção, domínio, mundo de cor, assinatura, padrões rejeitados e alternativas, e as suposições feitas sobre os **[PREENCHER]**.
2. **Tokens**: bloco `:host { --lino-…; --balao-…; }` com cores, tipografia, espaçamento, raios, sombra e movimento, e uma tabela de contraste calculado.
3. **Personagem**: model sheet, turnaround, expressões, mãos, folha de tamanho pequeno, as decisões sobre as inconsistências da seção 6.3, e o mapeamento de tokens `--lino-*` ↔ `--mascot-*` (6.6).
4. **Rig SVG refinado**: `mascote.svg`, `mascote-poses.css`, diff do `RIG.md`, lista de ids e valores adicionados, demo regenerado com `build-demo.mjs`, e o tratamento de cada limitação da seção 6.7 (resolvida ou adiada, com motivo).
5. **Rasters de destaque**: arquivos da seção 6.9 com peso medido, e os prompts finais de imagem e vídeo (7.4 e 7.5), um por arquivo.
6. **Máquina de estados**: JSON de presets do rig, transições e prioridade, mais o diagrama Mermaid.
7. **Balões**: especificação de componente (anatomia, estados, medidas) e a tabela de microcopy final dos dois fluxos.
8. **Gráficos**: tabela de decisão, protótipos dos mini-gráficos e o contrato de `grafico.html`.
9. **Código** (se você gera código), em diff ou arquivos completos:
   - `extensao/mascote.js` (content script: detecção, máquina de estados, injeção do rig inline no Shadow DOM, lip-sync e WAAPI do host);
   - `extensao/tests/mascote-rig.test.mjs` (contrato da API do rig);
   - `extensao/mascote-tela.mjs` (`classificarTela`, pura);
   - `extensao/grafico.html` e `grafico.mjs`;
   - mudanças em `manifest.json` (`web_accessible_resources`, sem novas permissões obrigatórias);
   - mudanças em `painel-worker.js` (registro do content script, roteamento de mensagens, abas de trabalho);
   - mudanças em `lino.mjs` e `painel.mjs` (emitir `lino:etapa` e `lino:resultado`);
   - mudanças em `legado.html` e `painel.css`: remover a barra grande e **migrar para os tokens de `lino.css`** (escuro e verde, Inter embutida). Os valores do tema Bootstrap (`--bs-primary: #106350`, fundo `#edf3f1`, "Source Sans 3") passam a apontar para os tokens do Lino ou saem. O Bootstrap só fica se ainda for necessário para o layout;
   - mudanças em `lino.mjs` (`situacao()`, `classificar()`, `mostrarResultado()`) para emitir `lino:etapa` e `lino:resultado` em vez de escrever o progresso em `#contexto-texto` e `#resultado-status`;
   - extensão da rota `contexto` em `lino-api.mjs` e de `classificarTela` para workspace, com `consultarProfundo` em módulo puro e testável;
   - mudanças em `opcoes.html` e `opcoes.mjs`: ligar e desligar o Lino, e **Exportar métricas** (download de JSON) e **Apagar métricas** da chave local `lino:metricas`;
   - `extensao/metricas.mjs`: registro local em buffer circular, sem dados de chamados, com retenção de 30 dias;
   - testes em `extensao/tests/mascote.test.mjs`;
   - o nome do personagem no código já é Lino. O avatar do painel é `#lino` / `assets/lino-avatar.webp`. Os rasters antigos foram removidos.
10. **Plano de validação dos KPIs**: como medir cada um, com script ou passo a passo.
    - Os KPIs de laboratório (desempenho, peso, contraste, detecção) são medidos com DevTools e testes `node --test`.
    - Os KPIs de uso (TTFI, taxa de dispensa, tempo até aparecer) vêm **só** da chave local `lino:metricas`, exportada manualmente em `opcoes.html` pelos participantes do piloto e consolidada à mão pelo time.
    - Não há coleta automática nem envio para fora.
11. **Checklist de aceite** (seção 13) marcado item por item, com a evidência de cada um.

---

## 13. Critérios de aceite (verificáveis)

**Detecção e presença**

- [ ] Em `/incident_list.do` com registros, o Lino aparece em ≤ 500 ms (p75), aponta para a lista e fala "Encontrei N incidentes nesta página."
- [ ] Em `/incident.do?sys_id=<32 hex>` salvo, o Lino aparece e fala "Incidente <número> aberto."
- [ ] Em `/now/nav/ui/classic/params/target/incident_list.do…`, a detecção usa o `gsft_main` e o comportamento é igual ao da lista clássica.
- [ ] Em `/now/sow/record/incident/<32 hex>`, `/now/workspace/agent/record/incident/<32 hex>` e `/now/cwf/agent/record/<tabela>/<32 hex>`, o Lino aparece com `interface: "workspace"`, confirmando o registro no DOM através de shadow roots abertos (ou só pela URL quando o root é fechado).
- [ ] Em `/now/sow/list/params/table/incident`, o Lino aparece. Se as linhas forem legíveis, fala "Encontrei N incidentes nesta página."; se não, "Lista de incidentes aberta."
- [ ] Na página inicial do SOW, em registro novo (`-1`) e em lista com tabela desconhecida, o Lino **não aparece**.
- [ ] Ao trocar de subaba no SOW, o contexto do balão é atualizado em ≤ 800 ms, sem `entrada` repetida.
- [ ] Em workspace, o Lino não cobre a barra de ações, o painel lateral contextual, as abas nem a paginação (teste com `elementFromPoint`).
- [ ] Em workspace, a classificação de incidentes funciona pela API. Para problemas e mudanças, o balão oferece **Abrir no formulário clássico**.
- [ ] `consultarProfundo` respeita os limites de nós e de profundidade e não lança erro em shadow roots fechados nem em iframes de outra origem.
- [ ] Em `incident.do?sys_id=-1`, login, home, dashboard, `sys_user_list.do`, acesso negado e outra origem, o Lino **não aparece**.
- [ ] Nas abas de trabalho criadas por `painel.mjs` (`active: false`), o Lino **não aparece**, e o `formulario.js` aplica tags sem interferência.
- [ ] Na navegação lista → registro → lista dentro do Next Experience, não há piscada (histerese) nem `entrada` repetida em menos de 30 min.
- [ ] `node --test extensao/tests/*.test.mjs` passa, incluindo a matriz de 20+ casos de `classificarTela`.

**Não intrusão e isolamento**

- [ ] Nenhum ponto de `#<tabela>_table thead`, da paginação, dos botões do formulário, de `#toggleMoreOptions`, `#tags_menu` ou `#document_tags` retorna o host do Lino em `document.elementFromPoint`.
- [ ] Um modal nativo aberto fica acima do Lino, e ele minimiza sozinho.
- [ ] Os estilos do ServiceNow não alteram o Lino, e o Lino não altera o ServiceNow: diff visual de 0 px na página com o mascote oculto.
- [ ] Arrastar, encaixar no canto, minimizar, ocultar nesta página e desativar funcionam por mouse e por teclado, e a posição persiste por origem.

**Animação e personagem**

- [ ] Na página do ServiceNow, o Lino é o `mascote.svg` **inline** dentro do Shadow DOM, e nenhum `<img>` ou raster é requisitado.
- [ ] Cada estado da tabela 7.1 é obtido só com `data-pose`, `data-eyes`, `data-mouth`, `data-hand-l`, `data-hand-r`, `data-props` e as classes `is-*`.
- [ ] O controlador não manipula paths nem cria frames.
- [ ] `mascote-rig.test.mjs` passa: todos os ids `m-*` e pivôs originais existem, os valores de `data-*` originais funcionam e não há `<image>`, `<filter>`, `<foreignObject>` nem `scaleX(-1)` global.
- [ ] Os novos valores (`alert`, `sleep`, `present`, `point-l`, `wide`, `surprised`, `holding`, `open-up`, `zzz`, `clipboard`, `data-detail`, `data-view`) existem ou estão justificados como adiados.
- [ ] O `demo.html` foi regenerado com `build-demo.mjs`, e o `RIG.md` foi atualizado.
- [ ] Os pés ficam ancorados em `(128, 310)` em todas as poses (variação de até 1 unidade do viewBox, exceto no pulo, em que a sombra fica no lugar).
- [ ] Abaixo de 80 px de altura, `data-detail="low"` é aplicado e a logo "L&CO" vira um bloco simplificado.
- [ ] Em 64 px a silhueta é reconhecível, e o contorno não some.
- [ ] Cada pose da seção 7.1 foi revisada com **zoom de 4×** e em **64 e 96 px**, e o registro está nas capturas (ex.: `output/mascote-preview/`). Nenhuma face lisa sem motivo e nenhum traço terminando no ar.
- [ ] O verde-limão aparece só nos olhos e na logo. Juntas, botas, sola, fone e mochila usam os outros verdes.
- [ ] Nenhum detalhe decorativo sem peça real, e nenhum texto no desenho além da logo. As falas e os rótulos estão só no balão.
- [ ] A sombra de contato encolhe e clareia no pulo, e o brilho das peças brancas vem do alto à esquerda (rig e rasters).
- [ ] As transições do personagem têm no máximo uma ultrapassagem (mola de um único overshoot), sem quiques repetidos.
- [ ] Duas instâncias na mesma página (por exemplo, o Lino e uma prévia), cada uma em seu shadow root, renderizam gradientes e poses corretamente, sem interferência.
- [ ] O andar não espelha o SVG: a direção vem só da translação do host (ou da vista 3/4 opcional, desenhada para os dois lados).
- [ ] `comemorando` roda no máximo 2 ciclos de `jump` e volta para `idle`, e o piscar tem intervalo sorteado entre 3 e 6 s.
- [ ] Com `prefers-reduced-motion: reduce`, as poses aparecem estáticas, sem `is-walking`, lip-sync ou translação, e o host faz só fades de até 150 ms.
- [ ] `is-paused` é aplicada com a aba oculta, com o Lino fora da viewport e depois de 30 s de `idle`, e removida ao voltar, sem mudar a pose. Com `prefers-reduced-motion: reduce`, o Lino mostra a pose estática.
- [ ] Os rasters de destaque da 6.9 existem sem fundo, sem plataforma embutida e sem overlay de player, com até 40 KB cada, e o raster antigo de alerta, de cerca de 1 MB, foi removido.

**Balões**

- [ ] A barra `<progress id="progresso">` e o bloco `#processamento` grande deixaram de existir no `legado.html`, e cada etapa real da 9.2 gera um balão com os estados ativo, concluído e erro.
- [ ] Há no máximo 1 balão ativo e 3 chips visíveis, e o histórico fica acessível.
- [ ] O leitor de tela anuncia 1 vez por etapa e os erros como `alert`.
- [ ] Todo erro mostra uma ação (botão) com o mesmo rótulo usado no painel.
- [ ] No fluxo Lino, nenhuma mensagem de progresso ("Verificando a aba ativa…", "Carregando o grafo…", "Aplicando as tags · i de N incidentes") é escrita em `#contexto-texto` ou `#resultado-status`. Todas viram balões, e o painel mostra os chips de etapa.
- [ ] Balões, chips e `grafico.html` usam só os tokens derivados de `lino.css`, e o `legado.html` não usa mais o tema claro do Bootstrap (`#106350`, `#edf3f1`).
- [ ] Sobre o fundo claro do ServiceNow, o balão é opaco, sem `backdrop-filter`, com texto ≥ 4,5:1, borda interna e contorno externo, e uma única sombra sutil. Isso vale também no tema escuro do Next Experience.

**Gráficos**

- [ ] Os totais do resultado aparecem como mini-barras no balão, com alternativa textual.
- [ ] Um grafo com mais de 6 nós mostra resumo e **Expandir**. A aba `grafico.html` abre com os mesmos dados, permite busca e filtro e expira em 10 min.

**KPIs**

- [ ] Todas as metas da seção 11 foram medidas e registradas, com o método indicado.

**Telemetria local**

- [ ] `lino:metricas` existe só em `chrome.storage.local`, respeita 500 eventos, 200 KB e 30 dias, e não contém `sys_id`, número, título nem usuário.
- [ ] Nenhuma requisição de rede do mascote vai para fora da origem da instância ou da extensão (DevTools Network).
- [ ] Em `opcoes.html`, **Exportar métricas** baixa um JSON e **Apagar métricas** limpa a chave.

---

## 14. Decisões pendentes

Lista consolidada dos **[PREENCHER]** espalhados pelo prompt:

1. Disponibilidade do vídeo original de 6 s. Prioridade baixa, porque só serve a onboarding e comunicação.
2. Padrões de URL exatos de lista e registro dos workspaces na instância (variantes `list-id/…` e `sub/…`), e os nomes dos componentes e atributos usados na confirmação no DOM (seção 8.1).
3. Ampliar para outras tabelas `task` (por exemplo `sc_req_item`, `sc_task`).
4. z-index dos modais nativos na instância, na UI clássica e no Next Experience.
5. Em qual aba os balões aparecem no fluxo legado.
6. Outros gráficos planejados, além do grafo e dos totais.

**Já decidido (não reabra):**

- **Marca**: a logo "L&CO" fica no peito (uso autorizado). Abaixo de cerca de 80 px, usa a versão simplificada (`data-detail="low"`).
- **Mãos**: totalmente pretas. As pontas verde-limão do raster antigo de busto são descartadas. O lado dos emblemas e da faixa é uma decisão de design registrada no model sheet (seção 6.3).
- **Sistema visual**: o escuro e verde de `lino.css` vale para balões, chips, `grafico.html` e telas novas. O legado migra para esses tokens. Na página, os balões são opacos, com contorno e sombra sutil (seção 5.3).
- **Progresso**: viram balões o `#processamento` e o `<progress>` do legado e o texto de progresso do `lino.mjs` (`#contexto-texto`, `#resultado-status`).
- **Workspace**: suportado. Service Operations Workspace (`/now/sow/…`) e workspaces do Next Experience (`/now/workspace/…`, `/now/cwf/…`), com detecção por URL e confirmação através de shadow roots abertos (seção 8.1).
- **Telemetria**: só local (`lino:metricas` em `chrome.storage.local`), sem dados de chamados, com exportação e apagamento manuais em `opcoes.html`. Nada é enviado para fora.

- **Nome e voz: Lino**, masculino, o mesmo nome da extensão.
  - Ele fala em primeira pessoa, no masculino ("Estou olhando esta aba…", "Encontrei 18 incidentes nesta página.").
  - O `aria-label` do rig e do host é "Lino, assistente do RetroGrafos".
  - O personagem no código se chama Lino. Os rasters com o nome antigo foram removidos.

- **Formato: híbrido.**
  - Na página do ServiceNow, o Lino é o rig SVG inline em Shadow DOM, animado por CSS e WAAPI.
  - Os rasters 3D em WebP com alfa ficam só para destaque: `grafico.html`, cabeçalho do painel, avatar, onboarding e comunicação.
  - Lottie, Rive e GSAP não entram na extensão.
- **Fonte da verdade das cores**: os valores `--mascot-*` do rig. Os rasters são color-graded para eles (seção 6.6).
- **Vista 3/4 para andar**: opcional, como evolução do rig, sem quebrar a vista frontal.
