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
- Better Auth: cookies `Secure` em produção; rate limit por IP do cliente lido de `X-Forwarded-For`, que o Traefik reescreve com o IP real (veja [Proxy e IP do cliente](#proxy-e-ip-do-cliente)).

## Variáveis de ambiente

| Variável | Produção | Observação |
| --- | --- | --- |
| `DATABASE_URL` | obrigatória | URL **interna** do Postgres do Dokploy, ex.: `postgresql://<usuário>:<senha>@<host-interno>:5432/pluton` |
| `BETTER_AUTH_SECRET` | obrigatória | Gere você mesmo: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | obrigatória | URL pública, sem barra no final: `https://finances.philipemorais.com` |
| `PORT` | `3000` (padrão da imagem) | Porta interna do container |
| `NODE_ENV` | `production` (padrão da imagem) | Liga o PWA estático e os cookies seguros |
| `BETTER_AUTH_TRUSTED_PROXIES` | opcional | IPs/CIDRs separados por vírgula dos proxies que o Traefik foi configurado para confiar (ex.: faixas da Cloudflare). Veja [Proxy e IP do cliente](#proxy-e-ip-do-cliente) |
| `WEB_DIST_DIR` | opcional | Só se mudar o local do build do PWA (padrão `apps/web/dist`) |
| `DATABASE_URL_TEST` | não usar | Só para a suíte de testes local da API |

## 1. DNS

No provedor de DNS do domínio, crie um registro `A` (e `AAAA`, se a VPS tiver IPv6) para `finances` apontando para o IP da VPS.

Se o domínio estiver na **Cloudflare**:

- Deixe o registro como **DNS only** (nuvem cinza) até o Dokploy emitir o certificado Let's Encrypt (passo 3). Depois, se quiser o proxy (nuvem laranja), ative-o e configure **SSL/TLS → Full (strict)**. Nunca use `Flexible`.
- Com o proxy ligado, o rate limit do login muda de comportamento — veja [Proxy e IP do cliente](#proxy-e-ip-do-cliente).

## 2. Banco Postgres no Dokploy

1. No projeto do Dokploy: **Create Service → Database → PostgreSQL**.
2. Nome `pluton-db`, banco `pluton`, usuário `pluton` e uma senha forte gerada por você com `openssl rand -hex 32` (ou o gerador do Dokploy, se ele só usar letras e números). Use **hex** para a senha do banco: a saída de `base64` pode conter `/`, `+` e `=`, que quebram a `DATABASE_URL` (o `/` é lido como início do nome do banco). O `base64` continua certo para o `BETTER_AUTH_SECRET`, que não vai dentro de URL.
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
10. **Crie a conta imediatamente**, logo depois do primeiro deploy bem-sucedido (antes de seguir para os passos 4–8): abra `https://finances.philipemorais.com` e crie a conta única. Enquanto não existir nenhum usuário, o cadastro está **aberto para qualquer pessoa** que chegar ao domínio — e quem criar a primeira conta fica com o app (a spec, §4, deixa explícito que cadastro aberto para estranhos é um anti-objetivo; o cadastro só se fecha sozinho depois da primeira conta).
11. Confirme que o cadastro fechou:

    ```bash
    curl https://finances.philipemorais.com/api/setup-status   # {"hasUser":true}
    ```

    Se aparecer `{"hasUser":false}`, a conta não foi criada: volte ao passo 10 agora. Se aparecer `{"hasUser":true}` sem que **você** tenha criado a conta, alguém chegou antes: veja [Conta criada por outra pessoa](#conta-criada-por-outra-pessoa).

Atualizações: faça push na branch configurada e clique em **Deploy** (ou ligue o auto deploy por webhook). As migrações novas rodam sozinhas no start.

**Antes de fazer deploy de uma migração nova** (qualquer commit que adicione uma pasta em `apps/api/prisma/migrations/`), rode um **backup manual** do `pluton-db` (no serviço `pluton-db` → **Backups**, dispare o backup configurado no passo 5 manualmente) e confira o arquivo no R2. As migrações são versionadas e não apagam dados de propósito, mas o backup recente é o caminho de volta se uma delas der errado. O container faz desligamento gracioso no `SIGTERM` do redeploy (fecha o servidor HTTP e o Prisma), então o deploy não precisa esperar o `SIGKILL`.

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
3. Restaure o último backup do R2 nesse banco temporário (Backups → **Restore**, escolhendo o banco temporário como alvo). Alternativa manual: os backups do Dokploy são `pg_dump -Fc` (formato custom) comprimido com gzip, então baixe o arquivo do R2 e, no banco **temporário**, rode:

   ```bash
   gunzip -c <arquivo>.sql.gz | pg_restore -U <usuário> -d <banco_temporário> --no-owner --no-acl
   ```
4. Rode a mesma contagem no banco temporário: deve bater com a do passo 1 (descontando lançamentos criados depois do backup).
5. Apague o banco temporário.

Nunca restaure por cima do banco de produção para "testar".

## 7. Primeiro acesso

A conta já foi criada no passo 3.10 (e `GET /api/setup-status` devolve `{"hasUser":true}`).

1. Entre em `https://finances.philipemorais.com`.
2. Vá em **Importar** e envie o CSV exportado do Notion (`Despesas ..._all.csv`); revise a prévia e confirme.
3. Confira um mês conhecido (ex.: dez/2026) contra a tabela do Notion.

## 8. Instalar o PWA

- **iPhone:** abra o endereço no Safari → **Compartilhar** → **Adicionar à Tela de Início**.
- **Mac:** abra no Safari → **Arquivo** → **Adicionar ao Dock**.

Sem conexão, o app abre com os últimos dados carregados, em modo **somente leitura**.

## Recuperar a senha

Não há "esqueci a senha" no app (conta única, sem e-mail). Para definir uma senha nova, gere o hash com a mesma função do Better Auth que o app usa e grave-o direto no banco.

> **NUNCA apague a linha do usuário (`"user"`) para "recomeçar" o cadastro.** As tabelas `account`, `session`, `PaymentMethod`, `Series` e `Entry` têm `onDelete: Cascade` para o usuário: apagar o usuário **apaga todos os lançamentos, séries e métodos**. Para trocar a senha, altere só `account.password`, como abaixo.

1. Faça um backup manual do `pluton-db` antes (no serviço `pluton-db` → **Backups**, dispare o backup manualmente).
2. No Dokploy, abra o **terminal do container da aplicação** `pluton` (ele já tem o Better Auth instalado em `/app/apps/api/node_modules`) e gere o hash. A senha é lida sem eco e passada por variável de ambiente — não fica no histórico do shell nem na linha de comando:

   ```sh
   cd /app/apps/api
   printf 'Nova senha (mín. 8 caracteres): '; stty -echo; read -r PLUTON_PW; stty echo; echo
   PLUTON_PW="$PLUTON_PW" node --input-type=module -e "
   import { hashPassword } from 'better-auth/crypto';
   const pw = process.env.PLUTON_PW ?? '';
   if (pw.length < 8) { console.error('Senha curta demais.'); process.exit(1); }
   console.log(await hashPassword(pw));
   "
   unset PLUTON_PW
   ```

   A saída é uma linha `salt:hash` em hexadecimal (scrypt, o formato do Better Auth 1.7). Ela não é a senha, mas trate-a como segredo: não cole em chat, issue ou commit.
3. No **terminal do serviço `pluton-db`**, grave o hash na conta de e-mail e senha e encerre as sessões abertas (todos os aparelhos precisarão entrar de novo):

   ```bash
   psql -U pluton -d pluton
   ```

   ```sql
   BEGIN;
   UPDATE "account" SET password = '<linha salt:hash do passo 2>', "updatedAt" = now()
     WHERE "providerId" = 'credential';   -- deve responder UPDATE 1
   DELETE FROM "session";                  -- só sessões; nenhum dado financeiro
   COMMIT;
   ```

   Se o `UPDATE` não responder `UPDATE 1`, rode `ROLLBACK;` e não continue.
4. Entre no app com a senha nova.

O procedimento é coberto por um teste da API (`apps/api/test/auth.test.ts`, "recuperação de senha do runbook"), que quebra se uma atualização do Better Auth mudar o formato do hash.

## Conta criada por outra pessoa

Se `GET /api/setup-status` devolveu `{"hasUser":true}` sem que você tenha criado a conta (passo 3.11) e o banco ainda não tem dados seus, o banco é novo e pode ser recriado do zero: apague o serviço `pluton-db` no Dokploy, crie outro (passo 2, com senha nova), atualize a `DATABASE_URL` da aplicação, faça o deploy e crie a conta imediatamente. Isso só vale **antes** de importar ou lançar qualquer dado — depois disso, nunca apague o banco nem a linha do usuário.

## Proxy e IP do cliente

O rate limit do login (Better Auth) é por IP do cliente, lido do `X-Forwarded-For`. Isso só é confiável porque o Traefik do Dokploy, na configuração padrão, **descarta** o `X-Forwarded-For` enviado pelo cliente e grava o IP de quem abriu a conexão.

- **Nunca** ligue `forwardedHeaders.insecure` no Traefik: qualquer cliente poderia forjar o IP e escapar do rate limit trocando o header.
- Não publique a porta 3000 fora do Traefik (passo 3.7).
- O Better Auth ignora um `X-Forwarded-For` com mais de um IP, a não ser que `BETTER_AUTH_TRUSTED_PROXIES` liste os proxies que anexaram os IPs extras.

**Sem proxy da Cloudflare (nuvem cinza):** nada a configurar; o rate limit é por IP do cliente.

**Com proxy da Cloudflare (nuvem laranja)**, há dois caminhos:

1. **Não fazer nada.** O Traefik vê o IP do servidor de borda da Cloudflare e o grava no `X-Forwarded-For`. O rate limit passa a ser por servidor de borda: clientes diferentes que caem no mesmo servidor de borda dividem o mesmo balde (um atacante pode esgotar o limite de login de quem estiver no mesmo servidor de borda por alguns segundos, e o limite fica menos preciso). Para uma conta única, é aceitável.
2. **IP real do cliente.** No Traefik do Dokploy, configure o entrypoint HTTPS com `forwardedHeaders.trustedIPs` contendo as faixas publicadas pela Cloudflare (https://www.cloudflare.com/ips/), para o Traefik preservar o `X-Forwarded-For` que a Cloudflare envia. Depois, na aplicação, defina `BETTER_AUTH_TRUSTED_PROXIES` com **as mesmas faixas**, separadas por vírgula. O Better Auth percorre a cadeia da direita para a esquerda, pula os proxies confiáveis e usa o primeiro IP não confiável (o do cliente). Mantenha as duas listas iguais e atualizadas; um proxy confiável a mais permite forjar o IP.

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
