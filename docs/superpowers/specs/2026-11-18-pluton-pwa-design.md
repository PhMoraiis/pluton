# Pluton PWA — Design

**Data:** 2026-11-18 · **Status:** rascunho para aprovação

## 1. Intenção e porquê

O usuário mantém hoje todo o controle financeiro pessoal numa tabela do Notion (colunas Date, Name, Amount, Payment Method, Pago; filtro "Pago: desmarcadas" + "Date: próximo mês"; soma no rodapé; e uma visão de histórico em colunas por mês, com o total de cada mês).

O Pluton passa a ser **essa tabela com superpoderes**, usada no **Mac e no iPhone, sincronizada**. A maior dor de hoje é manual: todo mês duplicar linhas, trocar a data e incrementar o número da parcela ("Fone 2/7" → "Fone 3/7"), e corrigir tudo à mão quando uma data muda.

O usuário **não vai pagar o Apple Developer Program**. Por isso:
- sync via backend próprio na VPS dele (não iCloud);
- cliente **PWA em React** (sem o limite de 7 dias de apps assinados com conta gratuita, que vale também para React Native).

## 2. Objetivos

1. Duas tabelas integradas — **Despesas** e **Ganhos** — com a cara da tabela do Notion: Data, Nome, Valor, Método de pagamento, Pago/Recebido; soma no rodapé.
2. **Parcelas automáticas:** digitar um nome terminando em `x/y` (ex.: "Fone 1/7") cria a série e gera as parcelas seguintes, uma por mês.
3. **Recorrência mensal sem fim** (ex.: Spotify) via marcação "mensal", até o usuário encerrar.
4. **Edição propagável:** ao alterar data ou valor de uma parcela, perguntar "só esta" ou "esta e as próximas".
5. **Métodos de pagamento**, com **chave Pix opcional de quem recebe** (sem chave, fica apenas "Pix", como hoje) e botão de copiar a chave.
6. **Marcar como pago** tira a linha da tabela principal e a leva ao **histórico**, que reproduz a visão em colunas por mês com total mensal.
7. **Filtros inteligentes por mês** (ver §6.4).
8. **Resumo do mês** com três números: total de despesas, total de ganhos e ganhos − despesas. O **realizado** só aparece ao analisar um **período** de vários meses (ver §6.5).
9. **Importar o CSV exportado do Notion** para trazer os dados atuais.
10. Instalável como app no iPhone (tela inicial) e no Mac (Dock), com sync entre os dois.

## 3. Não-objetivos (v1)

- Metas, Investimentos e Previsão (abas do app Swift atual) — **removidos por decisão do usuário**.
- Categorias de gasto (a tabela do Notion não tem; pode voltar depois).
- Gestão de cartão de crédito / faturas detalhadas (a fatura entra como uma linha, ex.: "Nubank").
- Integração bancária / Open Finance, multi-moeda, multiusuário, compartilhamento.
- App nativo iOS/macOS. (Se um dia houver conta paga, o PWA pode ser empacotado com Capacitor.)
- Uso completo offline (ver §5).
- Notificações de vencimento (candidato a v2).

## 4. Anti-objetivos (seria fracasso mesmo funcionando)

- **Perder dados financeiros** (sem backup, migração destrutiva — o app Swift atual apaga o banco quando o schema falha; isso não pode se repetir).
- Lançar uma conta ser **mais lento que no Notion**.
- Dados expostos publicamente ou cadastro aberto para estranhos.
- Somas erradas por arredondamento.

## 5. Restrições

- Sem Apple Developer Program → nada de iCloud, Sign in with Apple, passkeys ou app nativo instalado.
- Hospedagem na VPS do usuário, que roda **Dokploy**; **exige subdomínio com HTTPS** (PWA e cookies/tokens de login dependem disso).
- Stack escolhida pelo usuário: **Node + Prisma + Postgres**; login com **Better Auth** (preferido ao Clerk por rodar no próprio backend e manter os dados no Postgres do usuário).
- **Offline: só leitura (confirmado pelo usuário).** A última versão carregada da tabela e do histórico fica disponível sem internet. Sem conexão, o app **bloqueia** criar, editar, excluir e marcar pago: botões desabilitados e aviso visível de "offline" — nada é enfileirado nem perdido silenciosamente.
- Idioma pt-BR, moeda BRL, fuso `America/Sao_Paulo`.

