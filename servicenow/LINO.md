# Piloto do Lino na instância DEMO

Gere o script de instalação a partir da raiz do RetroGrafos.

```powershell
node servicenow/montar-lino.mjs | Set-Content -Encoding utf8 output/lino-instalador.js
```

Selecione um Update Set dedicado no escopo **Global** da instância DEMO. Execute o conteúdo gerado em **System Definition → Scripts - Background** com uma conta administradora. Uma nova execução atualiza os dois Script Includes e os cinco recursos da API `/api/global/lino`.

O Lino usa a conta autenticada na aba e cria tags privadas pertencentes a essa conta. A classificação exige acesso de leitura e alteração ao incidente e as permissões nativas para criar tags e vínculos. A remoção exige a permissão de exclusão do vínculo. Use **Debug Security Rules** para identificar a ACL responsável quando uma operação for negada.

As propriedades `lino.group_id` e `lino.tag_owner_id` são opcionais. Quando ambas já estão configuradas, membros do grupo usam as tags compartilhadas desse grupo. As demais contas usam suas tags privadas.

Os registros gravados pelo Lino têm IDs determinísticos e metadados em `label.short_description` e `label_entry.comments`. A remoção revalida a identidade do vínculo antes de excluí-lo.

| Recurso | Entrada e saída |
| --- | --- |
| `GET /acesso` | Retorna o usuário autenticado. Aceita `incidente` para também verificar o registro. |
| `POST /classificar` | Recebe `ids`, `regras` e `ignorados`. Retorna o estado por incidente e por tag. |
| `GET /grafo` | Retorna vínculos e um cursor opcional. |
| `GET /impacto` | Recebe `tag` e um cursor opcional. Retorna os IDs removíveis para confirmação. |
| `POST /remover` | Recebe `tag` e os `ids` de vínculos confirmados. Retorna o estado por vínculo. |

As chamadas de escrita exigem `X-Lino-User` com a identidade devolvida por `/acesso`. A extensão usa o cookie da aba e o token de sessão do ServiceNow. As rotas respondem com 401 para sessão inválida e 403 para acesso negado.

## Homologação

1. Abra um incidente fictício com uma conta de teste autenticada e classifique. Confira a coluna **Tags** após atualizar a lista nativa. Classifique de novo e verifique o estado **já presente**.
2. Com outra conta que possa editar o mesmo incidente, confirme que o Lino permite classificar e cria tags próprias. Com uma conta que não possa editar um incidente, confirme que a classificação desse registro é bloqueada.
3. Classifique incidentes de páginas diferentes com uma tag em comum. Adicione manualmente um vínculo de teste e confirme que a remoção do grafo alcança os vínculos gerenciados de todas as páginas e preserva o manual. Confira o resultado na coluna **Tags**.
4. Entre com outra conta no meio de uma sessão, teste a revogação de permissão entre impacto e remoção e repita a operação após uma interrupção. Confirme o bloqueio, os resultados parciais e a ausência de duplicatas.
5. Valide o fluxo com um analista sem privilégios administrativos antes de promover o Update Set. Para interromper o piloto, desative a definição da API.
