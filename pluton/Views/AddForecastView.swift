import SwiftUI
import SwiftData

struct AddForecastView: View {
    @Environment(\.modelContext) private var ctx
    @Environment(\.dismiss) private var dismiss

    @State private var type: TransactionType = .income
    @State private var title = ""
    @State private var amountText = ""
    @State private var category: TransactionCategory = .salary
    @State private var month: Date = Calendar.current.startOfNextMonth()
    @State private var isRecurring = false
    @State private var recurringMonths = 2
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
                            DatePicker("", selection: $month, displayedComponents: [.date])
                                .labelsHidden()
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
                            Image(systemName: "calendar.badge.plus").font(.system(size: 18))
                            Text("Salvar Previsão")
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle(isEnabled: isValid))
                    .disabled(!isValid)
                }
                .padding(DesignSystem.Spacing.xl)
            }
            .background(DesignSystem.Colors.groupedBackground)
            .navigationTitle("Nova Previsão")
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
        let entry = ForecastEntry(
            title: title,
            amount: amount,
            type: type,
            category: category,
            month: month,
            isRecurring: isRecurring,
            recurringMonths: isRecurring ? recurringMonths : 1,
            note: note
        )
        ctx.insert(entry)
        dismiss()
    }
}