## 6. Comportamento decidido

### 6.1 Lançamentos e séries

- Todo lançamento tem: tipo (despesa | ganho), nome, valor, data de vencimento, método de pagamento, chave Pix opcional, nota opcional, e data de pagamento/recebimento (vazia = pendente).
- **Detecção de parcela:** se o nome termina em `<x>/<y>` (com ou sem espaços ao redor da barra, `1 ≤ x ≤ y`), o app cria uma **série parcelada**: nome-base ("Fone"), total `y`, e gera os lançamentos de `x` até `y`, um por mês, a partir da data informada. Parcelas anteriores a `x` não são criadas (caso de quem já está no meio da série). O nome exibido continua no formato "Fone 3/7".
- **Recorrência mensal:** marcação explícita "mensal" (sem `x/y`). Repete todo mês até o usuário encerrar a série.
- Vale para despesas e ganhos (ex.: salário mensal).
- **Dia do mês:** se o dia não existe no mês (ex.: 31 em fevereiro), usa o último dia do mês.

### 6.2 Edição e exclusão em séries

- Alterar **data** ou **valor** de um lançamento de série → perguntar **"Só esta"** ou **"Esta e as próximas"**.
  - "Esta e as próximas" com data: as parcelas seguintes mantêm a cadência mensal a partir da nova data (parcela 4 vai para 10/jan → parcela 5 em 10/fev, etc.).
  - Lançamentos **já pagos nunca são alterados** pela propagação.
- Excluir → "Só esta", "Esta e as próximas" ou "Série inteira" (pagas preservadas, salvo confirmação explícita).
- Alterar o nome-base ou o total de parcelas de uma série ajusta a série (chamada do builder sobre a UX exata).

### 6.3 Pago / Recebido e histórico

- Marcar como pago grava a data de pagamento; a linha **sai da tabela principal** (com opção de desfazer imediato).
- **Mês de referência = mês do vencimento**, não do pagamento (conta que vence 5/dez e é paga 28/nov conta em dezembro, no histórico e no resumo) — igual ao agrupamento por Date do Notion. *(Chamada do Claude.)*
- **Histórico:** visão em colunas, uma por mês, com cartões (nome, valor, método) e o total do mês no cabeçalho — como a visão de quadro do Notion. Alternância Despesas / Ganhos. Desmarcar "pago" a partir do histórico devolve o lançamento à tabela.

### 6.4 Filtros

- **Padrão:** pendentes do mês do **próximo vencimento pendente** — evolução "inteligente" do filtro "Pago: desmarcadas + próximo mês" usado hoje. Ex.: em 18/nov, com conta pendente vencendo 25/nov, mostra novembro; sem pendências em novembro, mostra dezembro. *(Chamada do Claude.)*
- **Atrasados** (pendentes com vencimento já passado) aparecem sempre no topo, destacados em vermelho, qualquer que seja o mês selecionado — nada some porque o mês virou.
- Seletor de mês (anterior/próximo), atalhos "Este mês", "Próximo mês", "Todos os pendentes"; filtro por método de pagamento; busca por nome.

### 6.5 Resumo do mês

Para o mês selecionado, três números:
1. **Total de despesas** (todas as despesas do mês, pagas ou não)
2. **Total de ganhos** (todos os ganhos do mês, recebidos ou não)
3. **Ganhos − Despesas**

**Análise por período** (usuário escolhe um intervalo de meses, ex.: jan–jun): os mesmos três totais somados no período, mais o **realizado** = ganhos recebidos − despesas pagas no período. O usuário considera o realizado irrelevante no mês isolado; ele só aparece aqui. *(Formato da tela de período é chamada do builder.)*

