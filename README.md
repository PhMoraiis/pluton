# Pluton

PWA de finanças pessoais (conta única): despesas, ganhos, parcelas e séries mensais, em BRL, interface em pt-BR. Reescrita do app iOS original em SwiftUI, que está preservado na branch `swift-legacy`.

Especificação: [docs/superpowers/specs/2026-11-18-pluton-pwa-design.md](docs/superpowers/specs/2026-11-18-pluton-pwa-design.md)
Deploy: [docs/deploy.md](docs/deploy.md)

## Stack

- Monorepo pnpm (`apps/*`, `packages/*`), Node 24 LTS, TypeScript estrito
- `packages/shared` (`@pluton/shared`): tipos e utilitários de dinheiro, consumido como fonte TS
- `apps/api` (planejado): API com Postgres, Prisma Migrate e Better Auth
- `apps/web` (planejado): PWA, offline somente leitura
- Testes com Vitest

## Desenvolvimento

```bash
nvm use            # Node 24
pnpm install
cp .env.example .env   # preencha os valores localmente; nunca versione o .env
```

Layout planejado (chega nas próximas tarefas): `docker compose up -d` para o Postgres local, e as apps `api` e `web` em modo dev.

## Testes

```bash
pnpm test        # todos os pacotes
pnpm typecheck   # checagem de tipos em todos os pacotes
```

## Convenções

- Dinheiro sempre em centavos inteiros.
- Datas de vencimento/pagamento são data pura `YYYY-MM-DD`; "hoje" usa `America/Sao_Paulo`.
- Segredos nunca entram no git.
