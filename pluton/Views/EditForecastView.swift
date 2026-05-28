import SwiftUI
import SwiftData

struct EditForecastView: View {
    @Environment(\.modelContext) private var ctx
    @Environment(\.dismiss) private var dismiss

    let entry: ForecastEntry
    let viewingMonth: Date

    @State private var type: TransactionType
    @State private var title: String
    @State private var amountText: String
    @State private var category: TransactionCategory
    @State private var month: Date
    @State private var isRecurring: Bool
    @State private var recurringMonths: Int
    @State private var note: String
    @State private var isCompleted: Bool
    @FocusState private var focusedField: Field?

    enum Field { case title, amount, note }

    init(entry: ForecastEntry, viewingMonth: Date) {
        self.entry = entry
        self.viewingMonth = viewingMonth
        _type            = State(initialValue: entry.type)
        _title           = State(initialValue: entry.title)
        _amountText      = State(initialValue: String(format: "%.2f", entry.amount).replacingOccurrences(of: ".", with: ","))
        _category        = State(initialValue: entry.category)
        _month           = State(initialValue: entry.month)
        _isRecurring     = State(initialValue: entry.isRecurring)
        _recurringMonths = State(initialValue: entry.recurringMonths)
        _note            = State(initialValue: entry.note)
        _isCompleted     = State(initialValue: entry.isCompleted(for: viewingMonth))
    }

    private var amount: Double { Double(amountText.replacingOccurrences(of: ",", with: ".")) ?? 0 }
    private var isValid: Bool  { !title.isEmpty && amount > 0 }

    // Pode concluir se o mês visualizado já chegou (não é futuro)
    private var canComplete: Bool {
        let cal = Calendar.current
        let viewingMonthStart = cal.startOfMonth(for: viewingMonth)
        let todayMonthStart = cal.startOfMonth(for: Date())
        return viewingMonthStart <= todayMonthStart
    }

