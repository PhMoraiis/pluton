import SwiftUI
import SwiftData

// MARK: - FAB Button Style

struct FABButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.9 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

// MARK: - FAB Menu

struct FloatingActionMenu: View {
    @Binding var isExpanded: Bool
    let activeTab: AppTab
    let onAddTransaction: () -> Void
    let onAddForecast: () -> Void
    let onAddGoal: () -> Void
    let onAddInvestment: () -> Void

    var body: some View {
        VStack(alignment: .trailing, spacing: DesignSystem.Spacing.sm) {
            if isExpanded {
                VStack(alignment: .trailing, spacing: DesignSystem.Spacing.xs) {
                    switch activeTab {
                    case .goals:
                        FABMenuItem(label: "Nova Meta", icon: "target") {
                            close { onAddGoal() }
                        }
                    case .investments:
                        FABMenuItem(label: "Novo Investimento", icon: "chart.pie") {
                            close { onAddInvestment() }
                        }
                    case .forecast:
                        FABMenuItem(label: "Nova Previsão", icon: "calendar") {
                            close { onAddForecast() }
                        }
                    default:
                        FABMenuItem(label: "Nova Transação", icon: "plus") {
                            close { onAddTransaction() }
                        }
                    }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) { isExpanded.toggle() }
            } label: {
                Image(systemName: isExpanded ? "xmark" : "plus")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(Color(.systemBackground))
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(Color.primary))
            }
            .buttonStyle(FABButtonStyle())
        }
    }

    private func close(then action: @escaping () -> Void) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { isExpanded = false }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { action() }
    }
}

struct FABMenuItem: View {
    let label: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: DesignSystem.Spacing.sm) {
                Text(label)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.primary)

                Image(systemName: icon)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Color(.systemBackground))
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.primary))
            }
            .padding(.horizontal, DesignSystem.Spacing.md)
            .padding(.vertical, DesignSystem.Spacing.sm)
            .background(
                Capsule()
                    .fill(DesignSystem.Colors.cardBackground)
                    .overlay(Capsule().stroke(DesignSystem.Colors.border, lineWidth: 1))
            )
        }
        .buttonStyle(FABButtonStyle())
    }
}

// MARK: - Modern Type Selector

struct ModernTypeSelectorView: View {
    @Binding var selectedType: TransactionType
    @Namespace private var animation

    var body: some View {
        HStack(spacing: 0) {
            ForEach(TransactionType.allCases, id: \.self) { type in
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedType = type }
                } label: {
                    Text(type.rawValue)
                        .font(.system(size: 15, weight: selectedType == type ? .medium : .regular))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, DesignSystem.Spacing.md)
                        .background {
                            if selectedType == type {
                                RoundedRectangle(cornerRadius: DesignSystem.Radius.md)
                                    .fill(DesignSystem.Colors.surfaceBackground)
                                    .matchedGeometryEffect(id: "typeSelector", in: animation)
                            }
                        }
                        .foregroundStyle(selectedType == type ? .primary : .secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: DesignSystem.Radius.lg)
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.lg)
                    .stroke(DesignSystem.Colors.border, lineWidth: 1))
        )
    }
}

// MARK: - Modern Amount Input

struct ModernAmountInputView: View {
    @Binding var amountText: String
    let type: TransactionType

    var body: some View {
        VStack(alignment: .leading, spacing: DesignSystem.Spacing.sm) {
            Text("Valor")
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(.secondary)

            HStack(alignment: .center, spacing: 4) {
                Text("R$")
                    .font(.system(size: 24, weight: .light, design: .rounded))
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)

                TextField("0,00", text: $amountText)
                    .font(.system(size: 48, weight: .semibold, design: .rounded))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.leading)
                    .minimumScaleFactor(0.5)
                    .foregroundStyle(.primary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, DesignSystem.Spacing.xl)
        .padding(.vertical, DesignSystem.Spacing.xxl)
        .background(
            RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                    .stroke(DesignSystem.Colors.border, lineWidth: 1))
        )
    }
}

// MARK: - Transaction Row with Actions

struct TransactionRowWithActions: View {
    let transaction: Transaction
    @Binding var transactionToEdit: Transaction?
    @Binding var transactionToDelete: Transaction?
    @Binding var showDeleteAlert: Bool

    var body: some View {
        ModernTransactionRow(transaction: transaction)
            .contentShape(Rectangle())
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                Button(role: .destructive) {
                    transactionToDelete = transaction
                    showDeleteAlert = true
                } label: { Label("Excluir", systemImage: "trash") }
            }
            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                Button { transactionToEdit = transaction } label: { Label("Editar", systemImage: "pencil") }
                    .tint(.blue)
            }
            .contextMenu {
                Button { transactionToEdit = transaction } label: { Label("Editar", systemImage: "pencil") }
                Button(role: .destructive) {
                    transactionToDelete = transaction
                    showDeleteAlert = true
                } label: { Label("Excluir", systemImage: "trash") }
            }
    }
}
