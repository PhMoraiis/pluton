# Salário, etiquetas, ordenação e resumo pago/a pagar — Design

**Data:** 2026-11-19 · **Status:** rascunho para aprovação
**Base:** Pluton PWA em produção (`docs/superpowers/specs/2026-11-18-pluton-pwa-design.md`).

## 1. Intenção e porquê

Depois de usar o app em produção, o usuário quer:

1. **Salário** como ganho recorrente com valor **estimado**, ajustável mês a mês quando o valor real vier diferente, com dia de pagamento escolhido (normalmente o último dia do mês), configurado nas Configurações. Ganhos − Despesas passa a refletir salário + outros ganhos.
2. **Identificar assinaturas** (Spotify etc.) e **enxergá-las nas tabelas**; o usuário também quer **etiquetas livres** (abordagem "C") além do papel especial do salário (abordagem "A").
3. **Ordenar** as tabelas clicando no título da coluna (Nome, Data, Valor, Método), crescente/decrescente.
4. Entender a diferença entre o total de **Despesas** do resumo (ex.: R$ 2.178,96) e a **SOMA** do rodapé (ex.: R$ 2.051,96). Causa: o resumo soma todas as despesas do mês (pagas + pendentes); o rodapé soma só as pendentes visíveis. O usuário quer manter o resumo **mensal, acompanhando o mês do filtro**.

## 2. Objetivos

1. **Salário (papel de série)**
   - Configurações → seção **Salário**: valor estimado, dia de pagamento (1–31 ou **"Último dia do mês"**), mês de início, método de recebimento (opcional).
   - Cria/atualiza **uma** série mensal de **ganho** com papel `SALARY`. Os lançamentos aparecem na tabela de **Ganhos** como os demais.
   - Mudar a estimativa ou o dia nas Configurações atualiza os lançamentos **ainda não recebidos a partir do mês atual**; recebidos e meses passados nunca mudam.
   - Ajuste de um mês: editar o valor na tabela com **"Só esta"** (fluxo já existente). O lançamento fica marcado como **ajustado à mão**, e mudanças posteriores da estimativa **preservam** o valor desse mês. Ele mostra a etiqueta "Salário · ajustado". *(Chamada do Claude; o usuário não respondeu a essa pergunta. Confirmar na aprovação.)*
   - O marcador é desfeito quando o usuário edita o valor desse mesmo lançamento com "Esta e as próximas": ele vira o novo ponto de partida da estimativa.
   - Lançamento de salário não recebido mostra a etiqueta visual **"Salário · estimado"** (ou "Salário · ajustado", se ajustado à mão); ao marcar recebido, **"Salário"**. *(Chamada do Claude.)*
   - "Desativar salário" encerra a série (fluxo de encerramento existente: apaga só os não recebidos após o mês escolhido).
2. **Etiquetas livres**
   - Configurações → seção **Etiquetas**: criar, renomear, mudar cor (paleta de 8 cores existente) e excluir etiquetas. A etiqueta **"Assinatura"** é criada junto com os métodos iniciais (e para o usuário já existente, pela migração). *(Chamada do Claude: assinatura = etiqueta, não um segundo papel; evita dois mecanismos para a mesma coisa.)*
   - Um lançamento pode ter **várias** etiquetas (multi-seleção, como no Notion).
   - Em lançamento de **série**, aplicar/remover etiqueta pergunta **"Só esta" / "Esta e as próximas"**; "Esta e as próximas" grava na série, então os lançamentos gerados depois herdam as etiquetas. Pagos seguem a regra global: nunca alterados por propagação.
   - Nova coluna **Etiquetas** na tabela (desktop) e chips no cartão (mobile) e no **Histórico**; edição inline na tabela (multi-seleção) e no formulário de edição.
   - **Filtro por etiqueta** na barra de filtros (junto do filtro por método), afetando linhas e rodapé.
   - Configurações → **Assinaturas**: lista as séries mensais de despesa com a etiqueta "Assinatura" e o total mensal delas; atalho para marcar/desmarcar qualquer série mensal de despesa como assinatura (aplica "Esta e as próximas" na série).
