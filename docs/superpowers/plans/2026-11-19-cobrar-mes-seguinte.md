# Cobrar no mês seguinte — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao criar um lançamento, deixar o usuário escolher "Cobrar: Este mês / Próximo mês", com o padrão vindo do método de pagamento (`chargeNextMonth`, ligado no "Cartão de crédito").

**Architecture:** Nova coluna `PaymentMethod.chargeNextMonth` (migração aditiva com um `UPDATE` só dessa coluna), exposta no DTO e na rota `/api/payment-methods`. No web, funções puras em `entryDraft.ts` deslocam a data do rascunho em ±1 mês e lembram a data original; a nova linha (desktop), o formulário de criação (celular) e Configurações → Métodos usam essas funções. A API de criação de lançamentos não muda: ela recebe a data já deslocada.

**Tech Stack:** pnpm monorepo; Hono + zod + Prisma 7.10.1 + Postgres 17; React 19 + TanStack Query v5 + Tailwind v4; vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-19-cobrar-mes-seguinte-design.md` (base: `docs/superpowers/specs/2026-11-19-salario-etiquetas-ordenacao-design.md`). Leia os dois.

## Global Constraints

- **Banco de produção: proibido.** O `.env` da raiz pode apontar para produção. Todo comando `prisma` fora da suíte de testes começa com `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pluton`. Nunca rode `pnpm dev`, `prisma migrate dev`, `prisma db push` ou scripts sem esse prefixo. A suíte de testes já usa `localhost:5433/pluton_test`.
- Não leia nem escreva `.env*` (há regra de permissão) e não leia `dados_notion_pluton/` (dados pessoais). Não faça stage de `.env.example` (alteração do usuário).
- Postgres local: `docker compose -f docker-compose.dev.yml up -d`, porta 5433.
- Migração: `ADD COLUMN "chargeNextMonth" BOOLEAN NOT NULL DEFAULT false` e **um único** `UPDATE "PaymentMethod" SET "chargeNextMonth" = true WHERE "name" = 'Cartão de crédito'`. Nenhum outro dado é alterado.
- A data visível no campo Vencimento é a data enviada no POST. Não há deslocamento escondido no envio.
- Deslocamento: `addMonthsClamped(date, ±1)` de `@pluton/shared` (31/01 vira 28/02 ou 29/02). Voltar para "Este mês" restaura **exatamente** a data de antes do avanço.
- O seletor só existe na **criação** (nova linha e formulário de criação), em Despesas e em Ganhos. A edição de lançamento não muda.
- Textos de interface em português do Brasil, com acentos: grupo "Cobrar", opções "Este mês" e "Próximo mês"; opção em Métodos "Cobrar no mês seguinte".
- Offline é somente leitura: tudo que grava ou edita fica desabilitado com `useCanWrite()` falso.
- Cada task termina com `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pluton pnpm typecheck` e `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pluton pnpm test` verdes na raiz e um commit (mensagem em inglês, Conventional Commits, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).

## Review Focus

1. **PWA antigo em cache** envia `PATCH /api/payment-methods/:id` só com `{ name, color }`: a flag `chargeNextMonth` existente **não** pode ser zerada. Teste na Task 1.
2. **Data limpa ou inválida** no campo e o usuário troca o seletor ou o método: nada quebra, a data fica como está e só o seletor muda. Teste na Task 2.
3. **Fim de mês e virada de ano:** 31/01 → "Próximo mês" dá 28/02 e voltar dá 31/01, não 28/01; 10/12/2026 vai para 10/01/2027. Teste na Task 2.
4. **Método padrão que já cobra no mês seguinte** (ou métodos que chegam depois de abrir a linha): a data já aparece deslocada, e editar a data à mão não a desloca de novo. Teste na Task 3.
5. **Ficar offline com a linha aberta:** as opções do seletor e a opção em Métodos ficam desabilitadas. Teste na Task 3.

---

### Task 1: API — coluna, migração, DTO e rota de métodos

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `PaymentMethod`: `chargeNextMonth Boolean @default(false)`)
- Create: `apps/api/prisma/migrations/20261119230000_charge_next_month/migration.sql` (escrita à mão; conteúdo exato nas Global Constraints)
- Modify: `packages/shared/src/types.ts` (`PaymentMethodDTO.chargeNextMonth: boolean`)
- Modify: `apps/api/src/payment-method-defaults.ts` (`INITIAL_PAYMENT_METHODS`: cada item ganha `chargeNextMonth`, `true` só em "Cartão de crédito")
- Modify: `apps/api/src/routes/payment-methods.ts` (`bodySchema` ganha `chargeNextMonth: z.boolean().optional()`; `select` inclui o campo; POST grava `chargeNextMonth ?? false`; PATCH só inclui o campo em `data` quando ele vier no body)
- Modify: fixtures de `PaymentMethodDTO` nos testes do web (`apps/web/src/test/*.test.tsx`, `sort.test.ts`) com `chargeNextMonth: false` (Cartão de crédito: `true`), para o typecheck continuar verde. Os mocks de `/api/payment-methods` em `import-settings.test.tsx` passam a aceitar `chargeNextMonth` booleano opcional (não booleano → 400) e a aplicá-lo no POST e no PATCH.
- Test: `apps/api/test/migration.test.ts`, `apps/api/test/payment-methods.test.ts`, `apps/api/test/auth.test.ts`

**Interfaces:**
- Produces: `PaymentMethodDTO { id; name; color; sortOrder; chargeNextMonth: boolean }`; body de POST/PATCH `/api/payment-methods`: `{ name, color, chargeNextMonth?: boolean }`.

- [ ] **Step 1: Testes que falham**
  - `migration.test.ts`: novo teste `charge_next_month migration turns on only "Cartão de crédito"`, logo depois do teste existente. Ele roda no mesmo banco, que já tem `init` + `salary_tags`, o usuário `u1` e o método `pm1` 'Pix'. Insere `pm2` 'Cartão de crédito' e `pm3` 'Cartão Nubank' para `u1`, tira um snapshot de `Entry`, aplica `migrationSql('charge_next_month')` e verifica:
    ```ts
    expect(rows).toEqual([
      { id: 'pm1', chargeNextMonth: false },
      { id: 'pm2', chargeNextMonth: true },
      { id: 'pm3', chargeNextMonth: false },
    ]); // SELECT id, "chargeNextMonth" FROM "PaymentMethod" ORDER BY id
    expect(entriesAfter).toEqual(entriesBefore);
    ```
  - `payment-methods.test.ts`:
    - o `toEqual` do teste existente ganha `chargeNextMonth: false`;
    - `POST com chargeNextMonth true grava e devolve true`;
    - `PATCH { chargeNextMonth: true } liga e um PATCH seguinte só com { name, color } mantém true`;
    - `chargeNextMonth não booleano ("sim") → 400 invalid_body`.
  - `auth.test.ts` (ou `payment-methods.test.ts`): `conta nova: só "Cartão de crédito" vem com chargeNextMonth true`, via `GET /api/payment-methods` → `[['Pix',false],['Cartão de crédito',true],['Débito',false],['Boleto',false],['Dinheiro',false]]`.
- [ ] **Step 2:** `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pluton pnpm --filter @pluton/api test`. Esperado: FAIL nos testes novos.
- [ ] **Step 3:** Implementar schema, migração, DTO, seed e rota conforme Files.
- [ ] **Step 4:** Aplicar no banco local de desenvolvimento: `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pluton pnpm --filter @pluton/api exec prisma migrate deploy`. Conferir que não sobra diferença entre schema e migrações: `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pluton pnpm --filter @pluton/api exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` → saída vazia e exit 0. Se o flag tiver outro nome no Prisma 7.10, use o equivalente da ajuda (`prisma migrate diff --help`), sempre com o prefixo local.
- [ ] **Step 5:** typecheck e testes da raiz verdes (Global Constraints).
- [ ] **Step 6:** Commit `feat(api): per-method chargeNextMonth default`.

---

### Task 2: Web — funções puras do rascunho

**Files:**
- Modify: `apps/web/src/lib/entryDraft.ts`
- Test: `apps/web/src/test/charge-month.test.ts` (novo)

**Interfaces:**
- Consumes: `PaymentMethodDTO.chargeNextMonth` (Task 1); `addMonthsClamped` de `@pluton/shared`; `isValidDueDate` e `withMethod` existentes.
- Produces:
  - `EntryDraft` ganha `nextMonth: boolean` e `shiftedFrom: IsoDate | null`. `emptyDraft` e `draftFromEntry` iniciam com `false` / `null`.
  - `setChargeNextMonth(draft: EntryDraft, next: boolean): EntryDraft`
    - mesmo valor: devolve o rascunho sem mudar;
    - data inválida: só troca `nextMonth`;
    - ligar: `shiftedFrom = dueDate`, `dueDate = addMonthsClamped(dueDate, 1)`;
    - desligar: `dueDate = shiftedFrom ?? addMonthsClamped(dueDate, -1)`, `shiftedFrom = null`.
  - `withDueDate(draft: EntryDraft, dueDate: string): EntryDraft`: grava a data digitada e zera `shiftedFrom`; `nextMonth` não muda.
  - `withCreateMethod(draft: EntryDraft, methodId: string, methods: Map<string, PaymentMethodDTO>): EntryDraft` = `setChargeNextMonth(withMethod(draft, methodId, methods), methods.get(methodId)?.chargeNextMonth ?? false)`. "Sem método" (`''`) equivale a `false`.
  - `withMethod`, `draftToCreate` e `draftToPatch` não mudam (a edição continua usando `withMethod`).

- [ ] **Step 1: Testes que falham** em `charge-month.test.ts` (rascunho base: `emptyDraft('2026-11-05', 'm-pix')`, métodos `m-pix` Pix false, `m-card` 'Cartão de crédito' true, `m-card2` 'Cartão Nubank' true):
  - `ligar avança um mês e desligar restaura`: `'2026-11-05'` → `'2026-12-05'` (`shiftedFrom '2026-11-05'`) → `'2026-11-05'`.
  - `fim de mês: 31/01 vai para 28/02 e volta para 31/01`: `'2026-01-31'` → `'2026-02-28'` → `'2026-01-31'`.
  - `virada de ano`: `'2026-12-10'` → `'2027-01-10'`.
  - `mesmo valor não muda nada`: `setChargeNextMonth(d, false)` em rascunho com `nextMonth false` devolve `toEqual(d)`.
  - `data digitada vale como está`: ligar, depois `withDueDate(d, '2027-01-20')` → `dueDate '2027-01-20'`, `shiftedFrom null`, `nextMonth true`; desligar em seguida → `'2026-12-20'`.
  - `data inválida não quebra`: `withDueDate(d, '')`, depois `setChargeNextMonth(…, true)` → `dueDate ''`, `nextMonth true`.
  - `withCreateMethod`:
    - Pix → `m-card` avança;
    - `m-card` → `m-pix` restaura;
    - `m-card` → `''` restaura;
    - `m-card` → `m-card2` não avança duas vezes (`'2026-12-05'`);
    - a chave Pix continua sendo descartada ao sair de Pix (como `withMethod`).
  - `emptyDraft e draftFromEntry começam com nextMonth false e shiftedFrom null`.
- [ ] **Step 2:** `pnpm --filter @pluton/web test charge-month`. Esperado: FAIL (funções não existem).
- [ ] **Step 3:** Implementar conforme Interfaces.
- [ ] **Step 4:** typecheck e testes da raiz verdes.
- [ ] **Step 5:** Commit `feat(web): draft helpers to charge the first installment next month`.

---

### Task 3: Web — seletor na criação e opção em Métodos

**Files:**
- Create: `apps/web/src/components/ChargeMonthToggle.tsx`. Props: `{ value: boolean; onChange: (next: boolean) => void; disabled?: boolean }`. Renderiza `role="radiogroup"` com `aria-label="Cobrar"`, e dois botões `role="radio"` com `aria-checked`, rotulados "Este mês" (`false`) e "Próximo mês" (`true`). O visual (segmentado, compacto) fica com o builder.
- Modify: `apps/web/src/components/NewEntryRow.tsx`
  - `openRow` e o reset após salvar: `withCreateMethod(emptyDraft(defaultDate, ''), defaultMethod, byId)`.
  - `current` com `methodChosen` falso: `withCreateMethod(draft, draft.methodId || defaultMethod, byId)`. Assim, métodos que chegam depois também aplicam o padrão.
  - **Qualquer** edição de data, seletor ou método congela o estado visível: `setDraft(fn(current, …))` e `setMethodChosen(true)`. A data usa `withDueDate`, o seletor `setChargeNextMonth` e o método `withCreateMethod`. Sem isso, o padrão seria reaplicado sobre a data digitada.
  - Na variante `table`, o `ChargeMonthToggle` fica na célula de Vencimento, abaixo do input, com `disabled={disabled}`.
  - A variante `floating` continua passando `initial={current}` ao `EntrySheet`.
- Modify: `apps/web/src/components/EntrySheet.tsx`
  - Só em `mode === 'create'`: `ChargeMonthToggle` junto do campo Vencimento; a data usa `withDueDate`; o select de método usa `withCreateMethod`.
  - Em `mode === 'edit'`, tudo continua como hoje (`set('dueDate')` e `withMethod`, sem seletor).
- Modify: `apps/web/src/components/settings/MethodsSection.tsx`
  - Em cada método da lista, um checkbox "Cobrar no mês seguinte" com `aria-label={\`Cobrar ${m.name} no mês seguinte\`}`.
  - Ao mudar, envia `PATCH /api/payment-methods/:id` com `{ name: m.name, color: m.color, chargeNextMonth }` e invalida `queryKeys.paymentMethods()`.
  - Fica desabilitado sem conexão ou com a mutação pendente; erro via `friendlyError`, como nas outras ações da seção.
- Test: `apps/web/src/test/entries-write.test.tsx`, `apps/web/src/test/import-settings.test.tsx`

**Interfaces:**
- Consumes: `setChargeNextMonth`, `withDueDate`, `withCreateMethod` (Task 2); `PaymentMethodDTO.chargeNextMonth` (Task 1).

- [ ] **Step 1: Testes que falham.** Em `entries-write.test.tsx`, os métodos do mock ficam Pix (`sortOrder 0`, false) e "Cartão de crédito" (`sortOrder 1`, true); o mês padrão do mock é `2026-12`, então a data padrão é `2026-12-05`.
  - `nova linha: Cartão de crédito avança a data e o POST leva a data visível`:
    - abre a linha: Vencimento `'2026-12-05'`, "Este mês" com `aria-checked="true"`;
    - escolhe Cartão de crédito: Vencimento `'2027-01-05'`, "Próximo mês" marcado;
    - digita "Tênis 1/2" e "100,00" e tecla Enter: o body do POST tem `dueDate: '2027-01-05'`.
  - `nova linha: "Este mês" com Cartão volta a data`: o POST leva `dueDate: '2026-12-05'`.
  - `nova linha: data editada à mão não é deslocada de novo`: com Cartão, digita `2027-01-20` no Vencimento e salva → POST com `dueDate: '2027-01-20'`.
  - `método padrão que cobra no mês seguinte já abre com a data avançada`: Cartão com `sortOrder 0` → ao abrir, `'2027-01-05'` e "Próximo mês" marcado; digitar `2027-02-10` mantém `'2027-02-10'` no POST.
  - `celular: formulário de criação tem o seletor e envia a data avançada` (viewport mobile, Cartão → POST `dueDate '2027-01-05'`).
  - `formulário de edição não mostra o seletor Cobrar`: `queryByRole('radiogroup', { name: 'Cobrar' })` → null.
  - `ficar offline com a nova linha aberta desabilita o seletor`.
  - Em `import-settings.test.tsx`:
    - `Métodos: marcar "Cobrar Pix no mês seguinte" envia PATCH com chargeNextMonth true e fica marcado`: confere o body `{ name: 'Pix', color: <cor do fixture>, chargeNextMonth: true }`;
    - `Métodos: opção desabilitada offline`.
- [ ] **Step 2:** `pnpm --filter @pluton/web test entries-write import-settings`. Esperado: FAIL nos testes novos.
- [ ] **Step 3:** Implementar conforme Files.
- [ ] **Step 4:** typecheck e testes da raiz verdes, e `pnpm --filter @pluton/web build` sem erro.
- [ ] **Step 5:** Commit `feat(web): choose this month or next month when creating an entry`.

---

## Depois das tasks

- PR para `main`. O merge dispara o deploy no Dokploy, que roda `prisma migrate deploy`. **Antes do merge, faça o backup manual no R2** (runbook `docs/deploy.md`, seção de backups) e a revisão humana por pares.
- Se o usuário tiver renomeado o "Cartão de crédito" em produção, a migração não liga a opção; ele liga à mão em Configurações → Métodos (está no spec).
