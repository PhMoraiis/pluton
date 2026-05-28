import SwiftUI
import SwiftData

struct EditGoalView: View {
    @Environment(\.modelContext) private var ctx
    @Environment(\.dismiss) private var dismiss
    @Bindable var goal: Goal

    @State private var title: String
    @State private var selectedIcon: String
    @State private var selectedColor: String
    @State private var targetText: String
    @State private var hasDeadline: Bool
    @State private var deadline: Date
    @State private var note: String
    @State private var showIconPicker = false
    @State private var showDepositSheet = false
    @State private var showDeleteAlert = false

    private let icons = [
        "airplane", "car.fill", "house.fill", "graduationcap.fill", "shield.fill",
        "heart.fill", "laptopcomputer", "star.fill", "gift.fill", "bag.fill",
        "camera.fill", "bicycle", "figure.walk", "music.note", "gamecontroller.fill",
        "fork.knife", "pawprint.fill", "leaf.fill", "sun.max.fill", "moon.fill"
    ]
    private let colors = ["blue", "orange", "purple", "indigo", "green", "pink", "cyan", "teal", "red", "yellow"]

    init(goal: Goal) {
        self.goal = goal
        _title = State(initialValue: goal.title)
        _selectedIcon = State(initialValue: goal.icon)
        _selectedColor = State(initialValue: goal.colorName)
        _targetText = State(initialValue: String(goal.targetAmount))
        _hasDeadline = State(initialValue: goal.deadline != nil)
        _deadline = State(initialValue: goal.deadline ?? Date().addingTimeInterval(60 * 60 * 24 * 180))
        _note = State(initialValue: goal.note)
    }

    private var color: Color { Color.categoryColor(from: selectedColor) }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: DesignSystem.Spacing.xxl) {

                    // ── Progress Summary ─────────────────────────────
                    VStack(spacing: DesignSystem.Spacing.lg) {
                        ZStack {
                            Circle()
                                .fill(color.opacity(0.12))
                                .frame(width: 72, height: 72)
                            Image(systemName: selectedIcon)
                                .font(.system(size: 28, weight: .light))
                                .foregroundStyle(color)
                        }
                        .onTapGesture { showIconPicker.toggle() }

                        VStack(spacing: 4) {
                            Text(goal.currentAmount, format: .currency(code: "BRL"))
                                .font(.system(size: 28, weight: .semibold, design: .rounded))
                            Text("de \(goal.targetAmount.formatted(.currency(code: "BRL")))")
                                .font(.system(size: 13)).foregroundStyle(.secondary)
                        }

                        // Progress bar
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 4).fill(color.opacity(0.12)).frame(height: 8)
                                RoundedRectangle(cornerRadius: 4).fill(color)
                                    .frame(width: geo.size.width * goal.progress, height: 8)
                            }
                        }
                        .frame(height: 8)
                        .padding(.horizontal, DesignSystem.Spacing.xl)

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
                        FieldRow(icon: "tag", label: "Título") {
                            TextField("Nome da meta", text: $title)
                                .font(.system(size: 15))
                                .multilineTextAlignment(.trailing)
                        }
                        Divider().padding(.leading, 52)

                        FieldRow(icon: "target", label: "Valor alvo") {
                            HStack(spacing: 4) {
                                Text("R$").font(.system(size: 14)).foregroundStyle(.secondary)
                                TextField("0,00", text: $targetText)
                                    .font(.system(size: 15, design: .rounded))
                                    .keyboardType(.decimalPad)
                                    .multilineTextAlignment(.trailing)
                            }
                        }
                        Divider().padding(.leading, 52)

                        FieldRow(icon: "calendar", label: "Prazo") {
                            Toggle("", isOn: $hasDeadline).labelsHidden()
                        }

                        if hasDeadline {
                            let minDate = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
                            FieldRow(icon: "calendar.badge.clock", label: "Data") {
                                DatePicker(
                                    "",
                                    selection: $deadline,
                                    in: minDate...,
                                    displayedComponents: .date
                                )
                                .labelsHidden()
                            }
                            .transition(.opacity.combined(with: .move(edge: .top)))
                        }

                        Divider().padding(.leading, 52)

                        FieldRow(icon: "checkmark.circle", label: "Concluída") {
                            Toggle("", isOn: $goal.isCompleted).labelsHidden()
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

                    Button("Excluir meta") {
                        showDeleteAlert = true
                    }
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(DesignSystem.Colors.danger)

                    Spacer(minLength: 40)
                }
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: showIconPicker)
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: hasDeadline)
            }
            .background(DesignSystem.Colors.groupedBackground)
            .navigationTitle("Editar Meta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }.foregroundStyle(.secondary)
                }
            }
            .sheet(isPresented: $showDepositSheet) {
                GoalDepositView(goal: goal)
            }
            .alert("Excluir meta?", isPresented: $showDeleteAlert) {
                Button("Excluir", role: .destructive) {
                    ctx.delete(goal)
                    dismiss()
                }
                Button("Cancelar", role: .cancel) {}
            } message: { Text("Esta ação não pode ser desfeita.") }
        }
    }

    private func save() {
        goal.title = title.trimmingCharacters(in: .whitespaces)
        goal.icon = selectedIcon
        goal.colorName = selectedColor
        goal.targetAmount = Double(targetText.replacingOccurrences(of: ",", with: ".")) ?? goal.targetAmount
        goal.deadline = hasDeadline ? deadline : nil
        goal.note = note
        dismiss()
    }
}

// MARK: - Goal Deposit View

struct GoalDepositView: View {
    @Environment(\.modelContext) private var ctx
    @Environment(\.dismiss) private var dismiss
    @Bindable var goal: Goal
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
    private var color: Color { Color.categoryColor(from: goal.colorName) }

    var body: some View {
        NavigationStack {
            VStack(spacing: DesignSystem.Spacing.xxl) {

                // ── Goal Info ────────────────────────────────────────
                VStack(spacing: DesignSystem.Spacing.md) {
                    ZStack {
                        Circle().fill(color.opacity(0.12)).frame(width: 64, height: 64)
                        Image(systemName: goal.icon)
                            .font(.system(size: 24, weight: .light))
                            .foregroundStyle(color)
                    }
                    Text(goal.title)
                        .font(.system(size: 17, weight: .medium))
                    Text("\(goal.currentAmount.formatted(.currency(code: "BRL"))) de \(goal.targetAmount.formatted(.currency(code: "BRL")))")
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
                    // ── Amount Input ─────────────────────────────────
                    ModernAmountInputView(amountText: $amountText, type: .income)
                        .padding(.horizontal, DesignSystem.Spacing.xl)

                    if amount > availableBalance {
                        Text("Valor maior que o saldo disponível")
                            .font(.system(size: 13))
                            .foregroundStyle(DesignSystem.Colors.danger)
                    }

                    Button("Adicionar à meta") { deposit() }
                        .buttonStyle(PrimaryButtonStyle(isEnabled: isValid))
                        .disabled(!isValid)
                        .padding(.horizontal, DesignSystem.Spacing.xl)
                }

                Spacer()
            }
            .background(DesignSystem.Colors.groupedBackground)
            .navigationTitle("Adicionar à Meta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }.foregroundStyle(.secondary)
                }
            }
        }
    }

    private func deposit() {
        goal.currentAmount += amount
        if goal.currentAmount >= goal.targetAmount {
            goal.isCompleted = true
        }
        dismiss()
    }
}
