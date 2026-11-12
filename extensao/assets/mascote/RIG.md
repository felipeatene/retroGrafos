# Rig do Lino, mascote do RetroGrafos (SVG)

O `<svg>` usa `aria-label="Lino, assistente do RetroGrafos"`.

Arquivos desta pasta:

| Arquivo | Papel |
| --- | --- |
| `mascote.svg` | Rig base (pose neutra), todas as partes e variações; ~16 KB, sem raster/filtros |
| `mascote-poses.css` | Poses e loops (keyframes) reutilizáveis; exige o SVG **inline** no DOM |
| `demo.html` | Demo standalone (abre via `file://`), com o SVG copiado inline |
| `build-demo.mjs` | `node build-demo.mjs` recopia `mascote.svg` para dentro do `demo.html` após editar o SVG |

## Sistema de coordenadas

- `viewBox="0 0 256 320"`, personagem centrado em `x=128`, pés (sola) em `y=310`. Sombra em `(128, 310)`.
- Para posicionar na página, ancore o elemento pela base: `transform-origin: 50% 96.9%` (310/320).
- Proporção 4:5 → 96 px de altura = 76,8 px de largura.
- Poses extremas (braços abertos, apontar) cabem no viewBox; a lâmpada fica em `y≈9..45`.

## Hierarquia e pivôs

Todos os ids têm prefixo `m-` para não colidir com ids da página (ServiceNow). Pivôs em coordenadas do viewBox, já declarados no `<style>` do SVG (e em `data-pivot`).

```
m-root (traço/contorno padrão)
├─ m-shadow                         (128,310)  <g> com 3 elipses (halo suave + contato)
└─ m-body                           (128,310)  respiração, pulo, balanço
   ├─ m-backpack
   ├─ m-legs
   │  ├─ m-leg-l                    (104,192) quadril
   │  │  ├─ m-thigh-l
   │  │  └─ m-knee-l                (104,236) joelho
   │  │     ├─ m-shin-l, m-boot-l
   │  └─ [espelho] m-leg-r          mesmos números (ver "Espelhamento")
   ├─ m-torso: m-neck, m-shorts, m-chest, m-chest-logo, m-belt, m-belt-buckle, m-coat (m-coat-l/-r, lapelas, bolsos)
   ├─ m-head                        (128,94) pescoço
   │  ├─ m-helmet-band, m-atom-icon, m-headset-l, m-headset-r, m-mic
   │  ├─ m-visor
   │  │  ├─ m-eye-l: .m-eyeball > m-pupil-l (107,57.5) > m-highlight-l
   │  │  │          .m-eyes-closed | .m-eyes-happy | .m-eyes-worried
   │  │  │          m-eyelid-l      (107,43) scaleY 0→1 = piscar
   │  │  └─ m-eye-r (149,57.5), m-eyelid-r (149,43)
   │  └─ m-mouth                    (128,87) variações abaixo
   ├─ m-arms
   │  ├─ m-arm-l                    (82,110) ombro
   │  │  ├─ m-upper-arm-l
   │  │  └─ m-elbow-l               (76,140) cotovelo
   │  │     ├─ m-forearm-l
   │  │     └─ m-hand-l             (72,188) punho → variações de mão
   │  └─ [espelho] m-arm-r          mesmos números
   └─ m-props
      ├─ m-lightbulb-question       (206,40)
      └─ m-speech-anchor            ponto (186,22): data-x / data-y
```

### Espelhamento (lado -r)

`-l` / `-r` = esquerda/direita **da tela**. As partes `-r` estão dentro de um `<g transform="matrix(-1 0 0 1 256 0)">`, então usam **os mesmos pivôs e o mesmo sinal** do lado `-l`: `rotate(+θ)` abre braço/perna para fora nos dois lados. Ex.: `#m-arm-l, #m-arm-r { transform: rotate(135deg) }` = braços abertos simétricos.

## Estados (atributos no `<svg class="mascote">`)

| Atributo | Valores | Padrão |
| --- | --- | --- |
| `data-eyes` | `normal`, `closed`, `happy`, `worried` | `normal` |
| `data-mouth` | `smile`, `happy`, `neutral`, `serious`, `talk-a`, `talk-o` | `smile` |
| `data-hand-l` / `data-hand-r` | `relaxed`, `open-wave`, `pointing`, `thinking` | `relaxed` |
| `data-props` | lista separada por espaço; hoje: `bulb` | vazio |
| `data-pose` (CSS de poses) | `neutral`, `wave`, `think`, `confused`, `jump`, `point` | `neutral` |

Loops por classe: `is-idle` (respiração), `is-blinking`, `is-walking`, `is-talking` (cabeça; a boca é trocada por JS). `is-paused` congela todos os loops sem mudar a pose: ligue quando o mascote sair da tela (`IntersectionObserver`) ou a aba ficar oculta (`visibilitychange`).

## Regras de acabamento (skill `anatomy`)

