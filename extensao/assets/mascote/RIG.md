# Rig do Lino pet

O mascote da página é um boneco chibi em `lino-pet.svg`: cabeça grande, corpo curto, pés na base. O painel abre ao clicar nele e não faz parte do desenho.

`viewBox="0 0 176 220"`. Centro em `x=88`, sola em `y=210`. Proporção 4:5, então a altura configurada (48, 64 ou 88 px) usa 80% disso de largura. Ancore pela base: `transform-origin: 50% 95.5%` (210/220).

| Arquivo | Papel |
| --- | --- |
| `lino-pet.svg` | Rig usado pela extensão. Sem raster, filtro ou `scaleX(-1)`. |
| `mascote-poses.css` | Flutuar, piscar, acenar, pensar e as demais poses. Exige o SVG inline. |
| `mascote.svg` | Rig alto anterior, fora da página. |
| `demo.html` | Demo com o pet copiado inline. |
| `build-demo.mjs` | `node build-demo.mjs` recopia `lino-pet.svg` para o `demo.html`. |

## Pivôs

O lado direito vive em `matrix(-1 0 0 1 176 0)` e usa os mesmos pivôs. `rotate` positivo abre braço e perna para fora.

| Parte | Pivô |
| --- | --- |
| `m-body`, `m-shadow` | 88, 210 |
| `m-head` | 88, 118 |
| `m-arm-l`, `m-arm-r` | 46, 126 |
| `m-elbow-l`, `m-elbow-r` | 42, 148 |
| `m-hand-l`, `m-hand-r` | 40, 170 |
| `m-leg-l`, `m-leg-r` | 70, 164 |
| `m-knee-l`, `m-knee-r` | 70, 184 |
| olhos | 66, 78 e 110, 78 |
| boca | 88, 102 |

## Estados

Atributos no `<svg class="mascote">`: `data-pose`, `data-eyes`, `data-mouth`, `data-hand-l`, `data-hand-r`, `data-props`. Os presets de `baloes.mjs` continuam válidos. `is-idle` flutua, `is-blinking` pisca uma vez, `is-paused` congela. `prefers-reduced-motion: reduce` tira animação e transição.

`data-detail=low` troca o emblema do peito por um retângulo verde. Não há recorte de cabeça: o pet já é o avatar inteiro.

O tamanho vem de `--lino-tamanho` no host, gravado em `lino:tamanho` (`48`, `64` ou `88`) pelas configurações.
