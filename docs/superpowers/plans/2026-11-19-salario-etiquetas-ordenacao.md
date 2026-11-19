# Salário, etiquetas, ordenação e resumo pago/a pagar — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao Pluton o salário recorrente estimado (papel `SALARY` numa série mensal de ganho), etiquetas livres com a etiqueta de sistema "Assinatura", ordenação por coluna e o detalhamento pago / a pagar no resumo mensal.

**Architecture:** Mudanças aditivas no schema Prisma (enum de papel, marcador `amountAdjusted`, tabelas `Tag`/`EntryTag`/`SeriesTag`) com uma migração que também cria a etiqueta "Assinatura" para o usuário existente. A API Hono ganha `/api/tags`, `/api/salary`, `/api/series/monthly` e `/api/series/:id/tags`; `PATCH /api/entries/:id` aceita `tagIds`. O PWA React consome os novos contratos; ordenação e filtro por etiqueta são client-side.

**Tech Stack:** pnpm 11 monorepo; Hono + zod + Prisma 7.10.1 (adapter-pg) + Postgres 17; React 19 + TanStack Query v5 + TanStack Table 8 + Tailwind v4; vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-salario-etiquetas-ordenacao-design.md` (e o design base `docs/superpowers/specs/2026-11-18-pluton-pwa-design.md`). Leia os dois.

## Global Constraints

- **Banco de produção: proibido.** O `.env` da raiz pode apontar para produção e é carregado por `apps/api/prisma.config.ts` e por `pnpm dev`. Variável de ambiente do shell tem precedência sobre o `.env` (verificado), então **todo comando `prisma` fora da suíte de testes começa com** `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pluton`. Nunca rode `pnpm dev`, `prisma migrate dev`, `prisma db push` ou scripts sem esse prefixo. A suíte de testes já força `localhost:5433/pluton_test` (`apps/api/vitest.config.ts`).
- Não leia nem escreva `.env*` (há regra de permissão) e não leia `dados_notion_pluton/` (dados pessoais).
- Postgres local: container `pluton-dev-postgres-1` (`docker compose -f docker-compose.dev.yml up -d`), porta 5433.
- Migração **só aditiva**: nada de `DROP`, `ALTER ... TYPE` ou `UPDATE` em dados existentes. Único `INSERT` permitido: a etiqueta "Assinatura" dos usuários existentes.
- Invariantes do design base continuam: centavos inteiros (`int4`, máx. `2_147_483_647`), datas puras `YYYY-MM-DD` via `fromIsoDate`/`toIsoDate`, mês de referência = vencimento, propagação nunca altera lançamento pago (filtro `paidOn: null` reavaliado na gravação), toda consulta escopada por `userId`, offline somente leitura (`useCanWrite`), mocks do web validam as mesmas regras zod da API.
- Textos de interface em português do Brasil, com acentos.
- Etiqueta: nome 1–40 caracteres (trim), único por usuário **sem diferenciar maiúsculas**; cor `#RRGGBB` (regex `/^#[0-9A-Fa-f]{6}$/`). Etiqueta de sistema: `system = 'SUBSCRIPTION'`, nome inicial `Assinatura`, cor inicial `#D9730D` (Laranja da `PALETTE` do web).
- `tagIds` em qualquer body: array de strings não vazias, sem repetição, no máximo 20 itens.
- "Último dia do mês" = `dayOfMonth = 31` (o clamp de `addMonthsClamped` leva ao último dia).
- Nome da série de salário criada: `Salário`.
- Ordem na URL: parâmetro `ordem` com valores `data-asc | data-desc | nome-asc | nome-desc | valor-asc | valor-desc | metodo-asc | metodo-desc`; ausente ou inválido = ordem padrão (data crescente, depois nome).
- Cada task termina com `pnpm typecheck` e `pnpm test` verdes na raiz e um commit (mensagem em inglês, Conventional Commits, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).

## Review Focus

1. **`?ordem=` inválido ou antigo** (ex.: `?ordem=foo`, `?ordem=valor`): a lista aparece na ordem padrão, sem quebrar; trocar o mês no seletor **não apaga** o `ordem` da URL. Teste na Task 7.
2. **Renomear etiqueta só mudando maiúsculas** ("assinatura" → "Assinatura") na própria etiqueta: aceito (a checagem de duplicado exclui a própria etiqueta); renomear para o nome de **outra** etiqueta com outra caixa: 409. Teste na Task 3.
3. **Filtro por etiqueta com etiqueta excluída**: se a etiqueta filtrada some da lista (excluída em outra aba ou dispositivo), o filtro a ignora e as linhas não desaparecem todas. Teste na Task 8.
4. **Offline**: os formulários de Salário, Etiquetas e Assinaturas e a edição de etiquetas ficam desabilitados sem conexão, como os de métodos. Testes nas Tasks 9, 10, 11 e 12.
5. **Reativar o salário logo depois de desativar**: com uma série de salário encerrada em mês futuro (ainda com lançamentos pendentes até lá), um `PUT /api/salary` com `startMonth` ≤ esse mês contaria em dobro, então devolve `400 overlaps_previous_salary`. Teste na Task 6.

---

