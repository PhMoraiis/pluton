import Foundation
import SwiftData

enum TransactionType: String, Codable, CaseIterable {
    case income = "Ganho"
    case expense = "Gasto"
}

enum TransactionCategory: String, Codable, CaseIterable {
    // Gastos
    case food = "Alimentação"
    case transport = "Transporte"
    case housing = "Moradia"
    case health = "Saúde"
    case entertainment = "Lazer"
    case education = "Educação"
    case shopping = "Compras"
    case subscriptions = "Assinaturas"
    case other = "Outros"
    // Ganhos
    case salary = "Salário"
    case freelance = "Freelance"
    case investment = "Investimentos"
    case bonus = "Bônus"
    case gift = "Presente"

    var icon: String {
        switch self {
        case .food: return "fork.knife"
        case .transport: return "car.fill"
        case .housing: return "house.fill"
        case .health: return "heart.fill"
        case .entertainment: return "gamecontroller.fill"
        case .education: return "book.fill"
        case .shopping: return "bag.fill"
        case .subscriptions: return "repeat"
        case .other: return "ellipsis.circle.fill"
        case .salary: return "briefcase.fill"
        case .freelance: return "laptopcomputer"
        case .investment: return "chart.line.uptrend.xyaxis"
        case .bonus: return "star.fill"
        case .gift: return "gift.fill"
        }
    }

    var color: String {
        switch self {
        case .food: return "orange"
        case .transport: return "blue"
        case .housing: return "purple"
        case .health: return "red"
        case .entertainment: return "pink"
        case .education: return "indigo"
        case .shopping: return "teal"
        case .subscriptions: return "cyan"
        case .other: return "gray"
        case .salary: return "green"
        case .freelance: return "mint"
        case .investment: return "green"
        case .bonus: return "yellow"
        case .gift: return "pink"
        }
    }

    static var expenseCategories: [TransactionCategory] {
        [.food, .transport, .housing, .health, .entertainment, .education, .shopping, .subscriptions, .other]
    }

    static var incomeCategories: [TransactionCategory] {
        [.salary, .freelance, .investment, .bonus, .gift, .other]
    }
}

@Model
final class Transaction {
    var id: UUID
    var title: String
    var amount: Double
    var type: TransactionType
    var category: TransactionCategory
    var date: Date
    var note: String
    var forecastEntryId: UUID?
    var isFixed: Bool
    var fixedGroupId: UUID?

    init(
        id: UUID = UUID(),
        title: String,
        amount: Double,
        type: TransactionType,
        category: TransactionCategory,
        date: Date = Date(),
        note: String = "",
        forecastEntryId: UUID? = nil,
        isFixed: Bool = false,
        fixedGroupId: UUID? = nil
    ) {
        self.id = id
        self.title = title
        self.amount = amount
        self.type = type
        self.category = category
        self.date = date
        self.note = note
        self.forecastEntryId = forecastEntryId
        self.isFixed = isFixed
        self.fixedGroupId = fixedGroupId
    }
}
