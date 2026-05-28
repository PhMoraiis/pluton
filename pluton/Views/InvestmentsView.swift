import SwiftUI
import SwiftData
import Charts

struct InvestmentsView: View {
    @Query(sort: \Investment.createdAt, order: .reverse) private var investments: [Investment]
    @Query(sort: \InvestmentDeposit.date, order: .reverse) private var deposits: [InvestmentDeposit]
    @Environment(\.modelContext) private var ctx
    @State private var showAdd = false
    @State private var investmentToEdit: Investment?
    @State private var investmentToDeposit: Investment?
    @State private var investmentToDelete: Investment?
    @State private var showDeleteAlert = false

    private var totalInvested: Double { investments.reduce(0) { $0 + $1.amount } }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: DesignSystem.Spacing.xxl) {

                // ── Header ───────────────────────────────────────────
                VStack(alignment: .leading, spacing: 6) {
                    Text("Investimentos")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(.secondary)
                    Text(totalInvested, format: .currency(code: "BRL"))
                        .font(.system(size: 42, weight: .semibold, design: .rounded))
                        .foregroundStyle(.primary)
                    Text("patrimônio total")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, DesignSystem.Spacing.xl)
                .padding(.top, DesignSystem.Spacing.xxl)

                if investments.isEmpty {
                    EmptyStateView(
                        icon: "chart.pie",
                        title: "Nenhum investimento",
                        description: "Comece a registrar seus investimentos",
                        actionTitle: "Adicionar Investimentos",
                        action: { showAdd = true }
                    )
                    .frame(minHeight: 300)
                } else {
                    // ── Pie Chart ────────────────────────────────────
                    InvestmentPieChart(investments: investments, total: totalInvested)
                        .padding(.horizontal, DesignSystem.Spacing.xl)

                    // ── History Chart ────────────────────────────────
                    if deposits.count > 1 {
                        InvestmentHistoryChart(deposits: deposits)
                            .padding(.horizontal, DesignSystem.Spacing.xl)
                    }

                    // ── Investment Cards ─────────────────────────────
                    VStack(alignment: .leading, spacing: DesignSystem.Spacing.md) {
                        Text("Carteira")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, DesignSystem.Spacing.xl)

                        VStack(spacing: DesignSystem.Spacing.md) {
                            ForEach(investments) { inv in
                                InvestmentCard(investment: inv, total: totalInvested)
                                    .padding(.horizontal, DesignSystem.Spacing.xl)
                                    .contentShape(Rectangle())
                                    .onTapGesture { investmentToEdit = inv }
                                    .contextMenu {
                                        Button { investmentToDeposit = inv } label: {
                                            Label("Adicionar dinheiro", systemImage: "plus.circle")
                                        }
                                        Button { investmentToEdit = inv } label: {
                                            Label("Editar", systemImage: "pencil")
                                        }
                                        Button(role: .destructive) {
                                            investmentToDelete = inv
                                            showDeleteAlert = true
                                        } label: {
                                            Label("Excluir", systemImage: "trash")
                                        }
                                    }
                            }
                        }
                    }
                }

                Spacer(minLength: 100)
            }
        }
        .background(DesignSystem.Colors.groupedBackground)
        .sheet(isPresented: $showAdd) { AddInvestmentView() }
        .sheet(item: $investmentToEdit) { inv in EditInvestmentView(investment: inv) }
        .sheet(item: $investmentToDeposit) { inv in InvestmentDepositView(investment: inv) }
        .alert("Excluir investimento?", isPresented: $showDeleteAlert) {
            Button("Excluir", role: .destructive) {
                if let inv = investmentToDelete { ctx.delete(inv) }
            }
            Button("Cancelar", role: .cancel) {}
        } message: { Text("Esta ação não pode ser desfeita.") }
    }
}

// MARK: - Investment Card

struct InvestmentCard: View {
    let investment: Investment
    let total: Double