### Task 1: Schema, migração e contratos (DTOs)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_salary_tags/migration.sql` (gerada com `--create-only`, depois editada)
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/api/src/services/dto.ts`
- Modify: `apps/api/src/payment-method-defaults.ts`, `apps/api/src/auth.ts`
- Modify: `apps/api/package.json` (devDependency `pg` `8.23.1`, mesma versão já resolvida pelo adapter, e `@types/pg`)
- Create: `apps/api/test/migration.test.ts`
- Modify: test factories que montam `EntryDTO` em `apps/web/src/test/*.test.tsx` e asserções de API com `toEqual` exato, se quebrarem.

**Interfaces:**
- Produces (Prisma):
  - `enum SeriesRole { NONE SALARY }`; `Series.role SeriesRole @default(NONE)`.
  - `enum TagSystem { SUBSCRIPTION }`.
  - `Entry.amountAdjusted Boolean @default(false)`.
  - `model Tag { id String @id @default(cuid()); userId String; name String; color String; sortOrder Int; system TagSystem?; user (Cascade); entries EntryTag[]; series SeriesTag[]; @@unique([userId, name]); @@unique([userId, system]) }`.
  - `model EntryTag { entryId; tagId; entry (Cascade); tag (Cascade); @@id([entryId, tagId]); @@index([tagId]) }` e `model SeriesTag { seriesId; tagId; series (Cascade); tag (Cascade); @@id([seriesId, tagId]); @@index([tagId]) }`.
  - Back-relations `User.tags`, `Entry.tags`, `Series.tags`.
- Produces (`@pluton/shared`):
  - `type SeriesRole = 'NONE' | 'SALARY'`.
  - `EntryDTO` ganha `tagIds: string[]`, `seriesRole: SeriesRole | null`, `amountAdjusted: boolean`.
  - `interface TagDTO { id: string; name: string; color: string; sortOrder: number; system: 'SUBSCRIPTION' | null }`.
  - `interface SalaryDTO { seriesId: string; amountCents: number; dayOfMonth: number; paymentMethodId: string | null; startMonth: MonthKey }`.
  - `interface MonthlySeriesDTO { id: string; name: string; kind: EntryKind; amountCents: number; currentMonthCents: number; paymentMethodId: string | null; tagIds: string[] }`.
- Produces (API):
  - `entryInclude` passa a incluir `series.role` e as etiquetas.
  - `toEntryDTO` preenche `tagIds`, ordenados por `Tag.sortOrder` e depois por nome; `seriesRole` = `series?.role ?? null`.
  - `SUBSCRIPTION_TAG = { name: 'Assinatura', color: '#D9730D', system: 'SUBSCRIPTION' } as const` em `payment-method-defaults.ts`.
  - O hook `user.create.after` cria a etiqueta com `sortOrder: 0`.

- [ ] **Step 1: Write the failing migration test** `apps/api/test/migration.test.ts`
  - Usa `pg` direto numa base própria `pluton_migration_test`, no mesmo servidor de `DATABASE_URL`: `DROP DATABASE IF EXISTS` e `CREATE DATABASE` conectando na base `postgres`.
  - Aplica o SQL da migração `*_init` lendo o arquivo.
  - Insere a fixture: 1 `user`; 1 `PaymentMethod`; 1 `Series` MONTHLY com 2 `Entry` (uma paga, `amountCents` 1990 e 2490); 1 `Entry` avulsa de 12700.
  - Aplica o SQL da nova migração e verifica:
    - `SELECT name, color, system, "sortOrder" FROM "Tag"` → exatamente `[{ name: 'Assinatura', color: '#D9730D', system: 'SUBSCRIPTION', sortOrder: 0 }]` para o usuário;
    - as 3 entradas continuam com os mesmos `amountCents`, `dueDate`, `paidOn` e `amountAdjusted = false`;
    - `Series.role = 'NONE'`;
    - `EntryTag` e `SeriesTag` vazias.
  - Encerra dropando a base.

- [ ] **Step 2: Run it and verify it fails**
  - Run: `pnpm --filter @pluton/api test -- migration`
  - Expected: FAIL (a pasta da nova migração não existe).

- [ ] **Step 3: Edit `schema.prisma` and generate the migration**
  - Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pluton pnpm --filter @pluton/api exec prisma migrate dev --name salary_tags --create-only`
  - Acrescente ao fim do SQL gerado:

  ```sql
  -- Etiqueta de sistema "Assinatura" para contas já existentes (contas novas: hook do Better Auth).
  INSERT INTO "Tag" ("id", "userId", "name", "color", "sortOrder", "system")
  SELECT gen_random_uuid()::text, u."id", 'Assinatura', '#D9730D', 0, 'SUBSCRIPTION'
  FROM "user" u
  WHERE NOT EXISTS (SELECT 1 FROM "Tag" t WHERE t."userId" = u."id" AND t."system" = 'SUBSCRIPTION');
  ```

  - Confira que o SQL só tem `CREATE TYPE`, `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN ... DEFAULT`, `CREATE INDEX`, `ADD CONSTRAINT` e esse `INSERT`.
  - Depois: `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pluton pnpm --filter @pluton/api exec prisma migrate deploy`.

- [ ] **Step 4: Update shared types, `dto.ts`, defaults and the auth hook**
  - Implemente conforme as Interfaces. No teste existente de `auth.test.ts`, acrescente: depois do cadastro, `GET`/consulta Prisma mostra 1 `Tag` com `system: 'SUBSCRIPTION'`.
  - Nas factories `entry()` dos testes do web, acrescente os defaults `tagIds: [], seriesRole: null, amountAdjusted: false`.

- [ ] **Step 5: Verify**
  - Run: `pnpm typecheck && pnpm test`
  - Expected: tudo PASS, incluindo `migration.test.ts` e `auth.test.ts`.

- [ ] **Step 6: Commit** — `feat(db): series role, amountAdjusted marker and tags schema with Assinatura system tag`

---

### Task 2: Resumo pago / a pagar

**Files:**
- Modify: `packages/shared/src/types.ts`, `packages/shared/src/summary.ts`
- Test: `packages/shared/test/summary.test.ts`, `apps/api/test/summary.test.ts`, `apps/web/src/test/entries-read.test.tsx`
- Modify: `apps/web/src/components/SummaryBar.tsx`
- Modify: mocks de `/api/summary` em `apps/web/src/test/*.tsx`

**Interfaces:**
- Produces: `Summary` ganha `expensePaidCents: number` e `incomePaidCents: number`; `summarize()` os preenche. `/api/summary` devolve-os sem mudar a rota.

- [ ] **Step 1: Failing tests**
  - Shared: `summarize([{EXPENSE,1000,paid}, {EXPENSE,500,null}, {INCOME,3000,paid}, {INCOME,700,null}])` → `{ expenseCents: 1500, expensePaidCents: 1000, incomeCents: 3700, incomePaidCents: 3000, balanceCents: 2200, realizedCents: 2000 }`.
  - API: no teste de summary existente, o mês com uma despesa paga e uma pendente devolve `expensePaidCents` igual à paga.
  - Web: com o mock do summary `{ expenseCents: 217896, expensePaidCents: 12700, incomeCents: 500000, incomePaidCents: 0, ... }`, o resumo mostra `pago R$ 127,00 · a pagar R$ 2.051,96` sob Despesas e `recebido R$ 0,00 · a receber R$ 5.000,00` sob Ganhos. Use `formatBRL`, que já emite U+00A0.
- [ ] **Step 2: Run them and verify they fail** — `pnpm test` (FAIL nas três asserções novas).
- [ ] **Step 3: Implement**
  - `summarize` e o `SummaryBar`. A linha secundária é `text-xs text-muted`, só nos blocos Despesas e Ganhos. "Ganhos − Despesas" fica igual.
- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm test` PASS.
- [ ] **Step 5: Commit** — `feat: show paid and pending split in the monthly summary`

---

### Task 3: API de etiquetas (`/api/tags`)

**Files:**
- Create: `apps/api/src/routes/tags.ts`
- Modify: `apps/api/src/app.ts` (`api.route('/tags', tagRoutes)`)
- Test: `apps/api/test/tags.test.ts`

**Interfaces:**
- Consumes: `TagDTO` (Task 1).
- Produces (mesmo padrão de `routes/payment-methods.ts`):
  - `GET /api/tags` → `TagDTO[]`, ordenado por `sortOrder` e depois `name`.
  - `POST /api/tags {name, color}` → 201 `TagDTO`, com `sortOrder = max + 1` e `system: null`.
  - `PATCH /api/tags/:id {name, color}` → `TagDTO`.
  - `DELETE /api/tags/:id` → 204.
  - Erros:
    - `400 invalid_body`;
    - `404 not_found` (inclui etiqueta de outro usuário);
    - `409 duplicate_name`: checagem `findFirst({ where: { userId, name: { equals, mode: 'insensitive' }, NOT: { id } } })` e também P2002;
    - `409 system_tag` ao excluir a etiqueta de sistema.

- [ ] **Step 1: Failing tests** em `tags.test.ts`:
  - `GET` logo após o cadastro → `[{ name: 'Assinatura', system: 'SUBSCRIPTION', ... }]`.
  - `POST {name:'  Streaming ', color:'#0B6E99'}` → 201 com `name: 'Streaming'`. `POST {name:'streaming'}` → 409 `duplicate_name`.
  - `POST` com nome de 41 caracteres → 400; com cor `'blue'` → 400.
  - `PATCH` da "Assinatura" para `{name:'assinatura', color:'#E03E3E'}` → 200, com `system` preservado.
  - `PATCH` de "Streaming" para `'ASSINATURA'` → 409.
  - `DELETE` da etiqueta de sistema → 409 `system_tag`. `DELETE` de "Streaming" → 204 e a etiqueta some dos `tagIds` de lançamentos. Para preparar esse caso, crie a ligação via Prisma direto no teste, porque a Task 4 ainda não existe.
  - Sem cookie → 401. `PATCH`/`DELETE` com id de outro usuário (crie a etiqueta via Prisma com outro `userId`) → 404.
- [ ] **Step 2: Run and verify they fail** — `pnpm --filter @pluton/api test -- tags` (FAIL: 404 na rota).
- [ ] **Step 3: Implement `tagRoutes`.**
- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm test` PASS.
- [ ] **Step 5: Commit** — `feat(api): tags CRUD with protected Assinatura system tag`

---

### Task 4: Etiquetas nos lançamentos (edição e herança)

**Files:**
- Modify: `apps/api/src/routes/entries.ts` (`updateSchema.tagIds`), `apps/api/src/services/entries.ts` (`UpdateEntryInput.tagIds`, `updateEntry`, `changeTotalInstallments`), `apps/api/src/services/materialize.ts`
- Create: `apps/api/src/services/tags.ts`
- Test: `apps/api/test/entries-tags.test.ts`

**Interfaces:**
- Consumes: `EntryInputError`, `lockSeries` e o fluxo de `updateEntry` existentes.
- Produces:
  - `tagIdsSchema = z.array(z.string().min(1)).max(20).refine(unique)`, exportado de `routes/entries.ts` para as Tasks 5 e 6.
  - `lockSeries(tx, seriesId)` passa a ser **exportado** de `services/entries.ts` (usado nas Tasks 5 e 6).
  - Em `services/tags.ts`:
    - `assertTagsOwned(tx, userId, tagIds): Promise<void>`: lança `EntryInputError('invalid_tag')`;
    - `setEntryTags(tx, entryIds: string[], tagIds: string[], opts?: { onlyUnpaid?: boolean }): Promise<void>`: substitui as ligações; com `onlyUnpaid`, só mexe em entradas com `paidOn: null`, reavaliado na gravação;
    - `copySeriesTags(tx, seriesId, entryIds): Promise<void>`.
- Regras:
  - `tagIds` conta como mudança só se o conjunto difere do atual.
  - Em entrada de série, a mudança exige `scope`, como os outros campos.
  - `this`: substitui as etiquetas só da entrada, mesmo paga.
  - `following`: grava `SeriesTag` da série, a entrada editada (mesmo paga) e as seguintes **não pagas**.
  - Entrada avulsa: aplica direto.
- Materialização: troque `createMany` por `createManyAndReturn({ skipDuplicates: true, select: { id: true } })` e chame `copySeriesTags` com os ids criados. O mesmo vale para as parcelas criadas em `changeTotalInstallments`.

- [ ] **Step 1: Failing tests** em `entries-tags.test.ts`:
  - Avulsa: `PATCH {tagIds:[t1]}` → resposta com `tagIds: [t1]`. `PATCH {tagIds:[]}` → `[]`.
  - `PATCH` com `tagIds: [t1, t1]` → 400 `invalid_body`; 21 ids → 400; id de etiqueta de outro usuário → 400 `invalid_tag`.
  - Série mensal sem `scope` → 400 `scope_required`.
  - `scope:'this'` na 2ª entrada → só ela muda.
  - `scope:'following'` na 2ª entrada, com a 3ª paga:
    - 2ª e 4ª em diante recebem a etiqueta, 3ª não;
    - depois de avançar o horizonte (consultando um mês 14 meses à frente), as entradas novas também têm a etiqueta.
  - Etiqueta em entrada **paga** com `scope:'this'` → aplicada.
  - Parcelada `Fone 1/3` com etiqueta via `following` e total mudado para 5 (`name: 'Fone 1/5'`, `scope:'following'`) → as parcelas 4 e 5 herdam a etiqueta.
  - Mudar só `tagIds` para o mesmo conjunto numa entrada de série, sem `scope` → 200, porque não é mudança.
- [ ] **Step 2: Run and verify they fail** — `pnpm --filter @pluton/api test -- entries-tags`.
- [ ] **Step 3: Implement** conforme as Interfaces.
- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm test` PASS. Os testes antigos de edição e materialização continuam verdes.
- [ ] **Step 5: Commit** — `feat(api): tag entries with this/following scope and inherit series tags`

---

### Task 5: Séries mensais para a tela de Assinaturas

**Files:**
- Modify: `apps/api/src/routes/series.ts`
- Create: `apps/api/src/services/series.ts`
- Test: `apps/api/test/series-monthly.test.ts`

**Interfaces:**
- Consumes: `tagIdsSchema`, `assertTagsOwned`, `setEntryTags` (Task 4); `MonthlySeriesDTO` (Task 1).
- Produces:
  - `GET /api/series/monthly?kind=EXPENSE|INCOME` → `MonthlySeriesDTO[]`.
    - Inclui as séries `MONTHLY` do usuário naquele `kind` com `endedOn = null`, ordenadas por `baseName` (pt-BR).
    - Antes, roda `ensureMaterialized(userId, mês atual)`.
    - `currentMonthCents` = soma dos `amountCents` das entradas da série com vencimento no mês atual (pagas ou não); se não houver nenhuma, usa `series.amountCents`.
    - `tagIds` vem de `SeriesTag`.
  - `PUT /api/series/:id/tags {tagIds}` → `MonthlySeriesDTO`.
    - Substitui `SeriesTag` e as etiquetas das entradas da série **não pagas com vencimento ≥ 1º dia do mês atual**, sob `lockSeries`.
    - Erros: 404 se não existe ou é de outro usuário; `400 not_monthly` se parcelada; `400 invalid_tag`; `400 invalid_body`.

- [ ] **Step 1: Failing tests** em `series-monthly.test.ts`:
  - Com uma despesa mensal "Spotify" (2190, começando no mês atual), uma mensal encerrada, uma parcelada e um ganho mensal, `GET ?kind=EXPENSE` lista só "Spotify", com `currentMonthCents: 2190` e `tagIds: []`.
  - Edite o valor do mês atual para 2390 com `scope:'this'` → `currentMonthCents: 2390`.
  - `PUT /api/series/:id/tags {tagIds:[assinaturaId]}` → `tagIds` com a assinatura; a entrada do mês atual e as futuras têm a etiqueta; uma entrada **paga** do mês atual não muda.
  - `PUT` numa parcelada → 400 `not_monthly`; numa série de outro usuário → 404; sem cookie → 401.
- [ ] **Step 2: Run and verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm test` PASS.
- [ ] **Step 5: Commit** — `feat(api): list active monthly series and set series tags`

---

### Task 6: API do salário e o marcador de ajuste

**Files:**
- Create: `apps/api/src/services/salary.ts`, `apps/api/src/routes/salary.ts`
- Modify: `apps/api/src/app.ts` (`api.route('/salary', salaryRoutes)`), `apps/api/src/services/entries.ts` (`updateEntry`)
- Test: `apps/api/test/salary.test.ts`

**Interfaces:**
- Consumes: `materializeSeries`, `horizonMonth`, `endSeries` e `lockSeries` (exportado na Task 4); `addMonthsClamped`; `SalaryDTO`; `inputMonthKeySchema`; `amountSchema` (exportar de `routes/entries.ts` se ainda não for).
- Produces:
  - `GET /api/salary` → `SalaryDTO | null`. Salário ativo = série `role: SALARY` com `endedOn = null`. `startMonth` = mês da entrada de menor `sequence`; sem entradas, o mês de `generatedThrough`.
  - `PUT /api/salary { amountCents, dayOfMonth: int 1–31, startMonth: MonthKey, paymentMethodId: string | null }` → `SalaryDTO`. Tudo numa transação com `pg_advisory_xact_lock(hashtext('salary:' || userId))`.
    - **Sem salário ativo, cria a série:**
      - `startMonth` < mês atual → `400 start_month_in_past`;
      - existe série `SALARY` encerrada com `endedOn` ≥ 1º dia de `startMonth` → `400 overlaps_previous_salary`;
      - cria a série com `kind INCOME`, `type MONTHLY`, `role SALARY`, `baseName 'Salário'`; a primeira entrada vence em `addMonthsClamped(startMonth + '-01', 0, dayOfMonth)` e tem `sequence 1`;
      - materializa até `horizonMonth`.
    - **Com salário ativo, atualiza a série:**
      - `startMonth` é ignorado;
      - grava `amountCents`, `dayOfMonth`, `paymentMethodId` e `generatedThrough = addMonthsClamped(generatedThrough, 0, dayOfMonth)` na série;
      - nas entradas da série com `paidOn: null` e vencimento ≥ 1º dia do mês atual: `dueDate = addMonthsClamped(<1º dia do mês da entrada>, 0, dayOfMonth)` e `paymentMethodId`;
      - `amountCents` muda só onde `amountAdjusted = false`;
      - `paidOn: null` é reavaliado na gravação.
    - `invalid_payment_method` → 400.
  - `DELETE /api/salary?lastMonth=YYYY-MM` → 204, via `endSeries` na série ativa; 404 sem salário ativo.
  - `updateEntry` em entrada de série `SALARY`, quando o valor muda:
    - com `this`, a entrada recebe `amountAdjusted: true`;
    - com `following`, a entrada editada recebe `amountAdjusted: false`, e as seguintes com `amountAdjusted: true` **mantêm o valor** (a data continua propagando).
    - Séries `NONE` não mudam de comportamento.

- [ ] **Step 1: Failing tests** em `salary.test.ts`. Congele "hoje" com `vi.setSystemTime` em `2026-11-19` (São Paulo).
  - **Configuração inicial:**
    - `GET` → `null`;
    - `PUT {amountCents:500000, dayOfMonth:31, startMonth:'2026-11', paymentMethodId:null}` → `SalaryDTO` com `startMonth: '2026-11'`;
    - `GET /api/entries?kind=INCOME&from=2026-11&to=2027-02` → vencimentos `2026-11-30`, `2026-12-31`, `2027-01-31`, `2027-02-28`, todos com `seriesRole: 'SALARY'`, `displayName: 'Salário'` e `amountAdjusted: false`.
  - **Mudança de estimativa:**
    - marque novembro como recebido;
    - ajuste janeiro para 530000 com `scope:'this'` → `amountAdjusted: true`;
    - `PUT {amountCents:520000, dayOfMonth:5, ...}` →
      - novembro intocado (500000, dia 30, recebido);
      - dezembro 520000 em `2026-12-05`;
      - janeiro **530000** em `2027-01-05`;
      - fevereiro 520000 em `2027-02-05`;
    - `GET` → `dayOfMonth: 5`.
  - **"Esta e as próximas" na tabela:** `PATCH` de dezembro com `{amountCents: 510000, scope:'following'}` → dezembro 510000 (`amountAdjusted: false`), janeiro continua 530000, fevereiro 510000.
  - **Validações:** `PUT` com `startMonth:'2026-10'` e sem salário ativo → 400 `start_month_in_past`; `dayOfMonth: 0` ou `32` → 400.
  - **Desativar:** `DELETE ?lastMonth=2026-12` → 204; `GET` → `null`; entradas de 2027 não recebidas apagadas.
  - **Reativação:**
    - `PUT` com `startMonth:'2026-12'` → 400 `overlaps_previous_salary`;
    - `PUT` com `startMonth:'2027-01'` → 200, com uma série nova.
  - **Conta única:** `PUT` com salário ativo não cria uma segunda série; a contagem de séries `SALARY` com `endedOn: null` continua 1.
  - **Sem cookie:** 401.
  - **Série comum:** numa série mensal comum, `scope:'this'` no valor **não** marca `amountAdjusted`.
- [ ] **Step 2: Run and verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm test` PASS.
- [ ] **Step 5: Commit** — `feat(api): recurring estimated salary with preserved manual adjustments`

---

### Task 7: Ordenação por coluna (web)

**Files:**
- Create: `apps/web/src/lib/sortEntries.ts`
- Modify: `apps/web/src/components/EntriesTable.tsx`, `apps/web/src/pages/EntriesPage.tsx`
- Test: `apps/web/src/test/sort.test.ts` (unidade), `apps/web/src/test/entries-read.test.tsx` (integração)

**Interfaces:**
- Produces:
  - `type SortKey = 'data' | 'nome' | 'valor' | 'metodo'`;
  - `type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null`;
  - `parseSort(param: string | null): SortState`;
  - `formatSort(s: SortState): string | null`;
  - `nextSort(current: SortState, key: SortKey): SortState`: ciclo asc → desc → `null`; outra coluna começa em asc;
  - `sortEntries(rows: EntryDTO[], sort: SortState, methods: Map<string, PaymentMethodDTO>): EntryDTO[]`.
- Regras de `sortEntries`:
  - `null` → ordem recebida da API.
  - `data`: `dueDate`, depois nome.
  - `nome`: `displayName.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })`.
  - `valor`: `amountCents`.
  - `metodo`: nome do método por `localeCompare` pt-BR; sem método (ou id desconhecido) **sempre por último**, nos dois sentidos.
  - Empates: `dueDate`, depois `displayName`, depois `id`.
- `EntriesTable` recebe as props opcionais `sort?: SortState` e `onSort?: (key: SortKey) => void`. Sem `onSort` (lista de atrasados), os cabeçalhos ficam texto simples.
  - Com `onSort`, os títulos Data, Nome, Valor e Método viram `<button>`, com `aria-sort="ascending" | "descending" | "none"` no `<th>` e ▲/▼ visíveis.
- `EntriesPage`:
  - lê `ordem` com `parseSort`;
  - aplica `sortEntries` em `rows`, depois dos filtros;
  - no mobile, mostra `<select aria-label="Ordenar por">` com opções "Padrão" e as 8 combinações (ex.: "Valor (maior primeiro)");
  - `selectMonth` passa a preservar os outros parâmetros (`setParams(p => { p.set('mes', next); return p; }, { replace: true })`).

- [ ] **Step 1: Failing tests**
  - Unidade:
    - `nome-asc` em `['Água', 'agua 2', 'Zelda', 'Ágape']` → `['Ágape', 'Água', 'agua 2', 'Zelda']`, com empates estáveis;
    - `metodo-desc` mantém o sem-método por último;
    - `valor-asc` com valores iguais desempata por data;
    - `parseSort('foo')`, `parseSort('valor')` e `parseSort(null)` → `null`;
    - `nextSort` cicla `null → nome-asc → nome-desc → null` e `nome-desc → valor-asc`.
  - Integração (desktop):
    - clicar em "Valor" ordena crescente e põe `aria-sort="ascending"`;
    - clicar de novo deixa decrescente;
    - a URL ganha `ordem=valor-desc`;
    - com rota inicial `?mes=2026-12&ordem=foo`, a lista sai na ordem padrão;
    - trocar o mês mantém `ordem`;
    - os atrasados continuam por data.
  - Integração (mobile): escolher "Valor (maior primeiro)" no seletor reordena os cartões.
- [ ] **Step 2: Run and verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm test` PASS.
- [ ] **Step 5: Commit** — `feat(web): sort entries by clicking column headers`

---

### Task 8: Etiquetas na tela: chips, coluna e filtro

**Files:**
- Create: `apps/web/src/components/TagChips.tsx`
- Modify: `apps/web/src/lib/queryKeys.ts` (`tags: () => ['tags']`, `salary: () => ['salary']`, `monthlySeries: (kind) => ['monthly-series', kind]`), `apps/web/src/lib/entryMutations.ts` (`invalidateEntryQueries` passa a invalidar também `['monthly-series']` e `['salary']`), `apps/web/src/components/EntryActions.tsx` (o contexto ganha `tags: Map<string, TagDTO>`), `apps/web/src/components/EntriesTable.tsx` (coluna **Etiquetas** entre Método e Pago, só leitura nesta task), `apps/web/src/components/EntryCards.tsx`, `apps/web/src/pages/HistoryPage.tsx`, `apps/web/src/pages/EntriesPage.tsx`
- Test: `apps/web/src/test/entries-read.test.tsx`, `apps/web/src/test/history-period.test.tsx`; mocks de `/api/tags` em todos os testes que renderizam essas telas.

**Interfaces:**
- Consumes: `TagDTO`, `EntryDTO.tagIds`.
- Produces:
  - `TagChips({ tagIds, tags }: { tagIds: string[]; tags: Map<string, TagDTO> })`: mostra as etiquetas conhecidas na ordem `sortOrder`/nome, com o mesmo estilo de `MethodTag` (`${color}33` no fundo e `color` no texto); ignora ids desconhecidos; sem etiquetas, mostra `—` na tabela e nada no cartão.
  - O filtro de etiquetas no `EntriesPage` é um `role="group" aria-label="Etiqueta"` com botões `aria-pressed`, no mesmo padrão dos métodos.
  - Uma linha passa no filtro se tiver **alguma** etiqueta selecionada.
  - Ids selecionados que não existem mais em `tags` são ignorados: o filtro efetivo é a interseção com as etiquetas carregadas, e se ela ficar vazia, nada é filtrado.
  - O filtro afeta linhas e rodapé; os atrasados o ignoram.

- [ ] **Step 1: Failing tests**
  - Uma entrada com `tagIds:['t-sub']` mostra o chip "Assinatura" na tabela (desktop), no cartão (mobile) e no Histórico.
  - Ao clicar em "Assinatura" no filtro de etiqueta, só as linhas com a etiqueta ficam e o rodapé soma só elas.
  - Etiqueta excluída: depois de filtrar por "Streaming", troque o mock de `/api/tags` para não ter "Streaming" e refaça a consulta. Todas as linhas voltam.
  - Os atrasados aparecem mesmo com o filtro ativo.
- [ ] **Step 2: Run and verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm test` PASS.
- [ ] **Step 5: Commit** — `feat(web): show tag chips and filter entries by tag`

---

### Task 9: Edição de etiquetas (tabela e formulário)

**Files:**
- Create: `apps/web/src/components/TagPicker.tsx`
- Modify: `apps/web/src/components/EntriesTable.tsx` (`TagCell` editável), `apps/web/src/components/EntrySheet.tsx`, `apps/web/src/lib/entryDraft.ts` (`EntryDraft.tagIds`, `draftFromEntry`, `draftToPatch`), `apps/web/src/lib/entryMutations.ts` (`EntryPatch.tagIds?: string[]`)
- Test: `apps/web/src/test/entries-write.test.tsx`; o mock de `PATCH` valida `tagIds` (array, sem repetição, até 20 itens) e devolve 400 `invalid_body` se a regra for violada.

**Interfaces:**
- Consumes: o contexto `tags` (Task 8) e `edit(entry, patch)`.
- Produces:
  - `TagPicker({ value: string[]; tags: TagDTO[]; onChange(next: string[]): void; disabled: boolean; label: string })`: lista de checkboxes, uma por etiqueta, ordenada.
  - `TagCell` abre o picker num popover pelo botão `aria-label="Etiquetas: <nome do lançamento>"`. Ao fechar (Esc, clique fora ou "Aplicar"), chama `edit(entry, { tagIds })` só se o conjunto mudou.
  - Em série, o `ScopeDialog` existente pergunta Só esta / Esta e as próximas.
  - `draftToPatch` inclui `tagIds` só quando o conjunto difere de `entry.tagIds`.

- [ ] **Step 1: Failing tests**
  - Desktop, avulsa: abra as etiquetas, marque "Assinatura" e aplique → `PATCH /api/entries/e1` com `{ tagIds: ['t-sub'] }`, sem `scope`.
  - Série: mesma ação abre "Aplicar alteração"; escolher "Esta e as próximas" envia `{ scope: 'following', tagIds: [...] }`.
  - Aplicar sem mudar nada → nenhuma chamada.
  - Mobile: no formulário de edição, marcar "Assinatura" e salvar envia `tagIds`; salvar sem mexer nas etiquetas não envia `tagIds`.
  - Offline: o botão de etiquetas fica desabilitado.
- [ ] **Step 2: Run and verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm test` PASS.
- [ ] **Step 5: Commit** — `feat(web): edit entry tags inline and in the entry form`

---

### Task 10: Configurações → Etiquetas (e divisão do `SettingsPage`)

**Files:**
- Create: `apps/web/src/components/settings/ColorPicker.tsx`, `apps/web/src/components/settings/NameColorForm.tsx`, `apps/web/src/components/settings/MethodsSection.tsx`, `apps/web/src/components/settings/TagsSection.tsx`
- Modify: `apps/web/src/pages/SettingsPage.tsx` (vira composição das seções + "Sair")
- Test: `apps/web/src/test/import-settings.test.tsx` (ou um novo `settings-tags.test.tsx`); o mock de `/api/tags` aplica as regras da Task 3 (nome 1–40 após trim, duplicado sem diferenciar maiúsculas → 409, `DELETE` da etiqueta de sistema → 409).

**Interfaces:**
- Produces:
  - `NameColorForm`: o atual `MethodForm`, com as props `nameLabel` e `maxLength`, para métodos (60) e etiquetas (40).
  - A seção "Etiquetas" faz listar, criar, editar e excluir.
  - A etiqueta de sistema mostra a legenda "Usada na tela Assinaturas" e **não tem** botão Excluir.
  - Excluir pede confirmação: "Os lançamentos com esta etiqueta ficarão sem ela."
  - Mutações invalidam `['tags']` e `['entries']`.
  - Mensagens de erro via `friendlyError`: acrescente em `lib/errors.ts` as mensagens de `duplicate_name` para etiqueta (se o texto atual falar em método, torne-o genérico) e `system_tag` → "A etiqueta Assinatura não pode ser excluída."

- [ ] **Step 1: Failing tests**
  - Criar a etiqueta "Streaming" → `POST /api/tags` e a etiqueta aparece na lista.
  - Criar "assinatura" → mensagem de nome duplicado.
  - "Assinatura" não tem botão Excluir; "Streaming" tem, e confirmar envia `DELETE`.
  - Renomear "Assinatura" → `PATCH`.
  - Offline: botões e campos da seção desabilitados.
  - Os testes atuais da seção de métodos continuam passando sem mudança de comportamento.
- [ ] **Step 2: Run and verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm test` PASS.
- [ ] **Step 5: Commit** — `feat(web): manage tags in settings`

---

### Task 11: Configurações → Salário e etiqueta visual do salário

**Files:**
- Create: `apps/web/src/components/settings/SalarySection.tsx`, `apps/web/src/components/SalaryBadge.tsx`
- Modify: `apps/web/src/pages/SettingsPage.tsx` (seção Salário no topo), `EntriesTable.tsx` (`NameCell`), `EntryCards.tsx`, `HistoryPage.tsx`, `apps/web/src/lib/errors.ts`
- Test: `apps/web/src/test/settings-salary.test.tsx`, `apps/web/src/test/entries-read.test.tsx`; o mock de `/api/salary` aplica as regras da Task 6 (`dayOfMonth` 1–31, `startMonth` ≥ mês atual na criação, `amountCents` positivo inteiro).

**Interfaces:**
- Consumes: `SalaryDTO`, `queryKeys.salary()`, `maskAmount`/`parseAmount`/`centsToInput` de `entryDraft.ts`.
- Produces:
  - `SalaryBadge({ entry })`:
    - não renderiza nada se `entry.seriesRole !== 'SALARY'`;
    - senão mostra `Salário` (se `paidOn`), `Salário · ajustado` (se `amountAdjusted`) ou `Salário · estimado`.
  - O formulário da `SalarySection` tem:
    - "Valor estimado" (mesma máscara de valor);
    - "Dia do pagamento": `<select>` com 1–30 e "Último dia do mês" (31, o padrão);
    - "Mês de início": `<input type="month">`, padrão o mês atual, `min` o mês atual, **desabilitado** quando já existe salário;
    - "Método de recebimento" ("Sem método" + métodos).
  - "Salvar salário" envia `PUT`; o status "Salário salvo." aparece com `role="status"`.
  - Com salário ativo, aparece "Desativar salário", que abre um modal com "Último mês com salário" (padrão o mês atual) e envia `DELETE /api/salary?lastMonth=…`.
  - Mutações chamam `invalidateEntryQueries`, que já cobre `['salary']`.
  - Erros novos em `errors.ts`:
    - `start_month_in_past` → "O mês de início não pode estar no passado.";
    - `overlaps_previous_salary` → "Já existe salário até esse mês. Escolha um mês de início posterior."

- [ ] **Step 1: Failing tests**
  - Sem salário: preencher `5.000,00`, manter "Último dia do mês" e salvar → `PUT /api/salary` com `{ amountCents: 500000, dayOfMonth: 31, startMonth: <mês atual>, paymentMethodId: null }`.
  - Com salário (mock devolve `SalaryDTO`): os campos vêm preenchidos e o mês de início fica desabilitado; mudar o valor e salvar envia `PUT`.
  - "Desativar salário" → confirmar envia `DELETE /api/salary?lastMonth=<mês atual>`.
  - Erro `overlaps_previous_salary` → mensagem amigável.
  - Offline: tudo desabilitado.
  - Tabela de Ganhos: uma entrada `seriesRole:'SALARY'` não paga mostra "Salário · estimado"; com `amountAdjusted: true`, "Salário · ajustado". No Histórico (paga), mostra "Salário".
- [ ] **Step 2: Run and verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm test` PASS.
- [ ] **Step 5: Commit** — `feat(web): configure recurring salary in settings and badge salary entries`

---

### Task 12: Configurações → Assinaturas

**Files:**
- Create: `apps/web/src/components/settings/SubscriptionsSection.tsx`
- Modify: `apps/web/src/pages/SettingsPage.tsx`
- Test: `apps/web/src/test/settings-subscriptions.test.tsx`; o mock de `PUT /api/series/:id/tags` valida `tagIds` como na Task 4.

**Interfaces:**
- Consumes:
  - `GET /api/series/monthly?kind=EXPENSE` e `PUT /api/series/:id/tags` (Task 5);
  - `queryKeys.monthlySeries('EXPENSE')`;
  - a etiqueta de sistema em `['tags']`, encontrada por `system === 'SUBSCRIPTION'`, nunca pelo nome.
- Produces: seção "Assinaturas" com:
  - Lista das séries que têm a etiqueta de sistema: nome, `formatBRL(currentMonthCents)` e um botão `Remover` (`aria-label="Remover <nome> das assinaturas"`), que envia `tagIds` sem a etiqueta.
  - "Total mensal R$ X" = soma de `currentMonthCents` das listadas.
  - "Marcar como assinatura": `<select>` com as séries mensais de despesa que ainda não têm a etiqueta e o botão "Marcar", que envia `tagIds` + a etiqueta.
  - Lista vazia: "Nenhuma assinatura marcada."
  - Mutações invalidam `['monthly-series']` e as consultas de lançamentos.

- [ ] **Step 1: Failing tests**
  - Com "Spotify" (2190, com a etiqueta) e "Academia" (9990, sem ela), a lista mostra só Spotify e o total `R$ 21,90`.
  - Marcar "Academia" → `PUT /api/series/s-acad/tags` com `{ tagIds: ['t-sub'] }`, preservando as outras etiquetas da série.
  - Remover Spotify → `PUT` sem `t-sub`.
  - A etiqueta de sistema renomeada para "Recorrentes" continua funcionando, porque a busca é por `system`.
  - Offline: tudo desabilitado.
- [ ] **Step 2: Run and verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify**
  - Run: `pnpm typecheck && pnpm test && pnpm --filter @pluton/web build && pnpm audit --prod`
  - Expected: tudo PASS, build ok, audit sem vulnerabilidades.
- [ ] **Step 5: Commit** — `feat(web): subscriptions overview in settings`

---

## Depois das tasks

- Revisão do branch inteiro.
- PR para `main`; o merge dispara o deploy no Dokploy, que roda `prisma migrate deploy`. **Antes do merge, faça o backup manual no R2** (runbook `docs/deploy.md`, seção de backups).
- Revisão humana por pares continua obrigatória pela política do Instituto antes do merge.
