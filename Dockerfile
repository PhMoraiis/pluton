# syntax=docker/dockerfile:1

# Imagem única do Pluton: API Hono + PWA estático na mesma origem (porta 3000).
# Variáveis em runtime: DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
# (PORT=3000 e NODE_ENV=production já vêm definidos). Veja docs/deploy.md.

ARG NODE_VERSION=24
ARG PNPM_VERSION=11.1.1

# ---------- build: instala, verifica e compila ----------
FROM node:${NODE_VERSION}-alpine AS build
ARG PNPM_VERSION
# openssl: detecção de plataforma dos engines do Prisma (linux-musl-openssl-3.0.x).
RUN apk add --no-cache openssl && npm install -g pnpm@${PNPM_VERSION}
ENV CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /repo

# Manifestos primeiro para reaproveitar o cache da instalação.
# .pnpmfile.cjs entra no checksum do lockfile (remove peers opcionais não usados).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY . .

# Qualidade: typecheck de tudo e testes dos pacotes que não precisam de banco
# (os testes da API exigem Postgres e rodam fora da imagem, com `pnpm test`).
RUN pnpm --filter @pluton/shared --filter @pluton/web --filter @pluton/api typecheck \
 && pnpm --filter @pluton/shared --filter @pluton/web test

# PWA → apps/web/dist; API → apps/api/dist/server.js (tsup, @pluton/shared embutido).
RUN pnpm --filter @pluton/web build && pnpm --filter @pluton/api build

# Pasta autocontida da API com só as dependências de produção (inclui o CLI do
# Prisma para `migrate deploy` e o client gerado já está no bundle).
RUN pnpm --filter @pluton/api deploy --legacy --prod /out/api

# ---------- runtime ----------
FROM node:${NODE_VERSION}-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production \
    PORT=3000 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /app/apps/api

COPY --from=build /out/api/package.json /out/api/prisma.config.ts ./
COPY --from=build /out/api/prisma ./prisma
COPY --from=build /out/api/node_modules ./node_modules
COPY --from=build /out/api/dist ./dist
# O servidor procura o PWA em ../../web/dist relativo a dist/server.js.
COPY --from=build /repo/apps/web/dist /app/apps/web/dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# Migrações versionadas antes de subir (nunca apagam dados).
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node --enable-source-maps dist/server.js"]
