import SwiftUI
import SwiftData

struct AddInvestmentView: View {
    @Environment(\.modelContext) private var ctx
    @Environment(\.dismiss) private var dismiss
    @Query private var transactions: [Transaction]
    @Query private var goals: [Goal]
    @Query private var investments: [Investment]

    @State private var title = ""
    @State private var selectedType: InvestmentType = .savings
    @State private var selectedIcon = InvestmentType.savings.icon
    @State private var selectedColor = InvestmentType.savings.color
    @State private var initialAmountText = ""
    @State private var note = ""
    @State private var showIconPicker = false

    private let icons = [
        "building.columns.fill", "banknote.fill", "chart.bar.fill", "percent",
        "chart.line.uptrend.xyaxis", "bitcoinsign.circle.fill", "building.2.fill",
        "shield.lefthalf.filled", "briefcase.fill", "dollarsign.circle.fill",
        "creditcard.fill", "lock.fill", "star.fill", "leaf.fill", "globe"
    ]
    private let colors = ["blue", "pink", "green", "teal", "orange", "yellow", "purple", "indigo", "cyan", "red"]

    private var availableBalance: Double {
        let income = transactions.filter { $0.type == .income }.reduce(0) { $0 + $1.amount }
        let expense = transactions.filter { $0.type == .expense }.reduce(0) { $0 + $1.amount }
        let allocated = goals.reduce(0) { $0 + $1.currentAmount }
        let invested = investments.reduce(0) { $0 + $1.amount }
        return max(income - expense - allocated - invested, 0)
    }

    private var initialAmount: Double {
        Double(initialAmountText.replacingOccurrences(of: ",", with: ".")) ?? 0
    }

    private var isValid: Bool {
        let titleOk = !title.trimmingCharacters(in: .whitespaces).isEmpty
        let amountOk = initialAmount == 0 || initialAmount <= availableBalance
        return titleOk && amountOk
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: DesignSystem.Spacing.xxl) {

                    // ── Type Selector ────────────────────────────────
                    VStack(alignment: .leading, spacing: DesignSystem.Spacing.md) {
                        Text("Tipo")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, DesignSystem.Spacing.xl)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: DesignSystem.Spacing.sm) {
                                ForEach(InvestmentType.allCases, id: \.self) { type in
                                    InvestmentTypeChip(
                                        type: type,
                                        isSelected: selectedType == type
                                    ) {
                                        selectedType = type
                                        selectedIcon = type.icon
                                        selectedColor = type.color
                                        if title.isEmpty { title = type.rawValue }
                                    }
                                }
                            }
                            .padding(.horizontal, DesignSystem.Spacing.xl)
                        }
                    }

                    // ── Icon Preview ─────────────────────────────────
                    VStack(spacing: DesignSystem.Spacing.md) {
                        ZStack {
                            Circle()
                                .fill(Color.categoryColor(from: selectedColor).opacity(0.15))
                                .frame(width: 72, height: 72)
                            Image(systemName: selectedIcon)
                                .font(.system(size: 28, weight: .light))
                                .foregroundStyle(Color.categoryColor(from: selectedColor))
                        }
                        .onTapGesture { showIconPicker.toggle() }

                        HStack(spacing: DesignSystem.Spacing.sm) {
                            ForEach(colors, id: \.self) { c in
                                ColorDot(colorName: c, isSelected: selectedColor == c)
                                    .onTapGesture { selectedColor = c }
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, DesignSystem.Spacing.lg)

                    // ── Icon Picker ──────────────────────────────────
                    if showIconPicker {
                        IconColorPicker(
                            icons: icons,
                            colors: colors,
                            selectedIcon: $selectedIcon,
                            selectedColor: $selectedColor,
                            accentColor: Color.categoryColor(from: selectedColor),
                            onIconSelected: { showIconPicker = false }
                        )
                        .padding(.horizontal, DesignSystem.Spacing.xl)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    // ── Fields ───────────────────────────────────────
                    VStack(spacing: 0) {
                        FieldRow(icon: "tag", label: "Nome") {
                            TextField("Ex: Poupança Nubank", text: $title)
                                .font(.system(size: 15))
                                .multilineTextAlignment(.trailing)
                        }
                        Divider().padding(.leading, 52)

                        FieldRow(icon: "dollarsign.circle", label: "Valor inicial") {
                            HStack(spacing: 4) {
                                Text("R$").font(.system(size: 14)).foregroundStyle(.secondary)
                                TextField("0,00", text: $initialAmountText)
                                    .font(.system(size: 15, design: .rounded))
                                    .keyboardType(.decimalPad)
                                    .multilineTextAlignment(.trailing)
                            }
                        }
                        Divider().padding(.leading, 52)

                        FieldRow(icon: "note.text", label: "Nota", alignment: .top) {
                            TextField("Opcional", text: $note, axis: .vertical)
                                .font(.system(size: 15))
                                .multilineTextAlignment(.trailing)
                                .lineLimit(3)
                        }
                    }
                    .background(
                        RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                            .fill(DesignSystem.Colors.cardBackground)
                            .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                                .stroke(DesignSystem.Colors.border, lineWidth: 1))
                    )
                    .padding(.horizontal, DesignSystem.Spacing.xl)

                    if initialAmount > availableBalance && initialAmount > 0 {
                        Text("Valor maior que o saldo disponível")
                            .font(.system(size: 13))
                            .foregroundStyle(DesignSystem.Colors.danger)
                    }

                    Button("Criar investimento") { save() }
                        .buttonStyle(PrimaryButtonStyle(isEnabled: isValid))
                        .disabled(!isValid)
                        .padding(.horizontal, DesignSystem.Spacing.xl)

                    Spacer(minLength: 40)
                }
                .padding(.top, DesignSystem.Spacing.xl)
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: showIconPicker)
            }
            .background(DesignSystem.Colors.groupedBackground)
            .navigationTitle("Novo Investimento")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }.foregroundStyle(.secondary)
                }
            }
        }
    }

    private func save() {
        let amount = Double(initialAmountText.replacingOccurrences(of: ",", with: ".")) ?? 0
        let inv = Investment(
            title: title.trimmingCharacters(in: .whitespaces),
            type: selectedType,
            icon: selectedIcon,
            colorName: selectedColor,
            amount: amount,
            note: note
        )
        ctx.insert(inv)
        if amount > 0 {
            let deposit = InvestmentDeposit(investmentId: inv.id, amount: amount)
            ctx.insert(deposit)
        }
        dismiss()
    }
}

// MARK: - Investment Type Chip

struct InvestmentTypeChip: View {
    let type: InvestmentType
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: type.icon)
                    .font(.system(size: 12, weight: .light))
                Text(type.rawValue)
                    .font(.system(size: 13, weight: isSelected ? .medium : .regular))
            }
            .foregroundStyle(isSelected ? Color.categoryColor(from: type.color) : .secondary)
            .padding(.horizontal, DesignSystem.Spacing.md)
            .padding(.vertical, DesignSystem.Spacing.sm)
            .background(
                Capsule()
                    .fill(isSelected
                          ? Color.categoryColor(from: type.color).opacity(0.12)
                          : DesignSystem.Colors.cardBackground)
                    .overlay(Capsule().stroke(
                        isSelected ? Color.categoryColor(from: type.color).opacity(0.3) : DesignSystem.Colors.border,
                        lineWidth: 1
                    ))
            )
        }
        .buttonStyle(.plain)
    }
}