3. **Ordenação**
   - Clicar no título **Data, Nome, Valor ou Método** ordena a tabela; segundo clique inverte; terceiro volta à ordem padrão (data crescente). Indicador ▲/▼ no título; `aria-sort` correto.
   - Ordena só a lista principal (atrasados mantêm a ordem por data). No mobile, um seletor "Ordenar por" com as mesmas opções. A escolha fica na URL (`?ordem=valor-desc`) para sobreviver à navegação. *(Chamada do Claude.)*
   - Nome ordena por nome exibido com `localeCompare('pt-BR')` (acentos corretos); Método ordena pelo nome do método, "sem método" por último.
4. **Resumo pago / a pagar**
   - O bloco **Despesas** do resumo mensal mostra, abaixo do total, `pago R$ X · a pagar R$ Y`; idem **Ganhos** (`recebido · a receber`). O "a pagar" bate com a SOMA do rodapé quando não há filtros de método/etiqueta/busca nem atrasados de outros meses.
   - Continua mensal e acompanha o mês do filtro (comportamento atual).

### 2.1 Decisões de detalhe (chamadas do Claude, salvo indicação)

- **Salário e edição pela tabela:** a série `SALARY` é editável pelos fluxos normais (Só esta / Esta e as próximas / excluir / encerrar). As Configurações **leem o estado atual da série** (`amountCents`, `dayOfMonth`, método) — então edições "Esta e as próximas" na tabela aparecem nas Configurações automaticamente. Desativar e depois configurar de novo cria uma **série nova**.
- **Salário já lançado à mão:** não existe. O usuário confirmou que não lançou salário nos Ganhos desde o deploy, então não há risco de contar em dobro e não é preciso adotar uma série existente. *(Resposta do usuário.)*
- **Preservar ajustes à mão:** o marcador vale só para séries `SALARY`. Nas outras séries mensais, "Esta e as próximas" continua sobrescrevendo os seguintes não pagos, como hoje. A propagação da estimativa, seja pelas Configurações ou por "Esta e as próximas" no valor de um lançamento de salário, pula os lançamentos ajustados, exceto o próprio lançamento editado.
- **Mês de início:** padrão = mês atual; o mínimo permitido é o mês atual (não gera meses passados, para não encher a seção de atrasados). Um lançamento só é criado a partir do início.
- **Etiquetas em lançamento pago:** permitidas. Etiqueta é classificação, não valor. Com "Só esta", o lançamento clicado muda mesmo se pago. Com "Esta e as próximas", mudam o clicado, a série (herança para os próximos gerados) e os seguintes **não pagos**; os pagos seguintes ficam como estão (regra global de propagação).
- **"Assinatura" é etiqueta de sistema:** identificada por marcação interna (`system = 'SUBSCRIPTION'`), não pelo nome. Pode ser renomeada e trocar de cor, mas **não pode ser excluída**. Criada para contas novas junto dos métodos de pagamento iniciais, e para a conta existente pela migração.
- **Tela Assinaturas:** lista só séries **mensais (`MONTHLY`) de despesa, não encerradas**; o salário (ganho) nunca aparece. Total mensal = soma dos lançamentos dessas séries **no mês atual** (se uma série não tiver lançamento no mês, usa o `amountCents` da série).
- **Resumo:** `expensePaidCents` / `incomePaidCents` = parte paga/recebida do mês. "Ganhos − Despesas" continua usando os totais. O **Período** não muda.
- **Atrasados:** continuam ignorando filtros de método, etiqueta e busca (regra "nada some" do design anterior) e mantêm a ordem por data. O "a pagar" do resumo é o não pago com vencimento no mês exibido.

## 3. Não-objetivos

- Mais de um salário / múltiplos empregadores (um salário só).
- "Último dia **útil**" (feriados, fins de semana) — só "último dia do mês".
- Relatórios/gráficos por etiqueta, orçamento por etiqueta, totais por etiqueta no resumo ou no Período.
- Hierarquia de etiquetas, regras automáticas de etiquetagem por nome.
- Importar etiquetas do Notion.

## 4. Anti-objetivos

