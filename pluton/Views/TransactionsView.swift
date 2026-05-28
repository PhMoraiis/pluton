import SwiftUI
import SwiftData

struct TransactionsView: View {
    @Query(sort: \Transaction.date, order: .reverse) private var all: [Transaction]
    @Environment(\.modelContext) private var ctx

    @State private var selectedType: AnalyticsType = .expense
    @State private var filterPeriod: FilterPeriod = .week
    @State private var showFilterSheet = false
    @State private var activeFilters = TransactionFilters()
    @State private var toDelete: Transaction?
    @State private var toEdit: Transaction?
    @State private var confirmDelete = false

    enum AnalyticsType: String, CaseIterable {
        case expense = "Gastos"
        case income  = "Ganhos"
    }

    enum FilterPeriod: String, CaseIterable {
        case week  = "Semana"
        case month = "Mês"
        case year  = "Ano"
        var days: Int {
            switch self { case .week: return 7; case .month: return 30; case .year: return 365 }
        }
    }

    // Transações filtradas para analytics (tipo + período) — usa os mesmos intervalos fixos do barData
    private var analyticsFiltered: [Transaction] {
        let cal = Calendar.current
        let type: TransactionType = selectedType == .expense ? .expense : .income
        switch filterPeriod {
        case .week:
            let sunday = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: Date()))!
            let weekEnd = cal.date(byAdding: .day, value: 7, to: sunday)!
            return all.filter { $0.type == type && $0.date >= sunday && $0.date < weekEnd }
        case .month:
            let firstDay = cal.date(from: cal.dateComponents([.year, .month], from: Date()))!
            let range = cal.range(of: .day, in: .month, for: Date())!
            let lastDay = cal.date(byAdding: .day, value: range.count, to: firstDay)!
            return all.filter { $0.type == type && $0.date >= firstDay && $0.date < lastDay }
        case .year:
            let jan = cal.date(from: DateComponents(year: cal.component(.year, from: Date()), month: 1))!
            let dec = cal.date(byAdding: .year, value: 1, to: jan)!
            return all.filter { $0.type == type && $0.date >= jan && $0.date < dec }
        }
    }

    private var total: Double { analyticsFiltered.reduce(0) { $0 + $1.amount } }

    // Transações filtradas pelos filtros avançados (para a lista)
    private var listFiltered: [Transaction] {
        var r = all
        // Tipo
        if let t = activeFilters.type {
            r = r.filter { $0.type == t }
        }
        // Período
        let cal = Calendar.current
        let now = Date()
        switch activeFilters.period {
        case .today:   r = r.filter { cal.isDateInToday($0.date) }
        case .week:    r = r.filter { $0.date >= cal.date(byAdding: .day, value: -7, to: now)! }
        case .month:   r = r.filter { $0.date >= cal.date(byAdding: .month, value: -1, to: now)! }
        case .year:    r = r.filter { $0.date >= cal.date(byAdding: .year, value: -1, to: now)! }
        case .custom:
            r = r.filter { $0.date >= activeFilters.startDate && $0.date <= activeFilters.endDate }
        case .all: break
        }
        // Categorias
        if !activeFilters.categories.isEmpty {
            r = r.filter { activeFilters.categories.contains($0.category) }
        }
        // Valor mínimo/máximo
        if let min = activeFilters.minAmount { r = r.filter { $0.amount >= min } }
        if let max = activeFilters.maxAmount { r = r.filter { $0.amount <= max } }
        // Busca
        if !activeFilters.search.isEmpty {
            r = r.filter {
                $0.title.localizedCaseInsensitiveContains(activeFilters.search) ||
                $0.category.rawValue.localizedCaseInsensitiveContains(activeFilters.search)
            }
        }
        return r
    }

    private var hasActiveFilters: Bool { activeFilters.isActive }

    // Barras do gráfico — usa intervalos de calendário fixos (semana atual, mês atual, ano atual)
    private var barData: [(label: String, amount: Double, date: Date)] {
        let cal = Calendar.current
        let txType: TransactionType = selectedType == .expense ? .expense : .income
        switch filterPeriod {
        case .week:
            let sunday = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: Date()))!
            let dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
            return (0..<7).compactMap { offset -> (String, Double, Date)? in
                guard let day = cal.date(byAdding: .day, value: offset, to: sunday) else { return nil }
                let dayStart = cal.startOfDay(for: day)
                let dayEnd = cal.date(byAdding: .day, value: 1, to: dayStart)!
                let total = all
                    .filter { $0.type == txType && $0.date >= dayStart && $0.date < dayEnd }
                    .reduce(0) { $0 + $1.amount }
                return (dayLabels[offset], total, day)
            }
        case .month:
            let firstDay = cal.date(from: cal.dateComponents([.year, .month], from: Date()))!
            let range = cal.range(of: .day, in: .month, for: Date())!
            let daysInMonth = range.count
            let groupSize = max(1, daysInMonth / 6)
            var groups: [(String, Double, Date)] = []
            var offset = 0
            while offset < daysInMonth {
                let groupStart = cal.date(byAdding: .day, value: offset, to: firstDay)!
                let groupEnd = cal.date(byAdding: .day, value: min(offset + groupSize, daysInMonth), to: firstDay)!
                let label = "\(offset + 1)"
                let total = all
                    .filter { $0.type == txType && $0.date >= groupStart && $0.date < groupEnd }
                    .reduce(0) { $0 + $1.amount }
                groups.append((label, total, groupStart))
                offset += groupSize
            }
            return groups
        case .year:
            let jan = cal.date(from: DateComponents(year: cal.component(.year, from: Date()), month: 1))!
            let monthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
            return (0..<12).compactMap { offset -> (String, Double, Date)? in
                guard let month = cal.date(byAdding: .month, value: offset, to: jan) else { return nil }
                let nextMonth = cal.date(byAdding: .month, value: 1, to: month)!
                let total = all
                    .filter { $0.type == txType && $0.date >= month && $0.date < nextMonth }
                    .reduce(0) { $0 + $1.amount }
                return (monthLabels[offset], total, month)
            }
        }
    }

    private var maxBar: Double { barData.map(\.amount).max() ?? 1 }

    private var byCategory: [(category: TransactionCategory, amount: Double)] {
        var dict: [TransactionCategory: Double] = [:]
        for t in analyticsFiltered { dict[t.category, default: 0] += t.amount }
        return dict.sorted { $0.value > $1.value }.map { (category: $0.key, amount: $0.value) }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: DesignSystem.Spacing.xxl) {

                // ── Toggle + Filtro ──────────────────────────────────
                Text("Transações")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, DesignSystem.Spacing.xl)
                    .padding(.top, DesignSystem.Spacing.xxl)

                HStack(spacing: DesignSystem.Spacing.md) {                    // Toggle Gastos/Ganhos
                    HStack(spacing: 0) {
                        ForEach(AnalyticsType.allCases, id: \.self) { type in
                            Button {
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { selectedType = type }
                            } label: {
                                Text(type.rawValue)
                                    .font(.system(size: 14, weight: selectedType == type ? .medium : .regular))
                                    .foregroundStyle(selectedType == type ? .primary : .secondary)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 9)
                                    .background {
                                        if selectedType == type {
                                            Capsule()
                                                .fill(DesignSystem.Colors.cardBackground)
                                                .overlay(Capsule().stroke(DesignSystem.Colors.border, lineWidth: 1))
                                        }
                                    }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(4)
                    .background(Capsule().fill(DesignSystem.Colors.surfaceBackground))

                    // Botão de filtro
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        showFilterSheet = true
                    } label: {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: "slider.horizontal.3")
                                .font(.system(size: 16, weight: .light))
                                .foregroundStyle(hasActiveFilters ? .primary : .secondary)
                                .frame(width: 40, height: 40)
                                .background(
                                    Circle()
                                        .fill(DesignSystem.Colors.cardBackground)
                                        .overlay(Circle().stroke(hasActiveFilters ? Color.primary.opacity(0.3) : DesignSystem.Colors.border, lineWidth: 1))
                                )
                            if hasActiveFilters {
                                Circle()
                                    .fill(Color(hex: "B39DDB"))
                                    .frame(width: 8, height: 8)
                                    .offset(x: 2, y: -2)
                            }
                        }
                    }
                }
                .padding(.horizontal, DesignSystem.Spacing.xl)
                .padding(.top, DesignSystem.Spacing.xl)

                // ── Chips de filtros ativos ──────────────────────────
                if hasActiveFilters {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: DesignSystem.Spacing.sm) {
                            ForEach(activeFilters.chips) { chip in
                                ActiveFilterChip(chip: chip) {
                                    withAnimation { activeFilters.remove(chip: chip) }
                                }
                            }
                            Button {
                                withAnimation { activeFilters = TransactionFilters() }
                            } label: {
                                Text("Limpar")
                                    .font(.system(size: 12, weight: .regular))
                                    .foregroundStyle(.secondary)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(Capsule().stroke(DesignSystem.Colors.border, lineWidth: 1))
                            }
                        }
                        .padding(.horizontal, DesignSystem.Spacing.xl)
                    }
                }

                // ── Total + Período ──────────────────────────────────
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(total, format: .currency(code: "BRL"))
                            .font(.system(size: 34, weight: .semibold, design: .rounded))
                            .foregroundStyle(.primary)
                        Text(selectedType == .expense ? "total em gastos" : "total em ganhos")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    HStack(spacing: 0) {
                        ForEach(FilterPeriod.allCases, id: \.self) { p in
                            Button {
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                withAnimation { filterPeriod = p }
                            } label: {
                                Text(p.rawValue)
                                    .font(.system(size: 12, weight: filterPeriod == p ? .medium : .regular))
                                    .foregroundStyle(filterPeriod == p ? .primary : .secondary)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background {
                                        if filterPeriod == p {
                                            Capsule().fill(DesignSystem.Colors.cardBackground)
                                                .overlay(Capsule().stroke(DesignSystem.Colors.border, lineWidth: 1))
                                        }
                                    }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(3)
                    .background(Capsule().fill(DesignSystem.Colors.surfaceBackground))
                }
                .padding(.horizontal, DesignSystem.Spacing.xl)

                // ── Gráfico de Barras ────────────────────────────────
                BarChartView(
                    data: barData,
                    maxValue: maxBar,
                    accentColor: selectedType == .expense ? Color(hex: "B39DDB") : Color(hex: "80CBC4")
                )
                .frame(height: 160)
                .padding(.horizontal, DesignSystem.Spacing.xl)

                // ── Grid de Categorias ───────────────────────────────
                if !byCategory.isEmpty {
                    VStack(alignment: .leading, spacing: DesignSystem.Spacing.md) {
                        Text("Por categoria")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, DesignSystem.Spacing.xl)

                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: DesignSystem.Spacing.md) {
                            ForEach(byCategory.prefix(6), id: \.category) { item in
                                CategoryGridCell(category: item.category, amount: item.amount, total: total)
                            }
                        }
                        .padding(.horizontal, DesignSystem.Spacing.xl)
                    }
                }

                // ── Lista de Transações ──────────────────────────────
                VStack(alignment: .leading, spacing: DesignSystem.Spacing.md) {
                    HStack {
                        Text("Transações")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("\(listFiltered.count) resultado\(listFiltered.count == 1 ? "" : "s")")
                            .font(.system(size: 12, weight: .regular))
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.horizontal, DesignSystem.Spacing.xl)

                    if listFiltered.isEmpty {
                        EmptyStateView(
                            icon: "tray",
                            title: "Sem transações",
                            description: hasActiveFilters ? "Nenhuma transação com esses filtros" : "Adicione sua primeira transação"
                        )
                    } else {
                        VStack(spacing: 0) {
                            ForEach(listFiltered) { t in
                                TransactionRowWithActions(
                                    transaction: t,
                                    transactionToEdit: $toEdit,
                                    transactionToDelete: $toDelete,
                                    showDeleteAlert: $confirmDelete
                                )
                                if t.id != listFiltered.last?.id {
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
        .sheet(isPresented: $showFilterSheet) {
            TransactionFilterSheet(filters: $activeFilters)
        }
        .sheet(item: $toEdit) { EditTransactionView(transaction: $0) }
        .alert("Excluir transação?", isPresented: $confirmDelete) {
            Button("Excluir", role: .destructive) { if let t = toDelete { ctx.delete(t) } }
            Button("Cancelar", role: .cancel) {}
        } message: { Text("Esta ação não pode ser desfeita.") }
    }
}

// MARK: - Filter Model

struct TransactionFilters {
    enum Period: String, CaseIterable {
        case all = "Sempre"
        case today = "Hoje"
        case week = "7 dias"
        case month = "30 dias"
        case year = "1 ano"
        case custom = "Personalizado"
    }

    var type: TransactionType? = nil
    var period: Period = .all
    var startDate: Date = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    var endDate: Date = Date()
    var categories: Set<TransactionCategory> = []
    var minAmount: Double? = nil
    var maxAmount: Double? = nil
    var search: String = ""

    var isActive: Bool {
        type != nil || period != .all || !categories.isEmpty ||
        minAmount != nil || maxAmount != nil || !search.isEmpty
    }

    // Chips para exibição
    struct Chip: Identifiable {
        let id = UUID()
        let label: String
        let key: ChipKey
        enum ChipKey { case type, period, category(TransactionCategory), minAmount, maxAmount, search }
    }

    var chips: [Chip] {
        var result: [Chip] = []
        if let t = type { result.append(.init(label: t == .income ? "Ganhos" : "Gastos", key: .type)) }
        if period != .all { result.append(.init(label: period.rawValue, key: .period)) }
        for cat in categories { result.append(.init(label: cat.rawValue, key: .category(cat))) }
        if let min = minAmount { result.append(.init(label: "Min: R$\(Int(min))", key: .minAmount)) }
        if let max = maxAmount { result.append(.init(label: "Max: R$\(Int(max))", key: .maxAmount)) }
        if !search.isEmpty { result.append(.init(label: "\"\(search)\"", key: .search)) }
        return result
    }

    mutating func remove(chip: Chip) {
        switch chip.key {
        case .type: type = nil
        case .period: period = .all
        case .category(let c): categories.remove(c)
        case .minAmount: minAmount = nil
        case .maxAmount: maxAmount = nil
        case .search: search = ""
        }
    }
}

// MARK: - Active Filter Chip

struct ActiveFilterChip: View {
    let chip: TransactionFilters.Chip
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 5) {
            Text(chip.label)
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(.primary)
            Button(action: onRemove) {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(
            Capsule()
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(Capsule().stroke(DesignSystem.Colors.border, lineWidth: 1))
        )
    }
}

// MARK: - Filter Sheet

struct TransactionFilterSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var filters: TransactionFilters

    @State private var localFilters: TransactionFilters = TransactionFilters()
    @State private var minAmountText: String = ""
    @State private var maxAmountText: String = ""

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: DesignSystem.Spacing.xxl) {

                    // ── Busca ────────────────────────────────────────
                    VStack(alignment: .leading, spacing: DesignSystem.Spacing.md) {
                        SectionHeader(title: "Busca")
                        HStack(spacing: DesignSystem.Spacing.sm) {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 14, weight: .light))
                                .foregroundStyle(.secondary)
                            TextField("Descrição ou categoria...", text: $localFilters.search)
                                .font(.system(size: 15, weight: .regular))
                        }
                        .padding(DesignSystem.Spacing.lg)
                        .background(
                            RoundedRectangle(cornerRadius: DesignSystem.Radius.lg)
                                .fill(DesignSystem.Colors.cardBackground)
                                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.lg)
                                    .stroke(DesignSystem.Colors.border, lineWidth: 1))
                        )
                    }
                    .padding(.horizontal, DesignSystem.Spacing.xl)

                    // ── Tipo ─────────────────────────────────────────
                    VStack(alignment: .leading, spacing: DesignSystem.Spacing.md) {
                        SectionHeader(title: "Tipo")
                        HStack(spacing: DesignSystem.Spacing.sm) {
                            FilterTypeButton(label: "Todos", isSelected: localFilters.type == nil) {
                                localFilters.type = nil
                            }
                            FilterTypeButton(label: "Ganhos", isSelected: localFilters.type == .income) {
                                localFilters.type = localFilters.type == .income ? nil : .income
                            }
                            FilterTypeButton(label: "Gastos", isSelected: localFilters.type == .expense) {
                                localFilters.type = localFilters.type == .expense ? nil : .expense
                            }
                        }
                    }
                    .padding(.horizontal, DesignSystem.Spacing.xl)

                    // ── Período ──────────────────────────────────────
                    VStack(alignment: .leading, spacing: DesignSystem.Spacing.md) {
                        SectionHeader(title: "Período")
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: DesignSystem.Spacing.sm) {
                            ForEach(TransactionFilters.Period.allCases, id: \.self) { p in
                                FilterTypeButton(label: p.rawValue, isSelected: localFilters.period == p) {
                                    localFilters.period = p
                                }
                            }
                        }

                        // Range de datas personalizado
                        if localFilters.period == .custom {
                            VStack(spacing: 0) {
                                HStack {
                                    Image(systemName: "calendar")
                                        .font(.system(size: 14, weight: .light))
                                        .foregroundStyle(.secondary)
                                        .frame(width: 20)
                                    Text("De")
                                        .font(.system(size: 14, weight: .regular))
                                        .foregroundStyle(.secondary)
                                        .frame(width: 30, alignment: .leading)
                                    Spacer()
                                    DatePicker("", selection: $localFilters.startDate, displayedComponents: .date)
                                        .labelsHidden()
                                }
                                .padding(DesignSystem.Spacing.lg)

                                Divider().padding(.leading, DesignSystem.Spacing.lg)

                                HStack {
                                    Image(systemName: "calendar")
                                        .font(.system(size: 14, weight: .light))
                                        .foregroundStyle(.secondary)
                                        .frame(width: 20)
                                    Text("Até")
                                        .font(.system(size: 14, weight: .regular))
                                        .foregroundStyle(.secondary)
                                        .frame(width: 30, alignment: .leading)
                                    Spacer()
                                    DatePicker("", selection: $localFilters.endDate, in: localFilters.startDate..., displayedComponents: .date)
                                        .labelsHidden()
                                }
                                .padding(DesignSystem.Spacing.lg)
                            }
                            .background(
                                RoundedRectangle(cornerRadius: DesignSystem.Radius.lg)
                                    .fill(DesignSystem.Colors.cardBackground)
                                    .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.lg)
                                        .stroke(DesignSystem.Colors.border, lineWidth: 1))
                            )
                            .transition(.move(edge: .top).combined(with: .opacity))
                        }
                    }
                    .padding(.horizontal, DesignSystem.Spacing.xl)
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: localFilters.period)

                    // ── Valor ────────────────────────────────────────
                    VStack(alignment: .leading, spacing: DesignSystem.Spacing.md) {
                        SectionHeader(title: "Valor")
                        HStack(spacing: DesignSystem.Spacing.md) {
                            AmountFilterField(placeholder: "Mínimo", text: $minAmountText)
                            Text("—")
                                .foregroundStyle(.secondary)
                            AmountFilterField(placeholder: "Máximo", text: $maxAmountText)
                        }
                    }
                    .padding(.horizontal, DesignSystem.Spacing.xl)

                    // ── Categorias ───────────────────────────────────
                    VStack(alignment: .leading, spacing: DesignSystem.Spacing.md) {
                        HStack {
                            SectionHeader(title: "Categorias")
                            Spacer()
                            if !localFilters.categories.isEmpty {
                                Button("Limpar") {
                                    localFilters.categories = []
                                }
                                .font(.system(size: 12, weight: .regular))
                                .foregroundStyle(.secondary)
                            }
                        }

                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: DesignSystem.Spacing.sm) {
                            ForEach(TransactionCategory.allCases, id: \.self) { cat in
                                CategoryFilterButton(
                                    category: cat,
                                    isSelected: localFilters.categories.contains(cat)
                                ) {
                                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                    if localFilters.categories.contains(cat) {
                                        localFilters.categories.remove(cat)
                                    } else {
                                        localFilters.categories.insert(cat)
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, DesignSystem.Spacing.xl)

                    Spacer(minLength: DesignSystem.Spacing.xxxl)
                }
                .padding(.top, DesignSystem.Spacing.xl)
            }
            .background(DesignSystem.Colors.groupedBackground)
            .navigationTitle("Filtros")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Limpar tudo") {
                        localFilters = TransactionFilters()
                        minAmountText = ""
                        maxAmountText = ""
                    }
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(.secondary)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Aplicar") {
                        localFilters.minAmount = Double(minAmountText.replacingOccurrences(of: ",", with: "."))
                        localFilters.maxAmount = Double(maxAmountText.replacingOccurrences(of: ",", with: "."))
                        filters = localFilters
                        dismiss()
                    }
                    .font(.system(size: 15, weight: .medium))
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .onAppear {
            localFilters = filters
            minAmountText = filters.minAmount.map { String(format: "%.0f", $0) } ?? ""
            maxAmountText = filters.maxAmount.map { String(format: "%.0f", $0) } ?? ""
        }
    }
}

