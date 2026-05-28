import Foundation
import SwiftData

@Model
final class ForecastEntry {
    var id: UUID
    var title: String
    var amount: Double
    var type: TransactionType
    var category: TransactionCategory
    var month: Date          // primeiro dia do mês alvo
    var isRecurring: Bool
    var recurringMonths: Int // quantos meses se repete (incluindo o inicial)
    var note: String
    /// Meses (primeiro dia do mês) em que esta previsão foi concluída.
    /// Substitui o antigo `isCompleted` para suportar recorrência mês a mês.
    var completedMonths: [Date]

    init(
        id: UUID = UUID(),
        title: String,
        amount: Double,
        type: TransactionType,
        category: TransactionCategory,
        month: Date,
        isRecurring: Bool = false,
        recurringMonths: Int = 1,
        note: String = "",
        completedMonths: [Date] = []
    ) {
        self.id = id
        self.title = title
        self.amount = amount
        self.type = type
        self.category = category
        self.month = Calendar.current.startOfMonth(for: month)
        self.isRecurring = isRecurring
        self.recurringMonths = recurringMonths
        self.note = note
        self.completedMonths = completedMonths
    }

    /// Retorna se esta previsão está concluída para um mês específico.
    func isCompleted(for targetMonth: Date) -> Bool {
        let cal = Calendar.current
        let target = cal.startOfMonth(for: targetMonth)
        return completedMonths.contains { cal.isDate($0, equalTo: target, toGranularity: .month) }
    }

    /// Marca ou desmarca a conclusão para um mês específico.
    func setCompleted(_ completed: Bool, for targetMonth: Date) {
        let cal = Calendar.current
        let target = cal.startOfMonth(for: targetMonth)
        if completed {
            if !isCompleted(for: target) {
                completedMonths.append(target)
            }
        } else {
            completedMonths.removeAll { cal.isDate($0, equalTo: target, toGranularity: .month) }
        }
    }
}

extension Calendar {
    func startOfMonth(for date: Date) -> Date {
        let comps = dateComponents([.year, .month], from: date)
        return self.date(from: comps) ?? date
    }

    func startOfNextMonth() -> Date {
        let nextMonth = date(byAdding: .month, value: 1, to: Date())!
        return startOfMonth(for: nextMonth)
    }
}
