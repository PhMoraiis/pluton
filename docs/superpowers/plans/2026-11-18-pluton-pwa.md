# Pluton PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o app Swift por um PWA em React, com backend Node/Prisma/Postgres próprio, que reproduz a tabela de controle financeiro do Notion do usuário com parcelas automáticas, ganhos, histórico, análise por período e importação do Notion.

**Architecture:** Monorepo pnpm com três pacotes: `packages/shared` (regras puras de domínio: dinheiro, datas, parcelas, resumos, importação — tudo testado em Vitest), `apps/api` (Hono + Prisma + Better Auth; em produção também serve o build estático do web, então tudo roda em **um único container, mesma origem**, com cookies de sessão) e `apps/web` (React + Vite + TanStack Query/Table + Tailwind + vite-plugin-pwa). Deploy via Dokploy na VPS do usuário, Postgres como serviço do Dokploy, backups para Cloudflare R2.

**Tech Stack:** Node 24 LTS, TypeScript, pnpm workspaces, Vitest, Hono (`@hono/node-server`), zod, Prisma 7 (`prisma.config.ts`, generator `prisma-client`, `@prisma/adapter-pg` — conferir a doc atual), Postgres 17, Better Auth (`better-auth`, adapter Prisma), React 19, Vite, react-router, TanStack Query (+ persister), TanStack Table, Tailwind v4, vite-plugin-pwa, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-18-pluton-pwa-design.md`

## Global Constraints

- Idioma da UI pt-BR; moeda BRL; fuso de "hoje" = `America/Sao_Paulo`.
- Dinheiro sempre em **centavos inteiros** (`amountCents: number`), nunca float, em todo o sistema.
- Datas de vencimento/pagamento são **data pura** `IsoDate = 'YYYY-MM-DD'` (Postgres `@db.Date`); nunca converter para `Date` com hora no domínio. Mês = `MonthKey = 'YYYY-MM'`.
- Mês de referência de um lançamento = mês do **vencimento**, nunca do pagamento.
- Lançamentos com `paidOn` preenchido **nunca** são alterados por propagação de série.
- Dia inexistente no mês (ex.: 31 em fevereiro) → último dia do mês.
- **Conta única:** cadastro só é aceito se não existir nenhum usuário.
- **Offline = só leitura:** sem conexão, toda ação de escrita fica desabilitada, com o aviso `Você está offline — somente leitura`. Nada é enfileirado.
- Nunca apagar dados para "consertar" schema: só Prisma Migrate versionado.
- Segredos (`BETTER_AUTH_SECRET`, senha do Postgres, credenciais R2) **nunca** no git nem gerados pelo agente; `.env` no `.gitignore`; `.env.example` só com nomes.
- `dados_notion_pluton/` nunca é versionado nem copiado para fixtures (contém dados pessoais). Fixtures de teste usam dados fictícios no mesmo formato.
- Cópia fixa da UI: `Só esta`, `Esta e as próximas`, `Série inteira`, `+ Nova linha`, `Copiar chave`, `Desfazer`, `Despesas`, `Ganhos`, `Histórico`, `Período`, `Importar`, `Configurações`.
- Métodos de pagamento iniciais (criados junto com o usuário): `Pix`, `Cartão de crédito`, `Débito`, `Boleto`, `Dinheiro`.

## Review Focus

1. **Fuso horário:** servidor em UTC e usuário em São Paulo — `2026-12-05` gravado deve voltar `2026-12-05`, e "hoje" às 22h30 de 30/nov em SP é `2026-11-30` (não 1º/dez). → testes nas Tasks 2 e 7.
2. **Editar o nome de uma parcela** ("Fone 3/7" → "Fone Bluetooth 3/7") deve renomear a série, não criar outra série nem duplicar parcelas. → teste na Task 8.
3. **Valor digitado em formatos variados** (`1.234,56`, `1234,56`, `R$ 7`, `7`, `R$ 630,00`, `1234.56`) deve virar os centavos certos; lixo vira erro, não `NaN`. → testes na Task 1.
4. **Clique duplo em "pago"** ou desfazer rápido não pode gerar estado inconsistente: marcar pago duas vezes mantém o primeiro `paidOn`; desmarcar zera. → teste na Task 7.
5. **Sessão expirada com o app aberto** (iPhone abre o PWA dias depois): resposta 401 leva para `/login`, não para tela em branco nem erro genérico. → teste na Task 10.

---

## File Structure

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, .nvmrc, .gitignore, .env.example, README.md
docker-compose.dev.yml            # Postgres local para dev e testes
Dockerfile                        # build único (web + api) para o Dokploy
docs/deploy.md                    # runbook Dokploy + R2 + teste de restauração

packages/shared/src/
  index.ts                        # re-exporta tudo
  types.ts                        # IsoDate, MonthKey, EntryKind, SeriesType, EntryDTO, PaymentMethodDTO, Summary, scopes
  money.ts                        # parseBRL, formatBRL
  dates.ts                        # addMonthsClamped, todayInSaoPaulo, monthKeyOf, monthRange, defaultMonth, formatDatePtBR
  installments.ts                 # parseInstallmentName, formatEntryName, planSequence, propagateFollowing
  summary.ts                      # summarize
  notion-import.ts                # parseNotionDate, parseNotionCsv, entryDedupeKey, buildImportPlan
packages/shared/test/*.test.ts    # um arquivo por módulo

apps/api/
  prisma/schema.prisma, prisma.config.ts
  src/server.ts                   # entrypoint Node (serve app + estáticos em produção)
  src/app.ts                      # createApp(): Hono com rotas montadas (testável sem porta)
  src/db.ts                       # PrismaClient com adapter-pg
  src/auth.ts                     # Better Auth (conta única + seed de métodos)
  src/middleware/require-user.ts
  src/routes/{setup,payment-methods,entries,series,summary,import}.ts
  src/services/{entries,materialize,dto}.ts
  test/helpers.ts                 # resetDb, signUpAndGetCookie, api()
  test/*.test.ts

apps/web/
  index.html, vite.config.ts, src/main.tsx, src/router.tsx
  src/lib/{api,auth-client,query,online}.ts
  src/components/{Layout,OfflineBanner,MonthPicker,SummaryBar,EntriesTable,EntryCards,NewEntryRow,ScopeDialog,PixCopyButton,MethodTag,UndoToast}.tsx
  src/pages/{LoginPage,EntriesPage,HistoryPage,PeriodPage,ImportPage,SettingsPage}.tsx
  src/test/*.test.tsx
```

