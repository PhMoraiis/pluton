import SwiftUI
import SwiftData

struct EditTransactionView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    let transaction: Transaction

    @State private var type: TransactionType
    @State private var title: String
    @State private var amountText: String
    @State private var category: TransactionCategory
    @State private var date: Date
    @State private var note: String
    @FocusState private var focusedField: Field?

    enum Field { case title, amount, note }

    init(transaction: Transaction) {
        self.transaction = transaction
        _type       = State(initialValue: transaction.type)
        _title      = State(initialValue: transaction.title)
        _amountText = State(initialValue: String(format: "%.2f", transaction.amount).replacingOccurrences(of: ".", with: ","))
        _category   = State(initialValue: transaction.category)
        _date       = State(initialValue: transaction.date)
        _note       = State(initialValue: transaction.note)
    }

    private var amount: Double { Double(amountText.replacingOccurrences(of: ",", with: ".")) ?? 0 }
    private var isValid: Bool  { !title.isEmpty && amount > 0 }

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

                    if transaction.forecastEntryId != nil {
                        HStack(spacing: 6) {
                            Image(systemName: "calendar.badge.checkmark")
                                .font(.system(size: 13, weight: .light))
                                .foregroundStyle(.secondary)
                            Text("Originada de uma previsão")
                                .font(.system(size: 13, weight: .regular))
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, DesignSystem.Spacing.xl)
                    }

                    VStack(spacing: 0) {
                        FieldRow(icon: "text.alignleft", label: "Título") {
                            TextField("Ex: Almoço, Salário...", text: $title)
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
                            DatePicker("", selection: $date, displayedComponents: .date).labelsHidden()
                        }
                        Divider().padding(.leading, DesignSystem.Spacing.lg)
                        FieldRow(icon: "note.text", label: "Nota", alignment: .top) {
                            TextField("Opcional...", text: $note, axis: .vertical)
                                .focused($focusedField, equals: .note)
                                .lineLimit(3)
                        }
                    }
                    .background(
                        RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                            .fill(DesignSystem.Colors.cardBackground)
                            .shadow(color: DesignSystem.Shadows.sm.color, radius: DesignSystem.Shadows.sm.radius, y: DesignSystem.Shadows.sm.y)
                    )

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
            .navigationTitle("Editar Transação")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
            }
        }
    }

    private func save() {
        transaction.title    = title
        transaction.amount   = amount
        transaction.type     = type
        transaction.category = category
        transaction.date     = date
        transaction.note     = note
        dismiss()
    }
}
