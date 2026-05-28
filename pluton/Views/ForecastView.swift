import SwiftUI
import SwiftData

// MARK: - ForecastView

struct ForecastView: View {
    @Query private var allEntries: [ForecastEntry]
    @Environment(\.modelContext) private var ctx

    @State private var selectedMonth: Date = Calendar.current.startOfMonth(for: Date())
    @State private var toDelete: ForecastEntry?
    @State private var toEdit: ForecastEntry?
    @State private var confirmDelete = false
    @State private var showSuccessBanner = false

    private var entriesForMonth: [ForecastEntry] {
        allEntries.filter { entry in
            let cal = Calendar.current
            let entryStart = entry.month
            if entry.isRecurring {
                guard let entryEnd = cal.date(byAdding: .month, value: entry.recurringMonths - 1, to: entryStart) else { return false }
                return selectedMonth >= entryStart && selectedMonth <= entryEnd
            } else {
                return cal.isDate(entryStart, equalTo: selectedMonth, toGranularity: .month)
            }
        }
    }

    private var allCompleted: Bool {
        !entriesForMonth.isEmpty && entriesForMonth.allSatisfy { $0.isCompleted(for: selectedMonth) }
    }

    private var forecastIncome: Double {
        entriesForMonth.filter { $0.type == .income }.reduce(0) { $0 + $1.amount }
    }
    private var forecastExpense: Double {
        entriesForMonth.filter { $0.type == .expense }.reduce(0) { $0 + $1.amount }
    }
    private var forecastBalance: Double { forecastIncome - forecastExpense }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: DesignSystem.Spacing.xxl) {

                Text("Previsões")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, DesignSystem.Spacing.xl)
                    .padding(.top, DesignSystem.Spacing.xl)

                MonthSelectorView(selectedMonth: $selectedMonth)
                    .padding(.horizontal, DesignSystem.Spacing.xl)

                ForecastSummaryCard(income: forecastIncome, expense: forecastExpense, balance: forecastBalance)
                    .padding(.horizontal, DesignSystem.Spacing.xl)

                ForecastSection(
                    title: "Ganhos Previstos",
                    color: Color(hex: "80CBC4"),
                    icon: "arrow.down",
                    entries: entriesForMonth.filter { $0.type == .income },
                    viewingMonth: selectedMonth,
                    onEdit: { toEdit = $0 },
                    onDelete: { toDelete = $0; confirmDelete = true }
                )

                ForecastSection(
                    title: "Gastos Previstos",
                    color: Color(hex: "B39DDB"),
                    icon: "arrow.up",
                    entries: entriesForMonth.filter { $0.type == .expense },
                    viewingMonth: selectedMonth,
                    onEdit: { toEdit = $0 },
                    onDelete: { toDelete = $0; confirmDelete = true }
                )

                Spacer(minLength: 100)
            }
        }
        .overlay(alignment: .top) {
            if showSuccessBanner {
                SuccessBannerView()
                    .padding(.horizontal, DesignSystem.Spacing.xl)
                    .padding(.top, DesignSystem.Spacing.xl)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .background(DesignSystem.Colors.groupedBackground)
        .onChange(of: allCompleted) { _, completed in
            if completed {
                withAnimation(.easeInOut(duration: 0.3)) { showSuccessBanner = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                    withAnimation(.easeInOut(duration: 0.3)) { showSuccessBanner = false }
                }
            }
        }
        .sheet(item: $toEdit) { entry in EditForecastView(entry: entry, viewingMonth: selectedMonth) }
        .alert("Excluir previsão?", isPresented: $confirmDelete) {
            Button("Excluir", role: .destructive) { if let e = toDelete { ctx.delete(e) } }
            Button("Cancelar", role: .cancel) {}
        } message: { Text("Esta ação não pode ser desfeita.") }
    }
}

// MARK: - Success Banner

struct SuccessBannerView: View {
    var body: some View {
        HStack(spacing: DesignSystem.Spacing.md) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(Color(hex: "80CBC4"))
            Text("Todas as previsões do mês foram concluídas!")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(.primary)
            Spacer()
        }
        .padding(DesignSystem.Spacing.lg)
        .background(
            RoundedRectangle(cornerRadius: DesignSystem.Radius.lg)
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.lg)
                    .stroke(Color(hex: "80CBC4").opacity(0.4), lineWidth: 1))
        )
        .shadow(color: .black.opacity(0.08), radius: 8, x: 0, y: 4)
    }
}

// MARK: - Month Selector

struct MonthSelectorView: View {
    @Binding var selectedMonth: Date
    private let cal = Calendar.current
    private let fmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "pt_BR")
        f.dateFormat = "MMMM yyyy"
        return f
    }()

    var body: some View {
        HStack {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    selectedMonth = cal.date(byAdding: .month, value: -1, to: selectedMonth) ?? selectedMonth
                }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.secondary)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(DesignSystem.Colors.cardBackground)
                        .overlay(Circle().stroke(DesignSystem.Colors.border, lineWidth: 1)))
            }
            .buttonStyle(.plain)

            Spacer()

            Text(fmt.string(from: selectedMonth).capitalized)
                .font(.system(size: 17, weight: .medium))

            Spacer()

            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    selectedMonth = cal.date(byAdding: .month, value: 1, to: selectedMonth) ?? selectedMonth
                }
            } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.secondary)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(DesignSystem.Colors.cardBackground)
                        .overlay(Circle().stroke(DesignSystem.Colors.border, lineWidth: 1)))
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Summary Card