---

### Task 1: Monorepo, remoção do Swift e dinheiro (`money.ts`)

**Files:**
- Delete: `Pluton.xcodeproj/`, `pluton/`, `plutonTests/`, `plutonUITests/` (preservados na branch `swift-legacy`)
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc` (`24`), `.env.example`, `packages/shared/{package.json,tsconfig.json,vitest.config.ts}`, `packages/shared/src/{index.ts,types.ts,money.ts}`
- Modify: `.gitignore` (adicionar `node_modules/`, `dist/`, `.env`, `apps/api/src/generated/`), `README.md` (reescrever: o que é, stack, como rodar dev/testes, link para `docs/deploy.md`)
- Test: `packages/shared/test/money.test.ts`

**Interfaces:**
- Produces: pacote `@pluton/shared` (`"exports": {".": "./src/index.ts"}`, consumido como fonte TS); scripts raiz `pnpm test` (todos os pacotes), `pnpm typecheck`.
- Produces (`types.ts`): `type IsoDate = string`, `type MonthKey = string`, `type EntryKind = 'EXPENSE' | 'INCOME'`, `type SeriesType = 'INSTALLMENT' | 'MONTHLY'`, `type EditScope = 'this' | 'following'`, `type DeleteScope = 'this' | 'following' | 'series'`, `interface PaymentMethodDTO { id: string; name: string; color: string; sortOrder: number }`, `interface EntryDTO { id: string; kind: EntryKind; name: string; displayName: string; amountCents: number; dueDate: IsoDate; paymentMethodId: string | null; pixKey: string | null; note: string; paidOn: IsoDate | null; seriesId: string | null; seriesType: SeriesType | null; sequence: number | null; totalInstallments: number | null }`, `interface Summary { expenseCents: number; incomeCents: number; balanceCents: number; realizedCents: number }`.
- Produces (`money.ts`): `parseBRL(input: string): number | null`, `formatBRL(cents: number): string`.

- [ ] **Step 1: Remover o Swift e criar o esqueleto do workspace** (arquivos acima; Vitest configurado em `packages/shared`). `pnpm install` deve concluir sem erros.

- [ ] **Step 2: Write the failing test** — `money.test.ts`:

```ts
test.each([
  ['R$ 630,00', 63000], ['R$ 1.234,56', 123456], ['1.234,56', 123456],
  ['1234,56', 123456], ['1234.56', 123456], ['R$ 7', 700], ['7', 700],
  ['42,9', 4290], ['  81,75 ', 8175], ['0,01', 1],
])('parseBRL(%j) === %i', (input, cents) => expect(parseBRL(input)).toBe(cents));
test.each(['', 'abc', 'R$', '12,345', '1,2,3', '-'])('parseBRL(%j) === null', (input) =>
  expect(parseBRL(input)).toBeNull());
test('formatBRL', () => {
  expect(formatBRL(171796)).toBe('R$ 1.717,96');
  expect(formatBRL(700)).toBe('R$ 7,00');
  expect(formatBRL(-2500)).toBe('-R$ 25,00');
});
```

- [ ] **Step 3: Run test to verify it fails** — `pnpm --filter @pluton/shared test` → FAIL (módulo inexistente).

- [ ] **Step 4: Implement `parseBRL` / `formatBRL` in `packages/shared/src/money.ts`.** Regra de parse: remove `R$`, espaços e U+00A0; se houver vírgula, ela é o decimal e pontos são milhar (no máx. 2 casas após a vírgula); sem vírgula, um ponto seguido de exatamente 2 dígitos no fim é decimal, senão pontos são milhar. Negativos não são aceitos na entrada (retorna `null`). `formatBRL` usa `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