    private var color: Color { Color.categoryColor(from: investment.colorName) }
    private var share: Double { total > 0 ? investment.amount / total : 0 }

    var body: some View {
        HStack(spacing: DesignSystem.Spacing.md) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.15))
                    .frame(width: 44, height: 44)
                Image(systemName: investment.icon)
                    .font(.system(size: 18, weight: .light))
                    .foregroundStyle(color)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(investment.title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.primary)
                Text(investment.type.rawValue)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 3) {
                Text(investment.amount, format: .currency(code: "BRL"))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(.primary)
                Text("\(Int(share * 100))% do total")
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(DesignSystem.Spacing.xl)
        .background(
            RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                    .stroke(DesignSystem.Colors.border, lineWidth: 1))
        )
    }
}

// MARK: - Pie Chart

struct InvestmentPieChart: View {
    let investments: [Investment]
    let total: Double
    @State private var selectedId: String?

    var body: some View {
        VStack(alignment: .leading, spacing: DesignSystem.Spacing.lg) {
            Text("Distribuição")
                .font(.system(size: 15, weight: .medium))

            HStack(spacing: DesignSystem.Spacing.xl) {
                // Pie
                Chart(investments, id: \.id) { inv in
                    SectorMark(
                        angle: .value("Valor", inv.amount),
                        innerRadius: .ratio(0.55),
                        angularInset: 2
                    )
                    .foregroundStyle(Color.categoryColor(from: inv.colorName))
                    .opacity(selectedId == nil || selectedId == inv.id.uuidString ? 1 : 0.4)
                    .cornerRadius(4)
                }
                .chartAngleSelection(value: $selectedId)
                .frame(width: 130, height: 130)

                // Legend
                VStack(alignment: .leading, spacing: DesignSystem.Spacing.sm) {
                    ForEach(investments) { inv in
                        HStack(spacing: 8) {
                            Circle()
                                .fill(Color.categoryColor(from: inv.colorName))
                                .frame(width: 8, height: 8)
                            Text(inv.title)
                                .font(.system(size: 12, weight: .regular))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            Spacer()
                            Text("\(Int(total > 0 ? inv.amount / total * 100 : 0))%")
                                .font(.system(size: 12, weight: .medium, design: .rounded))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .padding(DesignSystem.Spacing.xl)
        .background(
            RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                    .stroke(DesignSystem.Colors.border, lineWidth: 1))
        )
    }
}

// MARK: - History Chart

struct InvestmentHistoryChart: View {
    let deposits: [InvestmentDeposit]

    private var cumulativePoints: [(date: Date, total: Double)] {
        let sorted = deposits.sorted { $0.date < $1.date }
        var running = 0.0
        return sorted.map { d in
            running += d.amount
            return (d.date, running)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: DesignSystem.Spacing.lg) {
            Text("Evolução")
                .font(.system(size: 15, weight: .medium))

            Chart(cumulativePoints, id: \.date) { p in
                LineMark(x: .value("Data", p.date), y: .value("Total", p.total))
                    .foregroundStyle(Color(hex: "B5D5C5"))
                    .lineStyle(StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                    .interpolationMethod(.catmullRom)
                AreaMark(x: .value("Data", p.date), y: .value("Total", p.total))
                    .foregroundStyle(LinearGradient(
                        colors: [Color(hex: "B5D5C5").opacity(0.3), .clear],
                        startPoint: .top, endPoint: .bottom
                    ))
                    .interpolationMethod(.catmullRom)
            }
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks(position: .leading) { v in
                    AxisValueLabel {
                        if let d = v.as(Double.self) {
                            Text(d, format: .currency(code: "BRL").precision(.fractionLength(0)))
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .frame(height: 120)
        }
        .padding(DesignSystem.Spacing.xl)
        .background(
            RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                    .stroke(DesignSystem.Colors.border, lineWidth: 1))
        )
    }
}
