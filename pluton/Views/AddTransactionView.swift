import SwiftUI
import SwiftData

struct AddTransactionView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var type: TransactionType = .income
    @State private var title = ""
    @State private var amountText = ""
    @State private var category: TransactionCategory = .salary
    @State private var date = Date()
    @State private var note = ""
    @FocusState private var focusedField: Field?

    enum Field { case title, amount, note }

    private var amount: Double { Double(amountText.replacingOccurrences(of: ",", with: ".")) ?? 0 }
    private var isValid: Bool { !title.isEmpty && amount > 0 }

    private var availableCategories: [TransactionCategory] {
        type == .expense ? TransactionCategory.expenseCategories : TransactionCategory.incomeCategories
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: DesignSystem.Spacing.xxl) {
                    ModernTypeSelectorView(selectedType: $type)
                        .onChange(of: type) { _, _ in
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            category = type == .expense ? .food : .salary
                        }

                    ModernAmountInputView(amountText: $amountText, type: type)
                        .focused($focusedField, equals: .amount)

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
                            Text("Salvar Transação")
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle(isEnabled: isValid))
                    .disabled(!isValid)
                }
                .padding(DesignSystem.Spacing.xl)
                .padding(.bottom, DesignSystem.Spacing.xl)
            }
            .background(DesignSystem.Colors.groupedBackground)
            .navigationTitle("Nova Transação")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
            }
            .onAppear { focusedField = .amount }
        }
    }

    private func save() {
        let transaction = Transaction(
            title: title,
            amount: amount,
            type: type,
            category: category,
            date: date,
            note: note
        )
        modelContext.insert(transaction)
        dismiss()
    }
}