// MARK: - Filter Sub-components

struct SectionHeader: View {
    let title: String
    var body: some View {
        Text(title)
            .font(.system(size: 13, weight: .regular))
            .foregroundStyle(.secondary)
    }
}

struct FilterTypeButton: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 14, weight: isSelected ? .medium : .regular))
                .foregroundStyle(isSelected ? .primary : .secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: DesignSystem.Radius.md)
                        .fill(isSelected ? DesignSystem.Colors.cardBackground : DesignSystem.Colors.surfaceBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: DesignSystem.Radius.md)
                                .stroke(isSelected ? Color.primary.opacity(0.2) : Color.clear, lineWidth: 1)
                        )
                )
        }
        .buttonStyle(.plain)
    }
}

struct AmountFilterField: View {
    let placeholder: String
    @Binding var text: String

    var body: some View {
        HStack(spacing: 4) {
            Text("R$")
                .font(.system(size: 13, weight: .light))
                .foregroundStyle(.secondary)
            TextField(placeholder, text: $text)
                .font(.system(size: 15, weight: .regular))
                .keyboardType(.decimalPad)
        }
        .padding(DesignSystem.Spacing.md)
        .background(
            RoundedRectangle(cornerRadius: DesignSystem.Radius.md)
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.md)
                    .stroke(DesignSystem.Colors.border, lineWidth: 1))
        )
    }
}

