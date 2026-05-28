# Pluton

Aplicativo iOS de finanças pessoais construído com SwiftUI e SwiftData. Permite controlar transações, planejar o orçamento, acompanhar metas e gerenciar investimentos — tudo armazenado localmente no dispositivo, sem servidores externos.

---

## Funcionalidades

### Insights
Dashboard principal com visão consolidada das finanças:
- Saldo atual em destaque
- Cards de ganhos e gastos totais
- Gráfico de evolução financeira com filtros de período: 7 dias, 1 mês, 3 meses e 1 ano
- Histórico das transações recentes

### Transações
Registro completo de entradas e saídas:
- Categorias para gastos: Alimentação, Transporte, Moradia, Saúde, Lazer, Educação, Compras, Assinaturas e Outros
- Categorias para ganhos: Salário, Freelance, Investimentos, Bônus, Presente e Outros
- Suporte a **transações fixas** — ao cadastrar uma transação como fixa, ela é propagada automaticamente para os próximos 12 meses
- Edição e exclusão de transações individuais ou de toda a série recorrente

### Previsão
Planejamento orçamentário mensal:
- Crie previsões de receitas e despesas futuras
- Suporte a **previsões recorrentes** configuradas por número de meses
- Marque previsões como concluídas mês a mês, de forma independente
- Navegação por mês para visualizar o calendário financeiro

### Metas
Acompanhamento de objetivos financeiros:
- Presets rápidos: Viagem, Carro, Casa, Educação, Reserva de Emergência, Casamento, Eletrônicos e Personalizado
- Definição de valor-alvo, valor atual e prazo opcional
- Barra de progresso visual e cálculo automático do valor restante
- Marque metas como concluídas

### Investimentos
Controle do patrimônio investido:
- Tipos suportados: Poupança, Cofrinho, CDB, CDI, Ações, Cripto, Fundos Imobiliários, Tesouro Direto e Personalizado
- Registro de aportes com data e anotação
- Gráfico de pizza com distribuição do portfólio
- Histórico de aportes por investimento
- Patrimônio total consolidado em destaque

---

## Tecnologias

| Tecnologia | Uso |
|---|---|
| **SwiftUI** | Interface declarativa |
| **SwiftData** | Persistência local de dados |
| **Swift Charts** | Gráficos de evolução e distribuição |
| **UIKit (Haptics)** | Feedback tátil na navegação |

**Requisitos mínimos:** iOS 17+ / Xcode 15+

---

## Arquitetura

```
pluton/
├── Models/
│   ├── Transaction.swift      # Transações (entrada/saída, fixas, categorias)
│   ├── ForecastEntry.swift    # Previsões orçamentárias com recorrência
│   ├── Goal.swift             # Metas financeiras
│   └── Investment.swift       # Investimentos e aportes
├── Views/
│   ├── HomeView.swift         # Dashboard de insights
│   ├── TransactionsView.swift # Lista e gestão de transações
│   ├── ForecastView.swift     # Planejamento mensal
│   ├── GoalsView.swift        # Acompanhamento de metas
│   ├── InvestmentsView.swift  # Portfólio de investimentos
│   ├── Add*View.swift         # Formulários de criação
│   ├── Edit*View.swift        # Formulários de edição
│   ├── SharedComponents.swift # Componentes reutilizáveis (FAB, etc.)
│   └── SplashView.swift       # Tela de abertura
├── DesignSystem.swift         # Tokens de design (cores, espaçamentos, raios, sombras)
├── ContentView.swift          # Navegação principal com header e FAB
└── plutonApp.swift            # Entry point e configuração do ModelContainer
```

A navegação entre as 5 abas funciona tanto pelos ícones do header quanto por **gestos de swipe horizontal**, com animação de transição e feedback tátil.

---

## Design System

O `DesignSystem.swift` centraliza todos os tokens visuais do app:

- **Colors** — primária, sucesso (`#4CAF50`), perigo (`#FF5252`), fundos e bordas adaptados ao modo claro/escuro
- **Spacing** — escala de 6 níveis: `xs (4)` → `xxxl (40)`
- **Radius** — escala de 6 níveis: `sm (10)` → `full (9999)`
- **Shadows** — 3 níveis de elevação: `sm`, `md`, `lg`

Componentes reutilizáveis incluídos: `Card`, `StatCard`, `Badge`, `EmptyStateView`, `FieldRow`, `IconColorPicker`, `PrimaryButtonStyle` e `SecondaryButtonStyle`.

---

## Como rodar

1. Clone o repositório
2. Abra `Pluton.xcodeproj` no Xcode 15 ou superior
3. Selecione um simulador ou dispositivo com iOS 17+
4. Pressione `⌘R` para compilar e executar

Não há dependências externas — o projeto utiliza exclusivamente frameworks nativos da Apple.

---

## Tema

O app suporta três modos de tema, configuráveis pelo menu do logo "Pluton" no header:

- **Sistema** — segue a preferência do iOS
- **Claro** — força o modo claro
- **Escuro** — força o modo escuro

A preferência é salva com `@AppStorage` e persiste entre sessões.