- [ ] **Step 5: Run test to verify it passes** — mesmo comando → PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "chore: replace Swift app with pnpm monorepo and shared money utils"`

---

### Task 2: Datas (`dates.ts`)

**Files:**
- Create: `packages/shared/src/dates.ts`
- Test: `packages/shared/test/dates.test.ts`

**Interfaces:**
- Produces: `addMonthsClamped(date: IsoDate, months: number, dayOfMonth?: number): IsoDate` (dia = `dayOfMonth ?? dia de date`, limitado ao fim do mês); `todayInSaoPaulo(now?: Date): IsoDate`; `monthKeyOf(date: IsoDate): MonthKey`; `monthRange(from: MonthKey, to: MonthKey): { start: IsoDate; end: IsoDate }` (primeiro dia de `from` ao último de `to`); `addMonthsToKey(key: MonthKey, n: number): MonthKey`; `defaultMonth(pendingDueDates: IsoDate[], today: IsoDate): MonthKey`; `formatDatePtBR(date: IsoDate): string`; `dayOf(date: IsoDate): number`.

- [ ] **Step 1: Write the failing test**

```ts
expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
expect(addMonthsClamped('2026-02-28', 1, 31)).toBe('2026-03-31');   // dia da série volta a 31
expect(addMonthsClamped('2026-12-05', 1)).toBe('2027-01-05');
expect(addMonthsClamped('2026-03-10', -3)).toBe('2025-12-10');
expect(todayInSaoPaulo(new Date('2026-12-01T01:30:00Z'))).toBe('2026-11-30'); // 22h30 em SP
expect(todayInSaoPaulo(new Date('2026-12-01T03:30:00Z'))).toBe('2026-12-01');
expect(monthRange('2026-01', '2026-02')).toEqual({ start: '2026-01-01', end: '2026-02-28' });
// defaultMonth: mês do próximo vencimento pendente >= hoje; sem nenhum, mês de hoje
expect(defaultMonth(['2026-11-25', '2026-12-05'], '2026-11-18')).toBe('2026-11');
expect(defaultMonth(['2026-12-05', '2026-11-05'], '2026-11-18')).toBe('2026-12'); // 05/nov é atrasado, não conta
expect(defaultMonth([], '2026-11-18')).toBe('2026-11');
expect(formatDatePtBR('2026-12-05')).toBe('5 de dezembro de 2026');
```

- [ ] **Step 2: Run** `pnpm --filter @pluton/shared test dates` → FAIL.
- [ ] **Step 3: Implement** em `dates.ts` com aritmética sobre ano/mês/dia (sem `Date` com hora, exceto em `todayInSaoPaulo`, que usa `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(shared): add date-only helpers`

---

### Task 3: Parcelas e propagação (`installments.ts`)

**Files:**
- Create: `packages/shared/src/installments.ts`
- Test: `packages/shared/test/installments.test.ts`

**Interfaces:**
- Consumes: `addMonthsClamped`, `dayOf` (Task 2).
- Produces:
  - `parseInstallmentName(name: string): { baseName: string; current: number; total: number } | null` — sufixo `x/y` no fim, espaços opcionais ao redor da barra, `1 ≤ x ≤ y ≤ 360`, `baseName` (trim) não vazio.
  - `formatEntryName(baseName: string, sequence: number | null, total: number | null): string` — `"Fone 3/7"` se `total` não nulo, senão `baseName`.
  - `planSequence(start: IsoDate, fromSeq: number, toSeq: number, dayOfMonth: number): Array<{ sequence: number; dueDate: IsoDate }>` — `fromSeq` em `start`, cada seguinte +1 mês.
  - `interface SeriesEntryLike { id: string; sequence: number; dueDate: IsoDate; amountCents: number; paidOn: IsoDate | null }`
  - `propagateFollowing(entries: SeriesEntryLike[], editedSequence: number, change: { dueDate?: IsoDate; amountCents?: number }): Array<{ id: string; dueDate?: IsoDate; amountCents?: number }>` — sempre inclui a editada; inclui as de `sequence > editedSequence` **não pagas**; nova data da parcela k = `addMonthsClamped(change.dueDate, k - editedSequence, dayOf(change.dueDate))`.

- [ ] **Step 1: Write the failing test**

```ts
expect(parseInstallmentName('Fone 1/7')).toEqual({ baseName: 'Fone', current: 1, total: 7 });
expect(parseInstallmentName('Capa, Case Switch 2/3')).toEqual({ baseName: 'Capa, Case Switch', current: 2, total: 3 });
expect(parseInstallmentName('GTA 6 3 / 9')).toEqual({ baseName: 'GTA 6', current: 3, total: 9 });
expect(parseInstallmentName('Spotify')).toBeNull();
expect(parseInstallmentName('Fone 8/7')).toBeNull();
expect(parseInstallmentName('Fone 0/7')).toBeNull();
expect(parseInstallmentName('3/7')).toBeNull();
expect(formatEntryName('Fone', 3, 7)).toBe('Fone 3/7');
expect(formatEntryName('Spotify', 4, null)).toBe('Spotify');
expect(planSequence('2026-12-05', 3, 5, 5)).toEqual([
  { sequence: 3, dueDate: '2026-12-05' }, { sequence: 4, dueDate: '2027-01-05' }, { sequence: 5, dueDate: '2027-02-05' }]);
const s = [
  { id: 'a', sequence: 3, dueDate: '2026-11-05', amountCents: 4290, paidOn: '2026-11-04' },
  { id: 'b', sequence: 4, dueDate: '2026-12-05', amountCents: 4290, paidOn: null },
  { id: 'c', sequence: 5, dueDate: '2027-01-05', amountCents: 4290, paidOn: '2026-11-10' }, // paga adiantada
  { id: 'd', sequence: 6, dueDate: '2027-02-05', amountCents: 4290, paidOn: null },
];
expect(propagateFollowing(s, 4, { dueDate: '2026-12-10' })).toEqual([
  { id: 'b', dueDate: '2026-12-10' }, { id: 'd', dueDate: '2027-02-10' }]);   // 'a' anterior e 'c' paga intocadas
expect(propagateFollowing(s, 4, { amountCents: 5000 })).toEqual([
  { id: 'b', amountCents: 5000 }, { id: 'd', amountCents: 5000 }]);
expect(propagateFollowing(s, 3, { dueDate: '2026-11-30' })[0]).toEqual({ id: 'a', dueDate: '2026-11-30' }); // a editada entra mesmo paga
```

- [ ] **Step 2: Run** `pnpm --filter @pluton/shared test installments` → FAIL.
- [ ] **Step 3: Implement** em `installments.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(shared): add installment parsing and series propagation`

---

### Task 4: Resumos (`summary.ts`)

**Files:**
- Create: `packages/shared/src/summary.ts`
- Test: `packages/shared/test/summary.test.ts`

**Interfaces:**
- Produces: `summarize(entries: Array<Pick<EntryDTO, 'kind' | 'amountCents' | 'paidOn'>>): Summary` — `expenseCents` = soma das despesas, `incomeCents` = soma dos ganhos, `balanceCents = incomeCents − expenseCents`, `realizedCents` = ganhos com `paidOn` − despesas com `paidOn`. O chamador filtra os lançamentos pelo mês/período de **vencimento**.

- [ ] **Step 1: Write the failing test** — três despesas (63000 paga, 4290 pendente, 700 paga) e dois ganhos (500000 recebido, 100000 pendente) → `{ expenseCents: 67990, incomeCents: 600000, balanceCents: 532010, realizedCents: 436300 }`; lista vazia → tudo `0`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(shared): add summary calculation`

---

### Task 5: Importador do Notion (`notion-import.ts`)

**Files:**
- Create: `packages/shared/src/notion-import.ts`, `packages/shared/test/fixtures/notion-sample.csv` (**fictício**, ~15 linhas, mesmo cabeçalho e formatos do export real: BOM, `R$ `, datas por extenso, `Yes`/`No`)
- Test: `packages/shared/test/notion-import.test.ts`

