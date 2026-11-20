# Cobrar no mês seguinte — Design (curto)

**Data:** 2026-11-19 · **Status:** aprovado pelo usuário
**Base:** Pluton em produção, com salário, etiquetas e ordenação (`2026-11-19-salario-etiquetas-ordenacao-design.md`).

## Intenção

Numa compra no cartão de crédito, a 1ª parcela (ou o valor à vista) normalmente vai para o mês seguinte, mas nem sempre. Hoje a 1ª parcela cai na data digitada em Vencimento, que vem preenchida com o dia 05 do mês do filtro. Para jogar a compra para o mês seguinte, o usuário precisa lembrar de mudar a data à mão. Ele quer escolher na criação entre cobrar "este mês" ou no "próximo mês", com um padrão que dependa do método de pagamento.

## Abordagens

| Abordagem | Trade-off | Decisão |
|---|---|---|
| **A. Seletor "Este mês / Próximo mês" com padrão por método** | Simples e previsível; resolve o "às vezes não" com um clique | **Escolhida pelo usuário** |
| B. Dia de fechamento e de vencimento do cartão, com cálculo da fatura | Automático, mas exige mais configuração, mais regras e lida com casos de borda | Descartada por ora (pode vir por cima da A) |

## Comportamento

1. **Padrão por método.** Em Configurações → Métodos, cada método ganha a opção "Cobrar no mês seguinte". O padrão é desligado.
   - A migração liga a opção no método chamado "Cartão de crédito" das contas existentes.
   - Contas novas já recebem "Cartão de crédito" com a opção ligada.
2. **Seletor na criação.** A linha de novo lançamento (desktop) e o formulário de criação (mobile) mostram "Cobrar: Este mês / Próximo mês", em Despesas e em Ganhos.
   - Ao abrir a linha, e sempre que o método muda, o seletor assume o padrão do método escolhido. "Sem método" equivale a "Este mês".
   - O usuário pode trocar o seletor livremente.
3. **A data visível é a data salva.** Passar de "Este mês" para "Próximo mês" avança a data do campo Vencimento em um mês, mantendo o dia (com clamp: 31/01 vira 28/02 ou 29/02). Voltar recua um mês. Não há deslocamento escondido no envio.
   - Se o usuário editar a data à mão, a data digitada vale como está e o seletor não a move de novo até ser trocado.
4. **Parcelas e mensais.** "Base x/y" e lançamentos mensais seguem mês a mês a partir da data do campo, como hoje.

## Decisões do Claude

- O padrão fica no servidor (`PaymentMethod.chargeNextMonth`), não no navegador, para valer igual no iPhone e no Mac.
- O seletor aparece também em Ganhos, para manter a tela consistente.
- Na migração, a identificação do cartão é feita pelo nome "Cartão de crédito". Se o usuário tiver renomeado o método, liga a opção à mão nas Configurações.

## Fora do escopo

- Fechamento de fatura e dia de vencimento do cartão (abordagem B).
- Alterar lançamentos existentes, ou a data na edição (lá a data é editada diretamente, como hoje).

## Restrições

- Migração aditiva (nova coluna com default) mais um `UPDATE` só dessa coluna nova. Nenhum dado existente é reescrito.
- Produção só via deploy (`prisma migrate deploy`); backup manual no R2 antes (runbook `docs/deploy.md`).
- Invariantes do design base continuam valendo: data pura, centavos inteiros, offline somente leitura, todo acesso escopado por `userId`.

## Deixado para o builder

- Visual exato do seletor (segmentado ou switch) e a posição dele na linha e no formulário.
- Nome exato do campo no DTO e na rota de métodos, desde que o comportamento acima se mantenha.