struct CategoryFilterButton: View {
    let category: TransactionCategory
    let isSelected: Bool
    let action: () -> Void

    private var pastelColor: Color {
        switch category.color {
        case "orange": return Color(hex: "FFCC80")
        case "blue":   return Color(hex: "90CAF9")
        case "purple": return Color(hex: "CE93D8")
        case "red":    return Color(hex: "EF9A9A")
        case "pink":   return Color(hex: "F48FB1")
        case "indigo": return Color(hex: "9FA8DA")
        case "teal":   return Color(hex: "80CBC4")
        case "cyan":   return Color(hex: "80DEEA")
        case "green":  return Color(hex: "A5D6A7")
        case "mint":   return Color(hex: "B2DFDB")
        case "yellow": return Color(hex: "FFF176")
        default:       return Color(hex: "BDBDBD")
        }
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: DesignSystem.Spacing.sm) {
                Image(systemName: category.icon)
                    .font(.system(size: 13, weight: .light))
                    .foregroundStyle(isSelected ? pastelColor : .secondary)
                    .frame(width: 20)
                Text(category.rawValue)
                    .font(.system(size: 13, weight: isSelected ? .medium : .regular))
                    .foregroundStyle(isSelected ? .primary : .secondary)
                    .lineLimit(1)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(pastelColor)
                }
            }
            .padding(.horizontal, DesignSystem.Spacing.md)
            .padding(.vertical, DesignSystem.Spacing.md)
            .background(
                RoundedRectangle(cornerRadius: DesignSystem.Radius.md)
                    .fill(isSelected ? pastelColor.opacity(0.1) : DesignSystem.Colors.cardBackground)
                    .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.md)
                        .stroke(isSelected ? pastelColor.opacity(0.4) : DesignSystem.Colors.border, lineWidth: 1))
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Bar Chart

