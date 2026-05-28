import SwiftUI
import SwiftData
import Charts

struct HomeView: View {
    @Query(sort: \Transaction.date, order: .reverse) private var transactions: [Transaction]
    @Environment(\.modelContext) private var modelContext
    @State private var selectedPeriod: ChartPeriod = .month
    @State private var transactionToEdit: Transaction?
    @State private var transactionToDelete: Transaction?
    @State private var showDeleteAlert = false

    enum ChartPeriod: String, CaseIterable {
        case week = "7D"
        case month = "1M"
        case threeMonths = "3M"
        case year = "1A"
    }

    private var totalBalance: Double {
        transactions.reduce(0) { $0 + ($1.type == .income ? $1.amount : -$1.amount) }
    }
    private var totalIncome: Double { transactions.filter { $0.type == .income }.reduce(0) { $0 + $1.amount } }
    private var totalExpense: Double { transactions.filter { $0.type == .expense }.reduce(0) { $0 + $1.amount } }

    private var filteredForChart: [Transaction] {
        let now = Date()
        let calendar = Calendar.current
        let cutoff: Date
        switch selectedPeriod {
        case .week:       cutoff = calendar.date(byAdding: .day,   value: -7,  to: now)!
        case .month:      cutoff = calendar.date(byAdding: .month, value: -1,  to: now)!
        case .threeMonths:cutoff = calendar.date(byAdding: .month, value: -3,  to: now)!
        case .year:       cutoff = calendar.date(byAdding: .year,  value: -1,  to: now)!
        }
        return transactions.filter { $0.date >= cutoff }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: DesignSystem.Spacing.xxl) {

                // ── Saldo ────────────────────────────────────────────
                VStack(alignment: .leading, spacing: 6) {
                    Text("Visão geral")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(.secondary)
                    Text(totalBalance, format: .currency(code: "BRL"))
                        .font(.system(size: 42, weight: .semibold, design: .rounded))
                        .foregroundStyle(.primary)
                    Text("saldo atual")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, DesignSystem.Spacing.xl)
                .padding(.top, DesignSystem.Spacing.xxl)

                // ── Cards Ganhos / Gastos ────────────────────────────
                HStack(spacing: DesignSystem.Spacing.md) {
                    MiniBalanceCard(label: "Ganhos", amount: totalIncome, isIncome: true)
                    MiniBalanceCard(label: "Gastos", amount: totalExpense, isIncome: false)
                }
                .padding(.horizontal, DesignSystem.Spacing.xl)

                // ── Gráfico ──────────────────────────────────────────
                VStack(alignment: .leading, spacing: DesignSystem.Spacing.lg) {
                    HStack {
                        Text("Evolução")
                            .font(.system(size: 15, weight: .medium))
                        Spacer()
                        ModernPeriodPicker(selected: $selectedPeriod)
                    }
                    BalanceLineChart(transactions: filteredForChart)
                        .frame(height: 160)
                }
                .padding(DesignSystem.Spacing.xl)
                .background(
                    RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                        .fill(DesignSystem.Colors.cardBackground)
                        .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                            .stroke(DesignSystem.Colors.border, lineWidth: 1))
                )
                .padding(.horizontal, DesignSystem.Spacing.xl)

                // ── Transações Recentes ──────────────────────────────
                VStack(alignment: .leading, spacing: DesignSystem.Spacing.lg) {
                    HStack {
                        Text("Transações")
                            .font(.system(size: 15, weight: .medium))
                        Spacer()
                        if !transactions.isEmpty {
                            Text("\(transactions.count) total")
                                .font(.system(size: 12, weight: .regular))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, DesignSystem.Spacing.xl)

                    if transactions.isEmpty {
                        EmptyStateView(
                            icon: "tray",
                            title: "Nenhuma transação",
                            description: "Toque em + para adicionar"
                        )
                    } else {
                        VStack(spacing: 0) {
                            ForEach(transactions.prefix(6)) { t in
                                TransactionRowWithActions(
                                    transaction: t,
                                    transactionToEdit: $transactionToEdit,
                                    transactionToDelete: $transactionToDelete,
                                    showDeleteAlert: $showDeleteAlert
                                )
                                if t.id != transactions.prefix(6).last?.id {
                                    Divider().padding(.leading, 56)
                                }
                            }
                        }
                        .background(
                            RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                                .fill(DesignSystem.Colors.cardBackground)
                                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                                    .stroke(DesignSystem.Colors.border, lineWidth: 1))
                        )
                        .padding(.horizontal, DesignSystem.Spacing.xl)
                    }
                }

