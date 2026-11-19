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
docker compose -f docker-compose.dev.yml up -d --wait   # Postgres local (porta 5433, cria também o banco pluton_test)
pnpm --filter @pluton/api migrate:deploy                # aplica as migrações
pnpm dev                                                # api (:3000) + web (:5173) juntos
```

Abra `http://localhost:5173`. O Vite faz proxy de `/api` para a API, então o app roda na mesma origem; em dev, `BETTER_AUTH_URL` precisa ser `http://localhost:5173` (a origem do navegador), senão o Better Auth recusa o login com `INVALID_ORIGIN`. Em produção é a URL pública do app.

Build do PWA: `pnpm --filter @pluton/web build` (saída em `apps/web/dist`). Ícones: `pnpm --filter @pluton/web icons` regera os PNGs de `apps/web/public`.
Build da API: `pnpm --filter @pluton/api build` (bundle `tsup` em `apps/api/dist/server.js`).

### Variáveis de ambiente

O `.env` da raiz é lido pela API (`tsx --env-file-if-exists`) e pelo `prisma.config.ts`. O `.env.example` lista só os nomes:

| Variável | Dev local | Produção |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5433/pluton` (Postgres do compose; credenciais só locais) | URL interna do Postgres do Dokploy |
| `BETTER_AUTH_SECRET` | gere com `openssl rand -base64 32` | gere com `openssl rand -base64 32` (só no Dokploy) |
| `BETTER_AUTH_URL` | `http://localhost:5173` | `https://finances.philipemorais.com` |
| `PORT` | `3000` | `3000` (padrão da imagem) |
| `NODE_ENV` | `development` | `production` (padrão da imagem) |
| `BETTER_AUTH_TRUSTED_PROXIES` | — | opcional; veja [docs/deploy.md](docs/deploy.md#proxy-e-ip-do-cliente) |
| `DATABASE_URL_TEST` | opcional; padrão `postgresql://postgres:postgres@localhost:5433/pluton_test` | — |

## Testes

```bash
docker compose -f docker-compose.dev.yml up -d --wait   # a suíte da API precisa do Postgres
pnpm test        # todos os pacotes (a API aplica as migrações no banco de testes antes)
pnpm typecheck   # checagem de tipos em todos os pacotes
```

Os testes da API usam `DATABASE_URL_TEST` (padrão: banco `pluton_test` do compose) e truncam as tabelas a cada teste — nunca aponte para um banco com dados reais.

## Produção

Imagem única (API + PWA na mesma origem, porta 3000): `docker build -t pluton .`. No start, o container roda `prisma migrate deploy` e serve o PWA com CSP estrita. Passo a passo do Dokploy, backups no Cloudflare R2 e teste de restauração: [docs/deploy.md](docs/deploy.md).

Antes de cada deploy: `pnpm audit --prod` e `pnpm licenses list --prod`.

## Convenções

- Dinheiro sempre em centavos inteiros.
- Datas de vencimento/pagamento são data pura `YYYY-MM-DD`; "hoje" usa `America/Sao_Paulo`.
- Segredos nunca entram no git.