A tabela mantém **contagem e soma no rodapé**, como no Notion, refletindo os filtros ativos.

### 6.6 Métodos de pagamento e Pix

- Lista editável de métodos (inicial: Pix, Cartão de crédito, Débito, Boleto, Dinheiro), exibidos como etiqueta colorida como no Notion.
- Quando o método é Pix, campo opcional **chave Pix de quem recebe**; se preenchida, botão "copiar chave" na linha/cartão. A chave pertence ao lançamento/série (é de quem recebe), não ao método.

### 6.7 UI

- **Mac / tela larga:** tabela estilo Notion — tema escuro, edição inline das células, "+ Nova linha" no fim, rodapé com contagem e soma, etiquetas coloridas, seta vermelha/verde indicando despesa/ganho.
- **iPhone:** a mesma informação como lista de cartões (como o Notion mobile), com ação rápida de marcar pago.
- Lançar uma conta deve ser tão rápido quanto no Notion: foco no teclado, Enter para salvar, valor com máscara BRL.

### 6.8 Importação do Notion

- **Só despesas:** o Notion não tem ganhos hoje; os ganhos começam do zero no app.
- **Fonte:** o export do usuário está em `dados_notion_pluton/` (**fora do git** — contém dados pessoais). O arquivo a importar é o banco completo `Despesas <id>_all.csv` (307 linhas, set/2024 → dez/2026); os outros CSVs são apenas visões filtradas do mesmo banco e devem ser ignorados.
- **Formato real verificado:**
  - Colunas: `Name, Amount, Created, Date, Mês, Notes, Pago, Payment Method, Receipt` (UTF-8 com BOM). Usar `Name`, `Amount`, `Date`, `Pago`, `Payment Method`; `Notes` vira nota se preenchida; `Mês` e `Receipt` vêm vazios; `Created` ignorado.
  - `Date` em pt-BR por extenso: `5 de dezembro de 2026`. Dia de vencimento varia por conta (5, 3, 10, 4…), então cada série guarda o próprio dia.
  - `Amount`: `R$ 630,00` com **espaço não separável (U+00A0)** após `R$`, ponto de milhar e vírgula decimal.
  - `Pago`: `Yes`/`No` (287 pagas, 20 pendentes).
  - `Payment Method`: `Pix`, `Cartão`, `Dinheiro` ou vazio → viram os métodos iniciais; vazio = sem método.
- **Sujeira real a tratar na prévia:** 3 linhas sem data, 1 sem nome, 1 sem valor, nomes-rascunho ("Nova Despesa447"), espaços nas pontas, variações de maiúscula ("Juros Obra"/"Juros obra", "iCloud"/"ICloud"). Linhas inválidas aparecem na prévia para corrigir ou descartar; agrupamento por nome é case-insensitive e com trim.
- **Valores variam dentro da mesma série** (centavos de arredondamento — 58,55/58,56 — e casos maiores, como uma parcela com valor diferente). Cada lançamento importado mantém o próprio valor; as parcelas futuras geradas para completar a série usam o valor da última parcela existente.
- Agrupa linhas com mesmo nome-base e mesmo total `y` em uma série; linhas com Pago marcado entram como pagas (histórico).
- **Completa as séries:** se o CSV só vai até "Fone 3/7", o import cria 4/7 a 7/7 nos meses seguintes. *(Chamada do Claude.)*
- **Recorrentes sem `x/y`** (ex.: Spotify presente em meses consecutivos com mesmo nome): a prévia sugere transformá-los em série "mensal"; o usuário confirma por item. *(Chamada do Claude.)*
- **Sem duplicatas:** reimportar o mesmo CSV não duplica lançamentos (chave: tipo + nome + data + valor). *(Chamada do Claude.)*
- Prévia antes de gravar, mostrando séries detectadas, séries completadas, sugestões de "mensal" e linhas não reconhecidas.