struct BarChartView: View {
    let data: [(label: String, amount: Double, date: Date)]
    let maxValue: Double
    let accentColor: Color
    @State private var highlighted: Int? = nil

    var body: some View {
        VStack(spacing: DesignSystem.Spacing.sm) {
            HStack(alignment: .bottom, spacing: 6) {
                ForEach(Array(data.enumerated()), id: \.offset) { i, item in
                    VStack(spacing: 4) {
                        if highlighted == i {
                            Text(item.amount.formatted(.currency(code: "BRL").precision(.fractionLength(0))))
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(.primary)
                                .fixedSize()
                                .transition(.opacity.combined(with: .scale))
                        }
                        RoundedRectangle(cornerRadius: 6)
                            .fill(highlighted == i ? accentColor : accentColor.opacity(0.3))
                            .frame(height: max(4, CGFloat(item.amount / maxValue) * 120))
                            .animation(.spring(response: 0.4, dampingFraction: 0.7), value: item.amount)
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        withAnimation(.easeInOut(duration: 0.2)) {
                            highlighted = highlighted == i ? nil : i
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity)

            HStack(spacing: 6) {
                ForEach(Array(data.enumerated()), id: \.offset) { i, item in
                    Text(item.label)
                        .font(.system(size: 10, weight: .regular))
                        .foregroundStyle(highlighted == i ? .primary : .secondary)
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }
}

// MARK: - Category Grid Cell

struct CategoryGridCell: View {
    let category: TransactionCategory
    let amount: Double
    let total: Double

    private var pct: Double { total > 0 ? amount / total : 0 }

    private var pastelColor: Color {
        switch category.color {
        case "orange": return Color(hex: "FFCC80")
        case "blue":   return Color(hex: "90CAF9")
        case "purple": return Color(hex: "CE93D8")
        case "red":    return Color(hex: "EF9A9A")
        case "pink":   return Color(hex: "F48FB1")
        case "indigo": return Color(hex: "9FA8DA")
        case "teal":   return Color(hex: "80CBC4")
        case "cyan":   return Color(hex: "80DEEA")
        case "green":  return Color(hex: "A5D6A7")
        case "mint":   return Color(hex: "B2DFDB")
        case "yellow": return Color(hex: "FFF176")
        default:       return Color(hex: "BDBDBD")
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: DesignSystem.Spacing.sm) {
            HStack {
                Image(systemName: category.icon)
                    .font(.system(size: 13, weight: .light))
                    .foregroundStyle(pastelColor)
                Spacer()
                Text("\(Int(pct * 100))%")
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(.secondary)
            }
            Text(category.rawValue)
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Text(amount, format: .currency(code: "BRL"))
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .foregroundStyle(.primary)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(DesignSystem.Colors.surfaceBackground).frame(height: 3)
                    Capsule().fill(pastelColor).frame(width: geo.size.width * pct, height: 3)
                }
            }
            .frame(height: 3)
        }
        .padding(DesignSystem.Spacing.lg)
        .background(
            RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                    .stroke(DesignSystem.Colors.border, lineWidth: 1))
        )
    }
}

// MARK: - Legados para compatibilidade

struct FilterSheetView: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var filterType: TransactionsView.FilterType
    @Binding var customStartDate: Date
    @Binding var customEndDate: Date
    @Binding var showDateRangePicker: Bool

    init(filterType: Binding<TransactionsView.FilterType>,
         filterPeriod: Binding<TransactionsView.FilterPeriod> = .constant(.week),
         customStartDate: Binding<Date>,
         customEndDate: Binding<Date>,
         showDateRangePicker: Binding<Bool>) {
        _filterType = filterType
        _customStartDate = customStartDate
        _customEndDate = customEndDate
        _showDateRangePicker = showDateRangePicker
    }

    var body: some View {
        NavigationStack {
            VStack { Text("Filtros") }
                .navigationTitle("Filtros")
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fechar") { dismiss() } } }
        }
        .presentationDetents([.medium])
    }
}

extension TransactionsView {
    enum FilterType: String, CaseIterable {
        case all = "Todos"; case income = "Ganhos"; case expense = "Gastos"
        var icon: String { "list.bullet" }
        var color: Color { .blue }
    }
}

struct FilterChip: View {
    let label: String; let icon: String; let color: Color; let onRemove: () -> Void
    var body: some View {
        HStack(spacing: 4) {
            Text(label).font(.caption.weight(.medium))
            Button { onRemove() } label: { Image(systemName: "xmark.circle.fill").font(.system(size: 13)) }
        }
        .foregroundStyle(color)
        .padding(.horizontal, 10).padding(.vertical, 4)
        .background(Capsule().fill(color.opacity(0.12)))
    }
}

struct FilterOptionButton: View {
    let title: String; let icon: String; let color: Color; let isSelected: Bool; let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon).foregroundStyle(isSelected ? color : .secondary)
                Text(title).foregroundStyle(isSelected ? .primary : .secondary)
                Spacer()
                if isSelected { Image(systemName: "checkmark").foregroundStyle(color) }
            }
            .padding(DesignSystem.Spacing.lg)
            .background(RoundedRectangle(cornerRadius: DesignSystem.Radius.md)
                .fill(isSelected ? color.opacity(0.1) : DesignSystem.Colors.surfaceBackground))
        }
        .buttonStyle(.plain)
    }
}

struct DatePickerRow: View {
    let label: String; @Binding var date: Date; let icon: String
    var body: some View {
        HStack {
            Image(systemName: icon).foregroundStyle(.secondary)
            Text(label).foregroundStyle(.secondary)
            Spacer()
            DatePicker("", selection: $date, displayedComponents: .date).labelsHidden()
        }
    }
}

struct ModernMiniStat: View {
    let label: String; let value: Double; let color: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value, format: .currency(code: "BRL"))
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(DesignSystem.Spacing.md)
        .background(RoundedRectangle(cornerRadius: DesignSystem.Radius.md)
            .fill(DesignSystem.Colors.cardBackground)
            .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.md)
                .stroke(DesignSystem.Colors.border, lineWidth: 1)))
    }
}