- **Uma cor de destaque:** o verde-limão (`--mascot-lime`) fica só nos olhos e no logo; os pontos das juntas usam `--mascot-green-light`.
- **Toda linha termina em algo:** os vincos dos dedos são recortados pela silhueta da mão (`m-cfist`, `m-cfist-curl`) e o contorno é redesenhado por cima, então nenhum traço para no meio de uma face.
- **Volume:** `m-shadow` é um halo em três camadas (difuso + contato); no pulo ele encolhe e clareia junto.
- **Detalhe com função:** peça nova só se existir no objeto real (ex.: fivela `m-belt-buckle`). Nada de textura decorativa solta.
- **Revisar com zoom de 4×** (SVG a ~1000 px) antes de aprovar uma alteração, e em 64/96 px para a silhueta.

Presets usados no demo (pose + expressão + mãos):

| Estado da análise | pose | olhos | boca | mãos | props |
| --- | --- | --- | --- | --- | --- |
| entrada / saudação | `wave` | normal | happy | l=open-wave | — |
| analisando | `think` | normal | serious | l=thinking | — |
| dúvida / sem padrão | `confused` | worried | serious | l=thinking | bulb |
| sucesso | `jump` | normal | happy | open-wave nas duas | — |
| chamar atenção p/ campo | `point` | normal | smile | r=pointing | — |

Lip-sync simples: alternar `data-mouth` entre `talk-a`, `talk-o`, `smile`/`neutral` a cada ~120 ms enquanto o texto do balão aparece; ao terminar, volte à boca anterior.

## Como animar

- **CSS (recomendado na extensão):** injete o SVG inline (ex.: `fetch(chrome.runtime.getURL("assets/mascote/mascote.svg"))` → `innerHTML`, ou dentro de um Shadow DOM para isolar do CSS do ServiceNow) e inclua `mascote-poses.css`. Troque atributos/classes; as transições de 0,45 s fazem a interpolação entre poses.
- **WAAPI:** `svg.querySelector("#m-elbow-l").animate([{transform:"rotate(72deg)"},{transform:"rotate(104deg)"}], {duration:750, iterations:Infinity, direction:"alternate"})`. O `transform-origin` já vem do `<style>` do SVG.
- **GSAP:** use `svgOrigin` com os pivôs da tabela (ex.: `gsap.to("#m-arm-l", {rotation:80, svgOrigin:"82 110"})`) — o GSAP escreve no atributo `transform` e ignora o `transform-origin` CSS.
- **Lottie:** importe o SVG no After Effects/Figma (grupos viram camadas; ajuste os anchor points para os pivôs acima) e exporte com Bodymovin/LottieFiles. Gradientes com `var()` precisam ser convertidos para cores fixas antes.
- **Tema:** sobrescreva `--mascot-green`, `--mascot-green-dark`, `--mascot-green-light`, `--mascot-lime`, `--mascot-white`, `--mascot-white-shade`, `--mascot-black`, `--mascot-outline`, `--mascot-visor`, `--mascot-yellow`, `--mascot-tongue` em qualquer ancestral.

## Limitações

- Vista frontal estilizada e mais flat que o render 3D (que é 3/4); não há vista de perfil, então o "andar" é um ciclo frontal (passo alternado + balanço). Não espelhe o SVG com `scaleX(-1)` para mudar de direção: o logo "L&CO" ficaria invertido.
- Partes `-r` vivem em grupo espelhado: o brilho dos gradientes também espelha (luz simétrica, não vem só da esquerda).
- `<img src="mascote.svg">` mostra a pose neutra e aceita só o padrão de cores; poses, expressões, tema e animação exigem SVG inline.
- Vários SVGs inline na mesma página repetem ids; funciona (os gradientes resolvem para o primeiro), mas seletores devem ser escopados pelo `<svg>` (`svg.querySelector`). Para isolamento total, use Shadow DOM.
- O logo "L&CO" é desenhado à mão com traços (sem fonte); a menos de ~80 px vira só uma mancha verde-limão.
- Animar `data-mouth` exige JS; as poses e loops são CSS puro. `prefers-reduced-motion: reduce` desliga todas as animações/transições do rig (as poses continuam aplicadas de forma estática).


## Extensão Lino 0.4
Presets aditivos: `alert`, `sleep`, `present`, `point-l`; olhos `wide`; boca `surprised`; mãos `holding` e `open-up` reutilizam respectivamente a mão fechada e aberta existentes. Props `clipboard` e `zzz`. `data-detail=low` simplifica a marca e engrossa o contorno; `data-view=head` oculta o corpo (o controlador ajusta o viewBox). IDs novos: `m-logo-small`, `m-clipboard`, `m-sleep-mark`. Nenhum ID ou pivô original removido. Salto limitado a dois ciclos. Piscar disparado pelo controlador em intervalo aleatório de 3–6 s. Vista 3/4 e luz assimétrica dos membros espelhados permanecem adiadas: exigem novas vistas aprovadas do personagem.
