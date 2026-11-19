# Deploy do Pluton no Dokploy

Runbook para colocar o Pluton em produção na VPS com **Dokploy**: um único container (API + PWA na mesma origem, porta 3000) atrás do Traefik do Dokploy, Postgres como serviço de banco do Dokploy e backups diários num bucket **Cloudflare R2**.

Todos os passos abaixo são executados **por você** (painéis do DNS, Dokploy e Cloudflare). Segredos (senha do Postgres, `BETTER_AUTH_SECRET`, credenciais do R2) são criados por você e ficam só no Dokploy — nunca no git.

Exemplo de domínio usado aqui: `finances.philipemorais.com` (troque pelo seu).

## O que a imagem faz

- `Dockerfile` multi-stage (`node:24-alpine`): instala com pnpm, roda typecheck de todos os pacotes e os testes de `shared` e `web` (os da API precisam de Postgres e rodam fora da imagem), builda o PWA (`apps/web/dist`) e a API (`apps/api/dist/server.js`, empacotada com `tsup`, `@pluton/shared` embutido).
- Ao iniciar: `prisma migrate deploy` (migrações versionadas; nunca apagam dados) e depois `node dist/server.js`.
- Em `NODE_ENV=production` o servidor serve o PWA: arquivos estáticos, fallback do SPA (`/historico`, `/periodo`... devolvem o `index.html`), e a API sob `/api`. Rota inexistente da API → `404` em JSON.
- `GET /api/health` → `{ "ok": true }` (sem autenticação, sem tocar no banco). A imagem já declara um `HEALTHCHECK` nessa rota.
- Cabeçalhos de segurança em todas as respostas: CSP estrita (`default-src 'self'`, sem script/estilo inline, `object-src 'none'`, `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, HSTS.
- Better Auth: cookies `Secure` em produção; rate limit por IP do cliente lido de `X-Forwarded-For`/`X-Real-Ip`, que o Traefik reescreve com o IP real.

## Variáveis de ambiente

| Variável | Produção | Observação |
| --- | --- | --- |
| `DATABASE_URL` | obrigatória | URL **interna** do Postgres do Dokploy, ex.: `postgresql://<usuário>:<senha>@<host-interno>:5432/pluton` |
| `BETTER_AUTH_SECRET` | obrigatória | Gere você mesmo: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | obrigatória | URL pública, sem barra no final: `https://finances.philipemorais.com` |
| `PORT` | `3000` (padrão da imagem) | Porta interna do container |
| `NODE_ENV` | `production` (padrão da imagem) | Liga o PWA estático e os cookies seguros |
| `WEB_DIST_DIR` | opcional | Só se mudar o local do build do PWA (padrão `apps/web/dist`) |
| `DATABASE_URL_TEST` | não usar | Só para a suíte de testes local da API |

## 1. DNS

No provedor de DNS do domínio, crie um registro `A` (e `AAAA`, se a VPS tiver IPv6) para `finances` apontando para o IP da VPS.

Se o domínio estiver na **Cloudflare**:

- Deixe o registro como **DNS only** (nuvem cinza) até o Dokploy emitir o certificado Let's Encrypt (passo 3). Depois, se quiser o proxy (nuvem laranja), ative-o e configure **SSL/TLS → Full (strict)**. Nunca use `Flexible`.
- Com o proxy ligado, o Traefik enxerga o IP da Cloudflare, não o do cliente: o rate limit do login passa a ser por servidor de borda da Cloudflare (ainda funciona, só fica menos preciso). Sem proxy, é por IP do cliente.

## 2. Banco Postgres no Dokploy

1. No projeto do Dokploy: **Create Service → Database → PostgreSQL**.
2. Nome `pluton-db`, banco `pluton`, usuário `pluton` e uma senha forte (gere você, ex.: `openssl rand -base64 32`, ou use o gerador do Dokploy).
3. **Não** exponha porta externa. Faça o deploy do banco.
4. Copie a **Internal Connection URL** — ela vira o `DATABASE_URL` da aplicação.

## 3. Aplicação a partir do repositório Git

1. **Create Service → Application**, nome `pluton`.
2. **Provider:** o repositório Git do Pluton, branch `main` (ou a que você usa para produção).
3. **Build Type:** `Dockerfile`, caminho `Dockerfile`, contexto `.`.
4. **Environment:** cadastre (sem aspas):

   ```
   DATABASE_URL=<Internal Connection URL do passo 2>
   BETTER_AUTH_SECRET=<saída de: openssl rand -base64 32>
   BETTER_AUTH_URL=https://finances.philipemorais.com
   PORT=3000
   NODE_ENV=production
   ```

   Gere o segredo no seu computador com `openssl rand -base64 32` e cole só no Dokploy. Trocar o segredo depois invalida as sessões abertas (basta entrar de novo).
5. **Domains:** host `finances.philipemorais.com`, path `/`, container port `3000`, **HTTPS ligado**, certificado **Let's Encrypt**.
6. **Health check:** a imagem já traz `HEALTHCHECK` em `GET /api/health`. Se quiser configurar também no Dokploy (Advanced → Swarm Settings → Health Check), use a mesma rota `/api/health` na porta 3000.
7. Não publique a porta 3000 diretamente na VPS: o acesso deve passar só pelo Traefik (é ele quem garante o `X-Forwarded-For` usado pelo rate limit).
8. **Deploy.** Nos logs, deve aparecer o `prisma migrate deploy` aplicando as migrações e depois `Pluton ouvindo em http://localhost:3000 (PWA de ...)`.
9. Confira: `curl https://finances.philipemorais.com/api/health` → `{"ok":true}`.

Atualizações: faça push na branch configurada e clique em **Deploy** (ou ligue o auto deploy por webhook). As migrações novas rodam sozinhas no start.

## 4. Bucket R2 e destino S3 no Dokploy

1. Cloudflare → **R2 → Create bucket**, ex.: `pluton-backups` (localização automática).
2. **R2 → Manage API Tokens → Create API token**: permissão **Object Read & Write**, aplicada **só ao bucket** `pluton-backups`. Guarde o **Access Key ID** e o **Secret Access Key** (só aparecem uma vez) e anote o **Account ID**.
3. Dokploy → **Settings → S3 Destinations → Add**:
   - Provider: Cloudflare R2 (ou S3 compatível)
   - Access Key / Secret Key: as do token
   - Bucket: `pluton-backups`
   - Region: `auto`
   - Endpoint: `https://<account-id>.r2.cloudflarestorage.com`
4. **Test connection** e salve.

## 5. Backup diário do Postgres

1. No serviço `pluton-db` → **Backups → Create Backup**.
2. Destination: o R2 do passo 4; Database: `pluton`; prefixo, ex.: `pluton/`.
3. Agenda diária, ex.: `0 6 * * *` (06:00 UTC = 03:00 em São Paulo).
4. **Keep the latest:** `30` (retenção de 30 backups).
5. Salve e rode um backup manual uma vez; confira o arquivo no bucket R2.

## 6. Teste de restauração (faça ao menos uma vez)

Backup que nunca foi restaurado não é backup. Depois do primeiro backup com dados (passo 7):

1. No banco de produção, anote a contagem de lançamentos. No terminal do serviço `pluton-db` no Dokploy:

   ```bash
   psql -U pluton -d pluton -c 'SELECT count(*) FROM "Entry";'
   ```

2. Crie um Postgres **temporário** no Dokploy (ex.: `pluton-restore-test`, banco `pluton`).
3. Restaure o último backup do R2 nesse banco temporário (Backups → **Restore**, escolhendo o banco temporário como alvo). Alternativa manual: baixe o arquivo do R2 e rode `gunzip -c <arquivo>.sql.gz | psql -U <usuário> -d pluton` no banco temporário.
4. Rode a mesma contagem no banco temporário: deve bater com a do passo 1 (descontando lançamentos criados depois do backup).
5. Apague o banco temporário.

Nunca restaure por cima do banco de produção para "testar".

## 7. Primeiro acesso

1. Abra `https://finances.philipemorais.com`.
2. Crie a conta (o cadastro só é aceito enquanto não existir nenhum usuário; depois fica desabilitado).
3. Vá em **Importar** e envie o CSV exportado do Notion (`Despesas ..._all.csv`); revise a prévia e confirme.
4. Confira um mês conhecido (ex.: dez/2026) contra a tabela do Notion.

## 8. Instalar o PWA

- **iPhone:** abra o endereço no Safari → **Compartilhar** → **Adicionar à Tela de Início**.
- **Mac:** abra no Safari → **Arquivo** → **Adicionar ao Dock**.

Sem conexão, o app abre com os últimos dados carregados, em modo **somente leitura**.

## Verificação local da imagem (opcional)

Com o Postgres de desenvolvimento rodando (`docker compose -f docker-compose.dev.yml up -d --wait`) e um banco descartável criado nele:

```bash
docker build -t pluton .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5433/<banco-descartável> \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  -e BETTER_AUTH_URL=http://localhost:3000 \
  pluton
curl http://localhost:3000/api/health   # {"ok":true}
```

As credenciais `postgres/postgres` são só do Postgres local de desenvolvimento. Em produção os cookies são `Secure`: navegadores baseados em Chromium aceitam isso em `http://localhost`; o Safari pode não aceitar, então teste o login local no Chrome.