struct ForecastSummaryCard: View {
    let income: Double
    let expense: Double
    let balance: Double

    var body: some View {
        VStack(spacing: DesignSystem.Spacing.lg) {
            HStack(spacing: DesignSystem.Spacing.md) {
                ForecastStatPill(label: "Ganhos", amount: income, color: Color(hex: "80CBC4"))
                ForecastStatPill(label: "Gastos", amount: expense, color: Color(hex: "B39DDB"))
            }
            Divider().opacity(0.4)
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Saldo previsto")
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(.secondary)
                    Text(balance, format: .currency(code: "BRL"))
                        .font(.system(size: 28, weight: .semibold, design: .rounded))
                        .foregroundStyle(.primary)
                }
                Spacer()
                Image(systemName: balance >= 0 ? "arrow.up.right" : "arrow.down.right")
                    .font(.system(size: 20, weight: .light))
                    .foregroundStyle(balance >= 0 ? Color(hex: "80CBC4") : Color(hex: "B39DDB"))
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(DesignSystem.Colors.surfaceBackground))
            }
        }
        .padding(DesignSystem.Spacing.xl)
        .background(
            RoundedRectangle(cornerRadius: DesignSystem.Radius.xxl)
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.xxl)
                    .stroke(DesignSystem.Colors.border, lineWidth: 1))
        )
    }
}

struct ForecastStatPill: View {
    let label: String
    let amount: Double
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Circle().fill(color).frame(width: 6, height: 6)
                Text(label)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(.secondary)
            }
            Text(amount, format: .currency(code: "BRL"))
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundStyle(.primary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(DesignSystem.Spacing.lg)
        .background(RoundedRectangle(cornerRadius: DesignSystem.Radius.lg).fill(DesignSystem.Colors.surfaceBackground))
    }
}

// MARK: - Forecast Section

struct ForecastSection: View {
    let title: String
    let color: Color
    let icon: String
    let entries: [ForecastEntry]
    let viewingMonth: Date
    let onEdit: (ForecastEntry) -> Void
    let onDelete: (ForecastEntry) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: DesignSystem.Spacing.md) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(color)
                Text(title)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, DesignSystem.Spacing.xl)

            if entries.isEmpty {
                Text("Nenhum lançamento")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(.tertiary)
                    .padding(.horizontal, DesignSystem.Spacing.xl)
                    .padding(.vertical, DesignSystem.Spacing.lg)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                        ForecastRowView(entry: entry, viewingMonth: viewingMonth)
                            .contentShape(Rectangle())
                            .contextMenu {
                                Button { onEdit(entry) } label: { Label("Editar", systemImage: "pencil") }
                                Button(role: .destructive) { onDelete(entry) } label: { Label("Excluir", systemImage: "trash") }
                            }
                        if index < entries.count - 1 {
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
    }
}

// MARK: - Forecast Row

struct ForecastRowView: View {
    let entry: ForecastEntry
    let viewingMonth: Date

    private var completed: Bool { entry.isCompleted(for: viewingMonth) }

    // Calcula qual mês da recorrência está sendo exibido (1-based)
    private var currentRecurringIndex: Int {
        guard entry.isRecurring else { return 1 }
        let cal = Calendar.current
        let start = cal.startOfMonth(for: entry.month)
        let viewing = cal.startOfMonth(for: viewingMonth)
        let diff = cal.dateComponents([.month], from: start, to: viewing).month ?? 0
        return min(diff + 1, entry.recurringMonths)
    }

    var body: some View {
        HStack(spacing: DesignSystem.Spacing.md) {
            ZStack {
                Circle()
                    .fill(DesignSystem.Colors.surfaceBackground)
                    .frame(width: 40, height: 40)
                Image(systemName: completed ? "checkmark" : entry.category.icon)
                    .font(.system(size: 15, weight: .light))
                    .foregroundStyle(completed ? DesignSystem.Colors.success : .secondary)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(entry.title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(completed ? .secondary : .primary)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(entry.category.rawValue)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(.secondary)
                    if entry.isRecurring {
                        Text("· \(currentRecurringIndex)/\(entry.recurringMonths) meses")
                            .font(.system(size: 12, weight: .regular))
                            .foregroundStyle(.tertiary)
                    }
                }
            }

            Spacer()

            Text(entry.type == .income
                 ? "+\(entry.amount.formatted(.currency(code: "BRL")))"
                 : "-\(entry.amount.formatted(.currency(code: "BRL")))")
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .foregroundStyle(completed ? .secondary : (entry.type == .income ? DesignSystem.Colors.success : .primary))
        }
        .padding(.horizontal, DesignSystem.Spacing.lg)
        .padding(.vertical, DesignSystem.Spacing.md)
        .opacity(completed ? 0.6 : 1)
    }
}