**Interfaces:**
- Consumes: `parseBRL` (T1), `addMonthsClamped`, `addMonthsToKey`, `monthKeyOf`, `dayOf` (T2), `parseInstallmentName`, `formatEntryName`, `planSequence` (T3).
- Produces:
  - `parseNotionDate(s: string): IsoDate | null` — `"5 de dezembro de 2026"` → `'2026-12-05'`.
  - `interface NotionRow { rowId: number; name: string; amountCents: number | null; dueDate: IsoDate | null; paid: boolean; paymentMethod: string | null; note: string; errors: string[] }` — `errors` ∈ `'sem nome' | 'sem valor' | 'sem data'`; `name` com trim.
  - `parseNotionCsv(text: string): NotionRow[]` — parser CSV com aspas (pode usar `papaparse`), remove BOM; colunas por nome: `Name, Amount, Date, Pago, Payment Method, Notes`; demais ignoradas.
  - `entryDedupeKey(kind: EntryKind, displayName: string, dueDate: IsoDate, amountCents: number): string` → `` `${kind}|${displayName.trim().toLowerCase()}|${dueDate}|${amountCents}` ``.
  - `interface PlannedEntry { rowId: number | null; name: string; sequence: number | null; amountCents: number; dueDate: IsoDate; paid: boolean; paymentMethod: string | null; note: string; generated: boolean }`
  - `interface ImportPlan { installmentSeries: Array<{ key: string; baseName: string; total: number; dayOfMonth: number; amountCents: number; paymentMethod: string | null; entries: PlannedEntry[] }>; monthlySuggestions: Array<{ key: string; name: string; dayOfMonth: number; amountCents: number; paymentMethod: string | null; active: boolean; entries: PlannedEntry[] }>; singles: PlannedEntry[]; invalid: NotionRow[]; duplicates: number }`
  - `buildImportPlan(rows: NotionRow[], opts: { today: IsoDate; existingKeys: Set<string>; overrides?: Record<number, Partial<Pick<NotionRow, 'name' | 'amountCents' | 'dueDate'>>>; excludedRowIds?: number[] }): ImportPlan` — tudo `kind = 'EXPENSE'`.

Regras de `buildImportPlan` (decididas no spec §6.8, valores aqui):
1. Aplica `overrides`, remove `excludedRowIds`, recalcula `errors`; linhas com erro → `invalid`.
2. Linhas cuja chave (`entryDedupeKey` com o nome exibido) já está em `existingKeys` são descartadas e contadas em `duplicates`.
3. Parceladas: agrupa por `(baseName normalizado: trim + lowercase, total)`; dentro do grupo, ordenado por data, uma `sequence` repetida inicia **nova série** (compra repetida). `dayOfMonth`/`amountCents`/`paymentMethod` = da última parcela existente. Completa `sequence` de `max+1` até `total` com `planSequence` a partir da última data (`generated: true`, `paid: false`). Lacunas no meio e parcelas anteriores à primeira não são criadas.
4. Não parceladas com mesmo nome normalizado em **≥ 3 meses distintos** → `monthlySuggestions` (nome exibido = grafia da ocorrência mais recente); `active = monthKeyOf(última) >= addMonthsToKey(monthKeyOf(today), -1)`. As demais → `singles`.
5. `key` de série/sugestão = nome normalizado + `|` + total (ou `monthly`) + `|` + índice do grupo.

- [ ] **Step 1: Write the failing tests** (com a fixture):

```ts
expect(parseNotionDate('5 de dezembro de 2026')).toBe('2026-12-05');
expect(parseNotionDate('31 de março de 2025')).toBe('2025-03-31');
expect(parseNotionDate('')).toBeNull();
// parseNotionCsv: BOM removido, 'R$ 254,70' → 25470, 'Yes' → paid true, método vazio → null, linha sem data → errors ['sem data']
// buildImportPlan, today '2026-11-18':
//  - 'Fone 1/7'(set), 'Fone 2/7'(out), 'Fone 3/7'(nov) → 1 série total 7 com 7 entries; seq 4..7 generated em dez/jan/fev/mar, dia 5, valor da 3/7
//  - 'Spotify' em set/out/nov + 'spotify ' em ago → 1 monthlySuggestion active=true com 4 entries, name 'Spotify'
//  - 'Claro Flex' só em jan/fev/mar de 2025 → suggestion active=false
//  - 'Tenis' 1x → singles
//  - 'Fone 1/2' em 2025 e 'Fone 1/2' de novo em 2026 → 2 séries distintas
//  - mesma chamada com existingKeys contendo a chave de 'Tenis' → duplicates === 1 e 'Tenis' fora de singles
//  - rodar buildImportPlan duas vezes sobre o mesmo input dá o mesmo resultado (determinístico)
//  - overrides { [rowIdSemData]: { dueDate: '2025-06-05' } } tira a linha de invalid
```

- [ ] **Step 2: Run** `pnpm --filter @pluton/shared test notion-import` → FAIL.
- [ ] **Step 3: Implement** em `notion-import.ts`.
- [ ] **Step 4: Run** → PASS. Rodar também, **localmente e sem commitar nada**, um script descartável que aplica `parseNotionCsv` + `buildImportPlan` ao `dados_notion_pluton/Despesas …_all.csv` real e confere: 307 linhas lidas, erros por tipo = 3 `sem data`, 1 `sem nome`, 1 `sem valor` (uma linha pode ter mais de um), nenhuma exceção. Não imprimir nomes/valores das linhas na saída além do necessário.
- [ ] **Step 5: Commit** — `feat(shared): add Notion CSV import planner`

---

### Task 6: API — base, banco, login de conta única e métodos de pagamento

**Files:**
- Create: `docker-compose.dev.yml` (Postgres 17, porta 5433, bancos `pluton` e `pluton_test`), `apps/api/{package.json,tsconfig.json,vitest.config.ts,prisma.config.ts}`, `apps/api/prisma/schema.prisma`, `apps/api/src/{server.ts,app.ts,db.ts,auth.ts}`, `apps/api/src/middleware/require-user.ts`, `apps/api/src/routes/{setup,payment-methods}.ts`, `apps/api/test/helpers.ts`
- Test: `apps/api/test/auth.test.ts`, `apps/api/test/payment-methods.test.ts`

**Interfaces:**
- Produces (Prisma, além dos modelos do Better Auth gerados por `@better-auth/cli generate`):

