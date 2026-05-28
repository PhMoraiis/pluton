import SwiftUI
import SwiftData

struct EditInvestmentView: View {
    @Environment(\.modelContext) private var ctx
    @Environment(\.dismiss) private var dismiss
    @Bindable var investment: Investment

    @State private var title: String
    @State private var selectedIcon: String
    @State private var selectedColor: String
    @State private var note: String
    @State private var showIconPicker = false
    @State private var showDepositSheet = false
    @State private var showDeleteAlert = false

    private let icons = [
        "building.columns.fill", "banknote.fill", "chart.bar.fill", "percent",
        "chart.line.uptrend.xyaxis", "bitcoinsign.circle.fill", "building.2.fill",
        "shield.lefthalf.filled", "briefcase.fill", "dollarsign.circle.fill",
        "creditcard.fill", "lock.fill", "star.fill", "leaf.fill", "globe"
    ]
    private let colors = ["blue", "pink", "green", "teal", "orange", "yellow", "purple", "indigo", "cyan", "red"]

    init(investment: Investment) {
        self.investment = investment
        _title = State(initialValue: investment.title)
        _selectedIcon = State(initialValue: investment.icon)
        _selectedColor = State(initialValue: investment.colorName)
        _note = State(initialValue: investment.note)
    }

    private var color: Color { Color.categoryColor(from: selectedColor) }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: DesignSystem.Spacing.xxl) {

                    // ── Summary ──────────────────────────────────────
                    VStack(spacing: DesignSystem.Spacing.md) {
                        ZStack {
                            Circle().fill(color.opacity(0.12)).frame(width: 72, height: 72)
                            Image(systemName: selectedIcon)
                                .font(.system(size: 28, weight: .light))
                                .foregroundStyle(color)
                        }
                        .onTapGesture { showIconPicker.toggle() }

                        Text(investment.amount, format: .currency(code: "BRL"))
                            .font(.system(size: 32, weight: .semibold, design: .rounded))

                        Text(investment.type.rawValue)
                            .font(.system(size: 13)).foregroundStyle(.secondary)

                        Button {
                            showDepositSheet = true
                        } label: {
                            Label("Adicionar dinheiro", systemImage: "plus.circle.fill")
                                .font(.system(size: 14, weight: .medium))
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                    .padding(.top, DesignSystem.Spacing.xl)

                    // ── Icon Picker ──────────────────────────────────
                    if showIconPicker {
                        IconColorPicker(
                            icons: icons,
                            colors: colors,
                            selectedIcon: $selectedIcon,
                            selectedColor: $selectedColor,
                            accentColor: color,
                            onIconSelected: { showIconPicker = false }
                        )
                        .padding(.horizontal, DesignSystem.Spacing.xl)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    // ── Fields ───────────────────────────────────────
                    VStack(spacing: 0) {
                        FieldRow(icon: "tag", label: "Nome") {
                            TextField("Nome", text: $title)
                                .font(.system(size: 15))
                                .multilineTextAlignment(.trailing)
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

                    Button("Salvar alterações") { save() }
                        .buttonStyle(PrimaryButtonStyle())
                        .padding(.horizontal, DesignSystem.Spacing.xl)

                    Button("Excluir investimento") { showDeleteAlert = true }
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(DesignSystem.Colors.danger)

                    Spacer(minLength: 40)
                }
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: showIconPicker)
            }
            .background(DesignSystem.Colors.groupedBackground)
            .navigationTitle("Editar Investimento")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }.foregroundStyle(.secondary)
                }
            }
            .sheet(isPresented: $showDepositSheet) {
                InvestmentDepositView(investment: investment)
            }
            .alert("Excluir investimento?", isPresented: $showDeleteAlert) {
                Button("Excluir", role: .destructive) {
                    ctx.delete(investment)
                    dismiss()
                }
                Button("Cancelar", role: .cancel) {}
            } message: { Text("Esta ação não pode ser desfeita.") }
        }
    }

    private func save() {
        investment.title = title.trimmingCharacters(in: .whitespaces)
        investment.icon = selectedIcon
        investment.colorName = selectedColor
        investment.note = note
        dismiss()
    }
}

// MARK: - Investment Deposit View

struct InvestmentDepositView: View {
    @Environment(\.modelContext) private var ctx
    @Environment(\.dismiss) private var dismiss
    @Bindable var investment: Investment
    @Query private var transactions: [Transaction]
    @Query private var goals: [Goal]
    @Query private var investments: [Investment]

    @State private var amountText = ""

    private var availableBalance: Double {
        let income = transactions.filter { $0.type == .income }.reduce(0) { $0 + $1.amount }
        let expense = transactions.filter { $0.type == .expense }.reduce(0) { $0 + $1.amount }
        let allocated = goals.reduce(0) { $0 + $1.currentAmount }
        let invested = investments.reduce(0) { $0 + $1.amount }
        return max(income - expense - allocated - invested, 0)
    }

    private var amount: Double { Double(amountText.replacingOccurrences(of: ",", with: ".")) ?? 0 }
    private var isValid: Bool { amount > 0 && amount <= availableBalance }
    private var color: Color { Color.categoryColor(from: investment.colorName) }

    var body: some View {
        NavigationStack {
            VStack(spacing: DesignSystem.Spacing.xxl) {

                VStack(spacing: DesignSystem.Spacing.md) {
                    ZStack {
                        Circle().fill(color.opacity(0.12)).frame(width: 64, height: 64)
                        Image(systemName: investment.icon)
                            .font(.system(size: 24, weight: .light))
                            .foregroundStyle(color)
                    }
                    Text(investment.title)
                        .font(.system(size: 17, weight: .medium))
                    Text("Saldo atual: \(investment.amount.formatted(.currency(code: "BRL")))")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                }
                .padding(.top, DesignSystem.Spacing.xxl)

                // ── Saldo disponível ─────────────────────────────────
                HStack(spacing: DesignSystem.Spacing.sm) {
                    Image(systemName: availableBalance > 0 ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(availableBalance > 0 ? Color(hex: "B5D5C5") : DesignSystem.Colors.danger)
                    Text(availableBalance > 0
                         ? "Disponível: \(availableBalance.formatted(.currency(code: "BRL")))"
                         : "Sem saldo disponível")
                        .font(.system(size: 13))
                        .foregroundStyle(availableBalance > 0 ? .secondary : DesignSystem.Colors.danger)
                    Spacer()
                }
                .padding(.horizontal, DesignSystem.Spacing.xl)

                if availableBalance > 0 {
                    ModernAmountInputView(amountText: $amountText, type: .income)
                        .padding(.horizontal, DesignSystem.Spacing.xl)

                    if amount > availableBalance && amount > 0 {
                        Text("Valor maior que o saldo disponível")
                            .font(.system(size: 13))
                            .foregroundStyle(DesignSystem.Colors.danger)
                    }

                    Button("Adicionar ao investimento") { deposit() }
                        .buttonStyle(PrimaryButtonStyle(isEnabled: isValid))
                        .disabled(!isValid)
                        .padding(.horizontal, DesignSystem.Spacing.xl)
                }

                Spacer()
            }
            .background(DesignSystem.Colors.groupedBackground)
            .navigationTitle("Adicionar Valor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }.foregroundStyle(.secondary)
                }
            }
        }
    }

    private func deposit() {
        investment.amount += amount
        let deposit = InvestmentDeposit(investmentId: investment.id, amount: amount)
        ctx.insert(deposit)
        dismiss()
    }
}
