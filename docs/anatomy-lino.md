# Skill `anatomy` aplicada ao Lino

Fonte: [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy) (MIT). Instalada em `C:\Users\atene.adm\.agents\skills\anatomy\`.

## O que a skill é

É um método e um kit (Node + SVG) para criar **figuras técnicas isométricas interativas**: um conceito explicado por uma máquina real com dezenas de peças, sombreamento em quatro tons, ordem de pintura correta, moldura com título e leitura ao vivo, e movimento suave. Não trata de anatomia de personagem (proporções, linha de ação). O kit isométrico não serve para um mascote frontal chibi; as **regras de acabamento e de verificação** servem.

## O que foi aplicado no rig (`extensao/assets/mascote/`)

| Regra da skill | Problema no Lino | Correção |
| --- | --- | --- |
| Linhas terminam em algo | Os vincos dos dedos (mão `relaxed` e `thinking`) paravam no meio do punho | Recortados pela silhueta da mão (`m-cfist`, `m-cfist-curl`) e contorno redesenhado por cima; agora terminam na borda |
| Um único destaque | O limão aparecia nos olhos, no logo **e** nos centros das juntas dos joelhos | Juntas passaram para `--mascot-green-light`; limão ficou só nos olhos e no logo |
| Volume / halo suave | Sombra era uma elipse chapada | `m-shadow` virou `<g>` com 3 elipses (halo difuso + contato); a animação do pulo continua igual |
| Detalhe com função | Cinto liso, sem leitura de peça | Fivela `m-belt-buckle` (contorno metálico `--mascot-white-shade`) |
| Parar quando fora da tela | Loops CSS rodavam sempre | Classe nova `is-paused` (`animation-play-state: paused`), documentada no RIG.md |

A API não mudou: ids `m-*`, pivôs, viewBox, âncora (128,310), atributos `data-*`, classes e `--mascot-*` estão como antes. Os acréscimos foram `m-belt-buckle`, os clipPaths `m-cfist*` e `is-paused`. Nenhum pivô foi mexido.

## Recomendações para o prompt mestre

1. **Uma cor de destaque:** verde-limão só nos olhos e no logo L&CO. Juntas, botas e fone usam a escala de verdes da marca.
2. **Linhas que terminam:** todo vinco, costura ou painel termina no contorno ou numa junta; não pode haver traço solto numa face lisa.
3. **Peças reais, não textura:** só desenhar detalhe que existe no robô (fivela, junta, punho, costura do jaleco). Nada de linhas ou pontos decorativos.
4. **Volume discreto:** sombra suave de contato sob os pés, que encolhe e clareia no pulo. Brilho especular só no topo das peças brancas, com luz vindo do alto à esquerda.
5. **Hierarquia de tons:** branco = casco, verde = estrutura/roupa, preto = juntas e mãos, visor escuro = palco dos olhos. O olhar deve ir primeiro aos olhos.
6. **Movimento calmo:** transições com uma única ultrapassagem (mola), loops lentos, pausar fora da tela ou com a aba oculta, e uma pose estática com `prefers-reduced-motion`.
7. **Critério de aceite:** revisar cada pose com zoom de 4× (silhueta a ~1000 px de altura) e também em 64/96 px. Uma face lisa sem motivo ou um traço que termina no ar reprova a pose.
8. **Sem texto dentro do desenho** além do logo; falas e rótulos vão no balão, fora do SVG.

## Capturas (`output/mascote-preview/`)

- Antes: `mascote-demo-pre-anatomy.png`, `mascote-zoom-pre-anatomy.png`, `mascote-folha-poses-pre-anatomy.png`
- Depois: `mascote-demo-anatomy.png`, `mascote-zoom-anatomy.png`, `mascote-folha-poses-anatomy.png`, `mascote-dedos-8x-anatomy.png`