```prisma
enum EntryKind  { EXPENSE INCOME }
enum SeriesType { INSTALLMENT MONTHLY }
model PaymentMethod { id String @id @default(cuid()); userId String; name String; color String; sortOrder Int
  user User @relation(fields: [userId], references: [id], onDelete: Cascade); entries Entry[]; series Series[]
  @@unique([userId, name]) }
model Series { id String @id @default(cuid()); userId String; kind EntryKind; type SeriesType; baseName String
  totalInstallments Int?; dayOfMonth Int; amountCents Int; paymentMethodId String?; pixKey String?
  endedOn DateTime? @db.Date; generatedThrough DateTime? @db.Date; createdAt DateTime @default(now())
  user User @relation(...onDelete: Cascade); paymentMethod PaymentMethod? @relation(..., onDelete: SetNull); entries Entry[] }
model Entry { id String @id @default(cuid()); userId String; kind EntryKind; name String; amountCents Int
  dueDate DateTime @db.Date; paymentMethodId String?; pixKey String?; note String @default("")
  paidOn DateTime? @db.Date; seriesId String?; sequence Int?; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  user User @relation(...onDelete: Cascade); paymentMethod PaymentMethod? @relation(..., onDelete: SetNull)
  series Series? @relation(..., onDelete: Cascade)
  @@unique([seriesId, sequence]); @@index([userId, kind, dueDate]) }
```
  (`Entry.name` guarda o nome-base; o exibido vem de `formatEntryName`.)
- Produces: `createApp(): Hono` (todas as rotas sob `/api`); `auth` (Better Auth) montado em `/api/auth/*`; `requireUser` middleware que põe `c.get('userId')` e responde `401 { error: 'unauthorized' }`; `GET /api/setup-status → { hasUser: boolean }`; `GET/POST /api/payment-methods`, `PATCH/DELETE /api/payment-methods/:id` (body `{ name, color }`, retorna `PaymentMethodDTO`).
- Produces (test helpers): `resetDb(): Promise<void>` (trunca todas as tabelas), `signUpAndGetCookie(): Promise<string>` (via `POST /api/auth/sign-up/email`), `api(path, init?, cookie?)` sobre `createApp().request`.

- [ ] **Step 1: Write the failing tests**

```ts
// auth.test.ts
test('setup-status sem usuário', async () => expect(await json(api('/api/setup-status'))).toEqual({ hasUser: false }));
test('primeiro cadastro funciona e cria os 5 métodos iniciais', ...)  // nomes: Pix, Cartão de crédito, Débito, Boleto, Dinheiro
test('segundo cadastro é recusado', ...)                              // status 4xx, e só 1 user no banco
test('rota protegida sem cookie → 401', ...)                           // GET /api/payment-methods
// payment-methods.test.ts
test('cria, renomeia e lista ordenado por sortOrder', ...)
test('nome duplicado → 409', ...)
test('excluir método em uso deixa a entry com paymentMethodId null', ...)  // cria Entry direto via prisma
```

- [ ] **Step 2: Run** `docker compose -f docker-compose.dev.yml up -d && pnpm --filter @pluton/api test` → FAIL.
- [ ] **Step 3: Implement.** `auth.ts`: `betterAuth({ database: prismaAdapter(prisma, { provider: 'postgresql' }), emailAndPassword: { enabled: true }, databaseHooks: { user: { create: { before: /* se prisma.user.count() > 0 → throw new APIError('FORBIDDEN') */, after: /* cria os 5 métodos iniciais */ } } } })`; rate limit padrão do Better Auth ligado. Primeira migração: `prisma migrate dev --name init`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(api): add Hono app, Prisma schema, single-account auth and payment methods`

---

### Task 7: API — criar, listar e pagar lançamentos (com materialização)

**Files:**
- Create: `apps/api/src/services/{dto,entries,materialize}.ts`, `apps/api/src/routes/entries.ts`
- Test: `apps/api/test/entries-create.test.ts`

**Interfaces:**
- Consumes: `parseInstallmentName`, `planSequence`, `formatEntryName`, `todayInSaoPaulo`, `defaultMonth`, `monthRange`, `addMonthsToKey` (shared).
- Produces:
  - `toEntryDTO(entry & { series }): EntryDTO` (datas como `IsoDate` via `toISOString().slice(0, 10)` sobre `@db.Date`).
  - `ensureMaterialized(userId: string, throughMonth: MonthKey): Promise<void>` — para séries `MONTHLY` sem `endedOn` (ou com `endedOn` ≥ mês), gera entradas faltantes até `max(throughMonth, mês de hoje + 12)` e atualiza `generatedThrough`; idempotente (`@@unique([seriesId, sequence])`).
  - `POST /api/entries` body `{ kind, name, amountCents, dueDate, paymentMethodId?, pixKey?, note?, monthly?: boolean }` → `201 EntryDTO[]`. Nome com `x/y` → série `INSTALLMENT` com entradas `current..total`; `monthly: true` (sem `x/y`) → série `MONTHLY` + materialização; senão entrada avulsa. `x/y` + `monthly` → 400.
  - `GET /api/entries?kind&from&to&status=pending|paid|all` (`from`/`to` = `MonthKey`) → `EntryDTO[]` ordenado por `dueDate`, `displayName`; chama `ensureMaterialized(to)` antes.
  - `GET /api/entries/overdue?kind` → pendentes com `dueDate < hoje`.
  - `GET /api/default-month?kind` → `{ month: MonthKey }`.
  - `POST /api/entries/:id/pay` body `{ paid: boolean }` → `EntryDTO`; `paid: true` em entrada já paga mantém o `paidOn` original.
  - Toda rota filtra por `userId` (entrada de outro usuário → 404).

- [ ] **Step 1: Write the failing tests**

```ts
test('"Fone 3/7" em 2026-12-05 cria série com 5 entradas (3..7), dez→abr, displayName "Fone 3/7"..."Fone 7/7"', ...)
test('dia 31: "Celular 1/3" em 2027-01-31 → 2027-01-31, 2027-02-28, 2027-03-31', ...)
test('monthly "Spotify" em 2026-12-05 gera ao menos 13 meses; GET de 2029-01 materializa até lá sem duplicar', ...)
test('avulsa sem x/y e sem monthly → 1 entrada sem seriesId', ...)
test('"Fone 1/7" com monthly:true → 400', ...)
test('com TZ=UTC no processo, dueDate "2026-12-05" volta "2026-12-05"', ...)        // Review Focus 1
test('pay duas vezes mantém o primeiro paidOn; paid:false zera', ...)                // Review Focus 4
test('status=pending exclui pagas; overdue traz só pendentes vencidas antes de hoje', ...) // hoje via vi.setSystemTime
test('default-month: pendentes em 2026-11-25 e 2026-12-05, hoje 2026-11-18 → "2026-11"', ...)
test('entrada de outro usuário → 404', ...)  // cria a 2ª conta direto no banco
```

- [ ] **Step 2: Run** `pnpm --filter @pluton/api test entries-create` → FAIL.
- [ ] **Step 3: Implement** (criação de série + entradas numa transação Prisma).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(api): create, list and pay entries with series materialization`