- Perder ou alterar lançamentos já pagos/recebidos ao mudar estimativa, dia ou etiquetas.
- Migração que apague ou reescreva dados existentes (só aditiva).
- Tocar no banco de produção fora do deploy (ver §5).

## 5. Restrições

- **Banco de produção só via deploy** (`prisma migrate deploy` na subida do container). Nada de `migrate dev`, `pnpm dev` ou scripts locais apontando para produção. O `.env` local deve apontar para o Postgres de desenvolvimento.
- Migração **aditiva** e compatível com os dados atuais; backup manual no R2 antes do deploy (runbook §3).
- Invariantes do design anterior continuam valendo: centavos inteiros, data pura, mês de referência = vencimento, offline somente leitura, conta única, contrato web↔API validado pelos mocks.

## 6. Abordagens consideradas

| Abordagem | Trade-off | Decisão |
|---|---|---|
| **A. Papel na série mensal** (`SALARY`) | Reaproveita tabela, "Só esta", recebido, histórico e resumo | **Escolhida** para o salário |
| B. Salário como cadastro separado calculado | Duplica lógica de mês/recebido/histórico | Descartada |
| **C. Etiquetas livres** em lançamentos/séries | Flexível; abre caminho para categorias | **Escolhida** (usuário quis A + C); assinatura vira a etiqueta "Assinatura" |

## 7. Modelo de dados (proposta do Claude; builder pode ajustar nomes)

- `Series.role` enum `SeriesRole { NONE, SALARY }` default `NONE`. No máximo **uma** série `SALARY` ativa por usuário (validado no serviço).
- `Entry.amountAdjusted Boolean @default(false)`: marcado quando o valor de um lançamento de série `SALARY` é editado com "Só esta"; respeitado pela propagação da estimativa.
- `Tag { id, userId, name (1–40, único por usuário, case-insensitive), color (#RRGGBB da paleta), sortOrder }`.
- `EntryTag (entryId, tagId)` e `SeriesTag (seriesId, tagId)` — N:N; `onDelete: Cascade` dos dois lados (excluir etiqueta só desvincula).
- Lançamentos gerados por materialização copiam as `SeriesTag` da série.
- `EntryDTO` ganha `tagIds: string[]`, `seriesRole: 'NONE' | 'SALARY' | null` e `amountAdjusted: boolean`.
- "Último dia do mês" = `dayOfMonth = 31` (o clamp existente já leva ao último dia).

## 8. API (proposta)

- `GET/POST/PATCH/DELETE /api/tags` (mesmo padrão de `/api/payment-methods`: 409 nome duplicado).
- `PATCH /api/entries/:id` aceita `tagIds?: string[]` (sujeito a `scope` em série, como os demais campos de série).
- `GET /api/salary` → configuração atual (ou `null`); `PUT /api/salary { amountCents, dayOfMonth (1–31), startMonth, paymentMethodId? }` cria ou atualiza a série `SALARY` (atualização = propagação a partir do primeiro lançamento não recebido ≥ mês atual); `DELETE /api/salary?lastMonth=` encerra.
- `GET /api/entries` aceita `tagId` opcional? — **não**: filtro por etiqueta é client-side, como método/busca. *(Chamada do Claude.)*
- `GET /api/summary` passa a devolver também `expensePaidCents`, `incomePaidCents` (o `realizedCents` continua para o Período).

## 9. Qualidade

- Testes: propagação da estimativa sem tocar recebidos/passados nem meses ajustados à mão; "Esta e as próximas" num mês ajustado limpa o marcador dele; séries não-salário continuam sobrescrevendo como hoje; dia 31 → último dia (fev, abr); herança de etiquetas na materialização; "Só esta"/"Esta e as próximas" para etiquetas; excluir etiqueta desvincula sem apagar lançamentos; ordenação (acentos, valores iguais, método nulo); resumo pago/a pagar; mocks do web validando os novos contratos.
- Migração testada sobre um banco com os dados de fixture atuais (aditiva, sem perda).

## 10. Deixado para o builder

- Nomes exatos de enums/tabelas e endpoints, desde que o comportamento acima se mantenha.
- UI exata do multi-select de etiquetas e do seletor de ordenação no mobile.
- Cor padrão da etiqueta "Assinatura".
