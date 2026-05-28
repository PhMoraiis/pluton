import SwiftUI

struct TransactionRowView: View {
    let transaction: Transaction

    var body: some View {
        HStack(spacing: DesignSystem.Spacing.md) {
            ZStack {
                Circle()
                    .fill(DesignSystem.Colors.surfaceBackground)
                    .frame(width: 40, height: 40)
                Image(systemName: transaction.category.icon)
                    .font(.system(size: 15, weight: .light))
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(transaction.title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(transaction.category.rawValue)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 3) {
                Text(transaction.type == .income
                     ? "+\(transaction.amount.formatted(.currency(code: "BRL")))"
                     : "-\(transaction.amount.formatted(.currency(code: "BRL")))")
                    .font(.system(size: 15, weight: .medium, design: .rounded))
                    .foregroundStyle(transaction.type == .income ? DesignSystem.Colors.success : .primary)
                Text(transaction.date, style: .date)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, DesignSystem.Spacing.lg)
        .padding(.vertical, DesignSystem.Spacing.md)
    }
}