---

### Task 8: API — editar, excluir e encerrar séries

**Files:**
- Modify: `apps/api/src/routes/entries.ts`, `apps/api/src/services/entries.ts`
- Create: `apps/api/src/routes/series.ts`
- Test: `apps/api/test/entries-edit.test.ts`

**Interfaces:**
- Consumes: `propagateFollowing`, `parseInstallmentName`, `dayOf` (shared); `toEntryDTO`, `ensureMaterialized` (T7).
- Produces:
  - `PATCH /api/entries/:id` body `{ scope?: EditScope; name?; amountCents?; dueDate?; paymentMethodId?; pixKey?; note? }` → `EntryDTO[]` (todas as alteradas). `scope` obrigatório (400 se faltar) quando a entrada é de série **e** o body muda `dueDate`, `amountCents`, `name`, `paymentMethodId` ou `pixKey`.
    - `following`: `dueDate`/`amountCents` via `propagateFollowing`; atualiza `Series.dayOfMonth`/`amountCents`; `name`/`paymentMethodId`/`pixKey` aplicados à série e às entradas seguintes não pagas.
    - `name` de parcela: o sufixo `x/y` digitado é removido e só o nome-base é gravado (nunca cria série nova).
    - `this`: altera só a entrada.
  - `DELETE /api/entries/:id?scope=this|following|series` → `204`. `following`/`series` apagam só as **não pagas** (as pagas ficam no histórico); série sem entradas restantes é apagada.
  - `POST /api/series/:id/end` body `{ lastMonth: MonthKey }` → grava `endedOn` = último dia de `lastMonth` e apaga entradas não pagas posteriores.

- [ ] **Step 1: Write the failing tests**

```ts
test('mudar data da 4/7 para dia 10 com following: 4..7 não pagas vão para dia 10, pagas intocadas', ...)
test('mudar valor com this: só a entrada muda, série mantém amountCents', ...)
test('editar série sem scope → 400', ...)
test('renomear "Fone 3/7" para "Fone Bluetooth 3/7" com following → base "Fone Bluetooth" nas não pagas seguintes, mesma série, mesma contagem de entradas', ...) // Review Focus 2
test('delete following na 5/7 remove 5..7 não pagas; delete series mantém as pagas', ...)
test('end da série mensal em 2027-02 apaga pendentes de mar/2027 em diante e ensureMaterialized não as recria', ...)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (cada operação numa transação). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(api): edit and delete entries with series scope`

---

### Task 9: API — resumo e importação

**Files:**
- Create: `apps/api/src/routes/{summary,import}.ts`
- Test: `apps/api/test/summary.test.ts`, `apps/api/test/import.test.ts`

**Interfaces:**
- Consumes: `summarize`, `monthRange` (shared); `parseNotionCsv`, `buildImportPlan`, `entryDedupeKey`, `formatEntryName` (shared); `ensureMaterialized` (T7).
- Produces:
  - `GET /api/summary?from=MonthKey&to=MonthKey` → `Summary` (lançamentos com `dueDate` no intervalo, ambos os tipos).
  - `POST /api/import/preview` body `{ csv: string; overrides?; excludedRowIds? }` → `ImportPlan` (`existingKeys` montado das entradas do usuário).
  - `POST /api/import/commit` body `{ csv: string; acceptedMonthlyKeys: string[]; overrides?; excludedRowIds? }` → `{ created: number; duplicates: number; invalidSkipped: number }`. Recalcula o plano no servidor (não confia no cliente); sugestões mensais não aceitas viram avulsas; métodos mapeados por nome case-insensitive (`Cartão` → `Cartão de crédito`; desconhecido → cria método novo com cor padrão); `paid: true` → `paidOn = dueDate`; séries mensais aceitas e ativas recebem materialização, inativas recebem `endedOn` = último dia do mês da última ocorrência. Tudo numa transação. Limite de body: 2 MB.

- [ ] **Step 1: Write the failing tests**

```ts
test('summary de 2026-12 a 2026-12 e de 2026-01 a 2026-06 batem com summarize sobre as entradas criadas', ...)
test('import da fixture cria séries completadas, mensais aceitas e avulsas; contagens batem com o preview', ...)
test('importar a mesma fixture de novo → created 0, duplicates = total da 1ª', ...)
test('"Cartão" vira "Cartão de crédito"; método "PicPay" desconhecido é criado', ...)
test('linhas inválidas são puladas e contadas em invalidSkipped', ...)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(api): add summary and Notion import endpoints`

---

### Task 10: Web — base, login, layout, PWA e offline

**Files:**
- Create: `apps/web/{package.json,tsconfig.json,vite.config.ts,index.html}`, `apps/web/src/{main.tsx,router.tsx,index.css}`, `apps/web/src/lib/{api,auth-client,query,online}.ts`, `apps/web/src/components/{Layout,OfflineBanner}.tsx`, `apps/web/src/pages/LoginPage.tsx`, ícones PWA em `apps/web/public/` (192, 512, apple-touch 180; ícone simples gerado, sem marca de terceiros)
- Test: `apps/web/src/test/{api,online}.test.tsx`

**Interfaces:**
- Consumes: rotas `/api/setup-status`, `/api/auth/*`.
- Produces:
  - `apiFetch<T>(path: string, init?: RequestInit): Promise<T>` — `credentials: 'include'`; 401 → `router.navigate('/login')` e lança `UnauthorizedError`; outros erros lançam `ApiError { status, message }`.
  - `authClient` (`createAuthClient` de `better-auth/react`, mesma origem).
  - `queryClient` + `PersistQueryClientProvider` com persister em `localStorage` (`maxAge` 30 dias) — é isso que permite ver os dados offline.
  - `useOnline(): boolean` (`navigator.onLine` + eventos `online`/`offline`) e `useCanWrite(): boolean` (= online e autenticado). Todo botão/ação de escrita das tasks seguintes usa `disabled={!canWrite}`.
  - Rotas: `/login`, `/` (Despesas), `/ganhos`, `/historico`, `/periodo`, `/importar`, `/configuracoes`; rotas fora de `/login` exigem sessão (`authClient.useSession`).
  - `LoginPage`: se `hasUser === false`, mostra formulário de criar conta (nome, e-mail, senha); senão, entrar.
  - Vite dev: proxy `/api` → `http://localhost:3000`. `vite-plugin-pwa`: `registerType: 'autoUpdate'`, manifest `{ name: 'Pluton', short_name: 'Pluton', display: 'standalone', theme_color/background_color: '#191919', lang: 'pt-BR' }`, precache do app shell; **não** cachear `/api` no service worker.
  - Tema escuro estilo Notion (fundo `#191919`, texto `#ffffffcf`, bordas `#ffffff14`).