                Spacer(minLength: 100)
            }
        }
        .background(DesignSystem.Colors.groupedBackground)
        .sheet(item: $transactionToEdit) { transaction in
            EditTransactionView(transaction: transaction)
        }
        .alert("Excluir transação?", isPresented: $showDeleteAlert) {
            Button("Excluir", role: .destructive) {
                if let t = transactionToDelete { modelContext.delete(t) }
            }
            Button("Cancelar", role: .cancel) {}
        } message: { Text("Esta ação não pode ser desfeita.") }
    }
}

// MARK: - Mini Balance Card

struct MiniBalanceCard: View {
    let label: String
    let amount: Double
    let isIncome: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: isIncome ? "arrow.down" : "arrow.up")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(isIncome ? DesignSystem.Colors.success : DesignSystem.Colors.danger)
                Text(label)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(.secondary)
            }
            Text(amount, format: .currency(code: "BRL"))
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(DesignSystem.Spacing.lg)
        .background(
            RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                    .stroke(DesignSystem.Colors.border, lineWidth: 1))
        )
    }
}

// MARK: - Modern Period Picker

struct ModernPeriodPicker: View {
    @Binding var selected: HomeView.ChartPeriod
    @Namespace private var animation

    var body: some View {
        HStack(spacing: 0) {
            ForEach(HomeView.ChartPeriod.allCases, id: \.self) { period in
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selected = period }
                } label: {
                    Text(period.rawValue)
                        .font(.system(size: 12, weight: selected == period ? .medium : .regular))
                        .foregroundStyle(selected == period ? .primary : .secondary)
                        .fixedSize()
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background {
                            if selected == period {
                                Capsule()
                                    .fill(DesignSystem.Colors.surfaceBackground)
                                    .matchedGeometryEffect(id: "period", in: animation)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(
            Capsule()
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(Capsule().stroke(DesignSystem.Colors.border, lineWidth: 1))
        )
    }
}

// MARK: - Modern Transaction Row

struct ModernTransactionRow: View {
    let transaction: Transaction

    var body: some View {
        HStack(spacing: DesignSystem.Spacing.md) {
            // Ícone minimalista
            ZStack {
                Circle()
                    .fill(DesignSystem.Colors.surfaceBackground)
                    .frame(width: 40, height: 40)
                Image(systemName: transaction.category.icon)
                    .font(.system(size: 15, weight: .light))
                    .foregroundStyle(.secondary)
            }

            // Info
            VStack(alignment: .leading, spacing: 3) {
                Text(transaction.title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(transaction.category.rawValue)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(.secondary)
            }

            Spacer()

            // Valor
            VStack(alignment: .trailing, spacing: 3) {
                Text(transaction.type == .income
                     ? "+\(transaction.amount.formatted(.currency(code: "BRL")))"
                     : "-\(transaction.amount.formatted(.currency(code: "BRL")))")
                    .font(.system(size: 15, weight: .medium, design: .rounded))
                    .foregroundStyle(transaction.type == .income ? DesignSystem.Colors.success : .primary)
                Text(transaction.date, style: .date)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, DesignSystem.Spacing.lg)
        .padding(.vertical, DesignSystem.Spacing.md)
    }
}

// MARK: - Line Chart

struct BalanceLineChart: View {
    let transactions: [Transaction]

    private var points: [(date: Date, balance: Double)] {
        let sorted = transactions.sorted { $0.date < $1.date }
        var running = 0.0
        return sorted.map { t in
            running += t.type == .income ? t.amount : -t.amount
            return (t.date, running)
        }
    }

    var body: some View {
        if points.isEmpty {
            EmptyStateView(
                icon: "chart.line.uptrend.xyaxis",
                title: "Sem dados",
                description: "Adicione transações para ver o gráfico de evolução"
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            Chart(points, id: \.date) { p in
                LineMark(x: .value("Data", p.date), y: .value("Saldo", p.balance))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [DesignSystem.Colors.primary, DesignSystem.Colors.primary.opacity(0.7)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .lineStyle(StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                    .interpolationMethod(.catmullRom)
                
                AreaMark(x: .value("Data", p.date), y: .value("Saldo", p.balance))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [
                                DesignSystem.Colors.primary.opacity(0.3),
                                DesignSystem.Colors.primary.opacity(0.1),
                                .clear
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .interpolationMethod(.catmullRom)
            }
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks(position: .leading) { v in
                    AxisValueLabel {
                        if let d = v.as(Double.self) {
                            Text(d, format: .currency(code: "BRL").precision(.fractionLength(0)))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
}