## 7. Abordagens consideradas

| Abordagem | Trade-off | Decisão |
|---|---|---|
| SwiftUI + SwiftData + CloudKit | Sync nativo e simples, mas exige conta paga (US$ 99/ano) | Descartada — usuário não vai pagar |
| SwiftUI nativo + backend próprio | Resolve sync, mas app no iPhone expira a cada 7 dias | Descartada |
| React Native (Expo) + backend | Mesmo limite de 7 dias; tabela estilo Notion mais trabalhosa; Expo Go não serve para uso diário | Descartada |
| **PWA em React + backend Node/Prisma/Postgres** | Sem limite da Apple, um código para Mac e iPhone, tabela natural na web; sensação um pouco menos nativa e sem uso completo offline | **Escolhida pelo usuário** |

Login: **Better Auth** (self-hosted, dados no Postgres próprio) em vez de Clerk (serviço de terceiros; seu diferencial, o SDK iOS, deixou de importar).

## 8. Arquitetura (chamadas do Claude, salvo indicação)

- **Monorepo** (pnpm workspaces): `apps/web` (PWA), `apps/api` (backend), `packages/shared` (tipos, schemas zod, parser de `x/y`, regras de data/propagação compartilhadas).
- **Frontend:** React + TypeScript + Vite, TanStack Table, TanStack Query, Tailwind, `vite-plugin-pwa` (manifest, ícones, service worker com cache para leitura offline).
- **Backend:** Node + TypeScript, Hono ou Fastify (builder escolhe), Prisma, Postgres, Better Auth com e-mail e senha.
- **Conta única:** cadastro desabilitado após a primeira conta. Rate limit no login.
- **Dinheiro em centavos** (inteiro). **Datas de vencimento como data pura** (sem hora), evitando deslocamento de fuso.
- **Materialização das séries:** parceladas geram todos os lançamentos na criação; mensais sem fim geram até um horizonte (sugestão: 12 meses à frente), estendido sob demanda ao consultar meses futuros. Builder pode ajustar a estratégia desde que o comportamento de §6 se mantenha.
- **Deploy (decidido pelo usuário):** na VPS do usuário via **Dokploy**, que já administra os projetos dele (o Traefik do Dokploy cuida de domínio e HTTPS — nada de Caddy próprio). Subdomínio do domínio do usuário (ex.: `finances.philipemorais.com`). Postgres como serviço de banco do Dokploy; API e web como aplicações (Dockerfile ou Compose — builder escolhe).
- **Backup (decidido pelo usuário):** backups agendados do Postgres para um bucket **Cloudflare R2** (compatível com S3, configurável como destino no Dokploy). Diário, com retenção (sugestão: 30 dias), restauração testada ao menos uma vez. Criar o bucket e as credenciais do R2 é tarefa do usuário.
- **Migrações:** Prisma Migrate versionado; nunca apagar dados para "consertar" schema.
- **Segredos** (`.env`, segredo do Better Auth, senha do Postgres) criados pelo usuário na VPS, fora do git.
- **Repositório:** o código Swift atual vai para a branch `swift-legacy`; `main` passa a conter o monorepo novo.

## 9. Qualidade

- Testes automatizados obrigatórios para: parser de `x/y`, geração de parcelas, clamp de dia do mês, propagação "esta e as próximas" (incluindo não tocar em pagas), cálculos do resumo do mês, e importador do CSV.
- Revisão de código, verificação de licenças das dependências e checagem de vulnerabilidades (`pnpm audit`) antes do deploy.

## 10. Deixado para o builder

- Hono vs Fastify; estrutura interna de pastas; biblioteca de componentes (se houver).
- UX exata da edição inline e dos diálogos "só esta / esta e as próximas".
- Paleta exata das etiquetas de método; ícones do PWA.
- Horizonte e gatilho exatos da materialização das séries mensais.
- Pipeline de deploy (manual via SSH/`docker compose pull` ou CI simples).