- [ ] **Step 1: Write the failing tests**

```ts
test('apiFetch com resposta 401 navega para /login e lança UnauthorizedError', ...)  // Review Focus 5 (fetch mockado)
test('useOnline reage aos eventos offline/online', ...)
test('OfflineBanner aparece com o texto "Você está offline — somente leitura" quando offline', ...)
```

- [ ] **Step 2: Run** `pnpm --filter @pluton/web test` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Verificação manual:** `pnpm dev` (api + web), criar a conta, sair, entrar de novo; segunda tentativa de cadastro em aba anônima mostra erro.
- [ ] **Step 6: Commit** — `feat(web): add PWA shell, auth pages and offline handling`

---

### Task 11: Web — tabela de lançamentos (leitura, filtros e resumo)

**Files:**
- Create: `apps/web/src/pages/EntriesPage.tsx`, `apps/web/src/components/{MonthPicker,SummaryBar,EntriesTable,EntryCards,MethodTag}.tsx`
- Test: `apps/web/src/test/entries-read.test.tsx`

**Interfaces:**
- Consumes: `GET /api/entries`, `/api/entries/overdue`, `/api/default-month`, `/api/summary`, `/api/payment-methods`; `formatBRL`, `formatDatePtBR`, `addMonthsToKey` (shared).
- Produces:
  - `EntriesPage({ kind }: { kind: EntryKind })` — usada em `/` (`EXPENSE`) e `/ganhos` (`INCOME`). Mês inicial = `default-month`; mês fica na URL (`?mes=2026-12`).
  - `MonthPicker` — anterior/próximo + atalhos `Este mês`, `Próximo mês`, `Todos os pendentes` (esse último lista `status=pending` sem filtro de mês).
  - Filtros extras: método de pagamento (multi) e busca por nome (client-side, sobre o resultado).
  - `SummaryBar` — três números do mês (`Despesas`, `Ganhos`, `Ganhos − Despesas`), via `/api/summary?from=mes&to=mes`; **sem** realizado.
  - Seção de atrasados no topo (fundo/realce vermelho), sempre visível, independente do mês.
  - `EntriesTable` (≥ 768px): colunas Data, Nome (seta vermelha despesa / verde ganho + `displayName`), Valor (alinhado à direita), Método (`MethodTag` colorida), Pago (checkbox); rodapé `CONTAGEM n   SOMA R$ x` refletindo os filtros ativos. TanStack Table.
  - `EntryCards` (< 768px): cartão com nome, valor, data, método e checkbox de pago.
  - Mostra só pendentes por padrão (como o filtro "Pago: desmarcadas").

- [ ] **Step 1: Write the failing tests** (API mockada com MSW ou fetch mock)

```ts
test('mostra displayName "Fone 3/7", "R$ 42,90" e "5 de dezembro de 2026"', ...)
test('rodapé com CONTAGEM 2 e SOMA R$ 1.717,96 para os valores 171096 + 700', ...)
test('filtro por método e busca por nome atualizam linhas e rodapé', ...)
test('atrasados aparecem no topo mesmo com outro mês selecionado', ...)
test('SummaryBar não exibe "Realizado"', ...)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(web): entries table with month filters and summary`

---

### Task 12: Web — escrita na tabela (nova linha, edição, pago, exclusão, Pix)

**Files:**
- Create: `apps/web/src/components/{NewEntryRow,ScopeDialog,PixCopyButton,UndoToast}.tsx`
- Modify: `EntriesTable.tsx`, `EntryCards.tsx`, `EntriesPage.tsx`
- Test: `apps/web/src/test/entries-write.test.tsx`

**Interfaces:**
- Consumes: `POST /api/entries`, `PATCH /api/entries/:id`, `DELETE /api/entries/:id`, `POST /api/entries/:id/pay`, `POST /api/series/:id/end`; `parseBRL`, `parseInstallmentName` (shared); `useCanWrite` (T10).
- Produces:
  - `NewEntryRow` — `+ Nova linha` no fim da tabela (e botão flutuante no mobile): campos nome, valor (máscara BRL via `parseBRL`), data (padrão: dia 5 do mês exibido), método, chave Pix (só se método = Pix), toggle `Mensal` (oculto se o nome tiver `x/y`). Ao digitar `x/y`, dica inline: `Cria parcelas x a y, uma por mês`. Enter salva; Esc cancela; foco volta para uma nova linha vazia.
  - Edição inline por célula (Nome, Valor, Data, Método); em entrada de série, salvar abre `ScopeDialog` com `Só esta` / `Esta e as próximas`; excluir abre com `Só esta` / `Esta e as próximas` / `Série inteira`. Séries mensais têm ação `Encerrar série` (escolhe o último mês).
  - Checkbox Pago → `pay { paid: true }`, a linha sai da lista na hora (update otimista) e `UndoToast` com `Desfazer` por 5 s (`pay { paid: false }`).
  - `PixCopyButton` — `Copiar chave` (Clipboard API) quando há `pixKey`; feedback `Copiada!`.
  - Todas as ações acima `disabled` quando `!canWrite`.

- [ ] **Step 1: Write the failing tests**

```ts
test('digitar "Fone 1/7" + "42,90" + Enter faz POST com name "Fone 1/7", amountCents 4290 e mostra a dica de parcelas', ...)
test('editar valor de parcela abre ScopeDialog; "Esta e as próximas" envia scope "following"', ...)
test('marcar pago remove a linha e "Desfazer" envia paid:false e a linha volta', ...)
test('Copiar chave chama clipboard.writeText com a pixKey', ...)
test('offline: Nova linha, checkbox Pago e edição ficam desabilitados', ...)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(web): inline create, edit, pay and delete entries`

---

### Task 13: Web — Histórico e Período