    private var availableCategories: [TransactionCategory] {
        type == .expense ? TransactionCategory.expenseCategories : TransactionCategory.incomeCategories
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: DesignSystem.Spacing.xxl) {

                    ModernTypeSelectorView(selectedType: $type)
                        .onChange(of: type) { _, _ in
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            if type == .expense && !TransactionCategory.expenseCategories.contains(category) { category = .food }
                            else if type == .income && !TransactionCategory.incomeCategories.contains(category) { category = .salary }
                        }

                    ModernAmountInputView(amountText: $amountText, type: type)
                        .focused($focusedField, equals: .amount)

                    VStack(spacing: 0) {
                        FieldRow(icon: "text.alignleft", label: "Título") {
                            TextField("Ex: Aluguel, Salário...", text: $title)
                                .focused($focusedField, equals: .title)
                        }
                        Divider().padding(.leading, DesignSystem.Spacing.lg)

                        FieldRow(icon: "tag", label: "Categoria") {
                            Picker("", selection: $category) {
                                ForEach(availableCategories, id: \.self) { cat in
                                    Label(cat.rawValue, systemImage: cat.icon).tag(cat)
                                }
                            }.labelsHidden()
                        }
                        Divider().padding(.leading, DesignSystem.Spacing.lg)

                        FieldRow(icon: "calendar", label: "Data") {
                            DatePicker("", selection: $month, displayedComponents: .date).labelsHidden()
                        }
                        Divider().padding(.leading, DesignSystem.Spacing.lg)

                        FieldRow(icon: "repeat", label: "Recorrente") {
                            Toggle("", isOn: $isRecurring)
                                .labelsHidden()
                                .onChange(of: isRecurring) { _, _ in
                                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                }
                        }

                        if isRecurring {
                            Divider().padding(.leading, DesignSystem.Spacing.lg)
                            FieldRow(icon: "number.circle", label: "Repetir por") {
                                HStack(spacing: DesignSystem.Spacing.md) {
                                    Button {
                                        if recurringMonths > 2 {
                                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                            recurringMonths -= 1
                                        }
                                    } label: {
                                        Image(systemName: "minus.circle.fill")
                                            .font(.title3)
                                            .foregroundStyle(recurringMonths > 2 ? DesignSystem.Colors.primary : .secondary)
                                    }
                                    .buttonStyle(.plain)

                                    Text("\(recurringMonths) meses")
                                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                                        .frame(minWidth: 80, alignment: .center)

                                    Button {
                                        if recurringMonths < 60 {
                                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                            recurringMonths += 1
                                        }
                                    } label: {
                                        Image(systemName: "plus.circle.fill")
                                            .font(.title3)
                                            .foregroundStyle(DesignSystem.Colors.primary)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .transition(.move(edge: .top).combined(with: .opacity))
                        }

                        Divider().padding(.leading, DesignSystem.Spacing.lg)

                        FieldRow(icon: "note.text", label: "Nota", alignment: .top) {
                            TextField("Opcional...", text: $note, axis: .vertical)
                                .focused($focusedField, equals: .note)
                                .lineLimit(3)
                        }

                        Divider().padding(.leading, DesignSystem.Spacing.lg)

                        // Concluída — bloqueado se mês ainda não chegou
                        FieldRow(icon: "checkmark.circle", label: "Concluída") {
                            if canComplete {
                                Toggle("", isOn: $isCompleted)
                                    .labelsHidden()
                                    .onChange(of: isCompleted) { _, _ in
                                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                    }
                            } else {
                                HStack(spacing: 6) {
                                    Image(systemName: "lock.fill")
                                        .font(.system(size: 12))
                                        .foregroundStyle(.tertiary)
                                    Text("Disponível em \(monthName(viewingMonth))")
                                        .font(.system(size: 12))
                                        .foregroundStyle(.tertiary)
                                }
                            }
                        }
                    }
                    .background(
                        RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                            .fill(DesignSystem.Colors.cardBackground)
                            .shadow(color: DesignSystem.Shadows.sm.color, radius: DesignSystem.Shadows.sm.radius, y: DesignSystem.Shadows.sm.y)
                    )
                    .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isRecurring)

                    Button {
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        save()
                    } label: {
                        HStack(spacing: DesignSystem.Spacing.sm) {
                            Image(systemName: "checkmark.circle.fill").font(.system(size: 18))
                            Text("Salvar Alterações")
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle(isEnabled: isValid))
                    .disabled(!isValid)
                }
                .padding(DesignSystem.Spacing.xl)
                .padding(.bottom, DesignSystem.Spacing.xl)
            }
            .background(DesignSystem.Colors.groupedBackground)
            .navigationTitle("Editar Previsão")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
            }
        }
    }

    private func monthName(_ date: Date) -> String {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "pt_BR")
        fmt.dateFormat = "MMMM"
        return fmt.string(from: date).capitalized
    }

    private func save() {
        // Cria transação ao concluir este mês específico
        let wasCompleted = entry.isCompleted(for: viewingMonth)
        if isCompleted && !wasCompleted {
            let cal = Calendar.current
            let transactionDate = cal.isDate(viewingMonth, equalTo: Date(), toGranularity: .month)
                ? Date()
                : cal.startOfMonth(for: viewingMonth)
            let transaction = Transaction(
                title: title,
                amount: amount,
                type: type,
                category: category,
                date: transactionDate,
                note: note,
                forecastEntryId: entry.id
            )
            ctx.insert(transaction)
        }

        entry.title           = title
        entry.amount          = amount
        entry.type            = type
        entry.category        = category
        entry.month           = Calendar.current.startOfMonth(for: month)
        entry.isRecurring     = isRecurring
        entry.recurringMonths = isRecurring ? recurringMonths : 1
        entry.note            = note
        if canComplete {
            entry.setCompleted(isCompleted, for: viewingMonth)
        }
        dismiss()
    }
}
