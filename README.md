# Pluton

PWA de finanças pessoais (conta única): despesas, ganhos, parcelas e séries mensais, em BRL, interface em pt-BR. Reescrita do app iOS original em SwiftUI, que está preservado na branch `swift-legacy`.

Especificação: [docs/superpowers/specs/2026-11-18-pluton-pwa-design.md](docs/superpowers/specs/2026-11-18-pluton-pwa-design.md)
Deploy: [docs/deploy.md](docs/deploy.md)

## Stack

- Monorepo pnpm (`apps/*`, `packages/*`), Node 24 LTS, TypeScript estrito
- `packages/shared` (`@pluton/shared`): tipos e utilitários de dinheiro, consumido como fonte TS
- `apps/api` (`@pluton/api`): API Hono com Postgres, Prisma Migrate e Better Auth (rotas em `/api`)
- `apps/web` (`@pluton/web`): PWA React + Vite + TanStack Query + Tailwind, offline somente leitura
- Testes com Vitest

## Desenvolvimento

```bash
nvm use            # Node 24
pnpm install
cp .env.example .env   # preencha os valores localmente; nunca versione o .env
```

```bash
docker compose -f docker-compose.dev.yml up -d --wait   # Postgres local (porta 5433)
pnpm --filter @pluton/api migrate:deploy                # aplica as migrações
pnpm dev                                                # api (:3000) + web (:5173) juntos
```

Abra `http://localhost:5173`. O Vite faz proxy de `/api` para a API, então o app roda na mesma origem; em dev, `BETTER_AUTH_URL` precisa ser `http://localhost:5173` (a origem do navegador), senão o Better Auth recusa o login com `INVALID_ORIGIN`. Em produção é a URL pública do app.

Build do PWA: `pnpm --filter @pluton/web build` (saída em `apps/web/dist`). Ícones: `pnpm --filter @pluton/web icons` regera os PNGs de `apps/web/public`.

## Testes

```bash
pnpm test        # todos os pacotes
pnpm typecheck   # checagem de tipos em todos os pacotes
```

## Convenções

- Dinheiro sempre em centavos inteiros.
- Datas de vencimento/pagamento são data pura `YYYY-MM-DD`; "hoje" usa `America/Sao_Paulo`.
- Segredos nunca entram no git.