**Files:**
- Create: `apps/web/src/pages/{HistoryPage,PeriodPage}.tsx`
- Test: `apps/web/src/test/history-period.test.tsx`

**Interfaces:**
- Consumes: `GET /api/entries?status=paid&kind&from&to`, `GET /api/summary`, `POST /api/entries/:id/pay`.
- Produces:
  - `HistoryPage` — colunas por mês (mais recente à direita, rolagem horizontal; no mobile um mês por vez com setas), cabeçalho `nov. de 2026  R$ 2.197,72` (total das pagas do mês), cartões com nome, valor e `MethodTag`. Alternância `Despesas`/`Ganhos`. Carrega 6 meses e mais sob demanda. Desmarcar pago num cartão devolve o lançamento à tabela (`pay { paid: false }`, desabilitado offline).
  - `PeriodPage` — seletor de mês inicial e final (padrão: janeiro do ano corrente até o mês atual); mostra `Despesas`, `Ganhos`, `Ganhos − Despesas` e **`Realizado`** do período.

- [ ] **Step 1: Write the failing tests**

```ts
test('histórico agrupa por mês de vencimento com total no cabeçalho ("out. de 2026" / "R$ 2.233,45")', ...)
test('conta que vence 2026-12-05 e foi paga 2026-11-28 aparece na coluna de dez.', ...)
test('PeriodPage mostra Realizado com o valor de /api/summary', ...)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(web): add history board and period analysis`

---

### Task 14: Web — Importar e Configurações

**Files:**
- Create: `apps/web/src/pages/{ImportPage,SettingsPage}.tsx`
- Test: `apps/web/src/test/import-settings.test.tsx`

**Interfaces:**
- Consumes: `POST /api/import/preview`, `POST /api/import/commit`, rotas de `/api/payment-methods`, `authClient.signOut`.
- Produces:
  - `ImportPage` — upload do `.csv` (lido no navegador como texto), envia para preview e mostra: séries parceladas (com parcelas completadas marcadas `nova`), sugestões mensais com checkbox (marcadas por padrão se `active`), avulsas, inválidas (com campos editáveis para o que falta, ou `Descartar`) e quantas duplicadas serão ignoradas. Botão `Importar` → commit com `acceptedMonthlyKeys`, `overrides`, `excludedRowIds`; ao fim mostra as contagens e invalida as queries.
  - `SettingsPage` — CRUD de métodos (nome + cor de uma paleta fixa de 8 cores estilo Notion) e `Sair`.

- [ ] **Step 1: Write the failing tests**

```ts
test('preview lista sugestão mensal "Spotify" marcada e uma inválida "sem data" editável', ...)
test('desmarcar sugestão e preencher data da inválida → commit envia acceptedMonthlyKeys sem ela e overrides com dueDate', ...)
test('criar método "PicPay" aparece na lista', ...)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(web): add Notion import and settings pages`

---

### Task 15: Build único, deploy no Dokploy e runbook

**Files:**
- Modify: `apps/api/src/server.ts` (em produção serve `apps/web/dist` com fallback SPA para rotas fora de `/api`; `GET /api/health → { ok: true }` sem auth)
- Create: `Dockerfile`, `.dockerignore` (inclui `dados_notion_pluton/`, `node_modules`, `.env`), `docs/deploy.md`
- Test: `apps/api/test/static.test.ts`

**Interfaces:**
- Consumes: tudo acima.
- Produces:
  - `Dockerfile` multi-stage (`node:24-alpine`): instala com pnpm, roda `pnpm typecheck && pnpm test` dos pacotes sem banco (`shared`, `web`), builda web e api (api empacotada com `tsup`, `@pluton/shared` embutido); runtime executa `prisma migrate deploy && node dist/server.js`; `EXPOSE 3000`.
  - Variáveis: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (ex.: `https://finances.philipemorais.com`), `PORT=3000`, `NODE_ENV=production` — listadas em `.env.example` sem valores.
  - `docs/deploy.md` (passos que **o usuário** executa): (1) DNS do subdomínio para a VPS; (2) no Dokploy, criar o banco Postgres; (3) criar a aplicação a partir do repositório Git com o `Dockerfile`, configurar envs (gerar o segredo com `openssl rand -base64 32`), domínio com HTTPS (Let's Encrypt) e health check `/api/health`; (4) criar bucket R2 e token S3 com acesso só ao bucket, cadastrar como Destination S3 no Dokploy (endpoint `https://<account-id>.r2.cloudflarestorage.com`, região `auto`); (5) backup agendado diário do Postgres com retenção de 30; (6) **teste de restauração**: restaurar o último backup num banco temporário e conferir contagem de `Entry`; (7) primeiro acesso: criar a conta e importar o CSV do Notion; (8) instalar o PWA no iPhone (Safari → Compartilhar → Adicionar à Tela de Início) e no Mac (Safari → Arquivo → Adicionar ao Dock). Se o domínio usar proxy da Cloudflare, SSL em modo Full (strict).

- [ ] **Step 1: Write the failing test** — `static.test.ts`: com `NODE_ENV=production` e um `dist` de teste, `GET /historico` devolve o `index.html`; `GET /api/health` → `{ ok: true }`; `GET /api/nao-existe` → 404 JSON (não o `index.html`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (`serveStatic` do `@hono/node-server`). **Step 4: Run** → PASS.
- [ ] **Step 5: Verificar o build local:** `docker build -t pluton .` conclui; `docker run` com um Postgres local sobe, `/api/health` responde e a aplicação abre em `http://localhost:3000`.
- [ ] **Step 6: Verificação ponta a ponta manual** (no container local): criar conta → importar o CSV real do usuário → conferir que dez/2026 mostra as mesmas 11 contas pendentes da tabela do Notion e soma igual → criar "Teste 1/3", mudar data da 2/3 com `Esta e as próximas` → marcar pago e desfazer → modo avião no DevTools: dados visíveis, escrita desabilitada.
- [ ] **Step 7: Qualidade antes do deploy (spec §9):** `pnpm audit --prod` sem vulnerabilidades altas/críticas; `pnpm licenses list --prod` sem licenças copyleft fortes (GPL/AGPL) — reportar qualquer achado ao usuário em vez de ignorar.
- [ ] **Step 8: Commit** — `feat: single-container build and Dokploy deploy runbook`
