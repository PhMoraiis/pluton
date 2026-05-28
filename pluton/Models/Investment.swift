import Foundation
import SwiftData

enum InvestmentType: String, Codable, CaseIterable {
    case savings = "Poupança"
    case piggyBank = "Cofrinho"
    case cdb = "CDB"
    case cdi = "CDI"
    case stocks = "Ações"
    case crypto = "Cripto"
    case realEstate = "Fundos Imobiliários"
    case treasury = "Tesouro Direto"
    case custom = "Personalizado"

    var icon: String {
        switch self {
        case .savings:    return "building.columns.fill"
        case .piggyBank:  return "banknote.fill"
        case .cdb:        return "chart.bar.fill"
        case .cdi:        return "percent"
        case .stocks:     return "chart.line.uptrend.xyaxis"
        case .crypto:     return "bitcoinsign.circle.fill"
        case .realEstate: return "building.2.fill"
        case .treasury:   return "shield.lefthalf.filled"
        case .custom:     return "briefcase.fill"
        }
    }

    var color: String {
        switch self {
        case .savings:    return "blue"
        case .piggyBank:  return "pink"
        case .cdb:        return "green"
        case .cdi:        return "teal"
        case .stocks:     return "orange"
        case .crypto:     return "yellow"
        case .realEstate: return "purple"
        case .treasury:   return "indigo"
        case .custom:     return "cyan"
        }
    }
}

@Model
final class Investment {
    var id: UUID
    var title: String
    var type: InvestmentType
    var icon: String
    var colorName: String
    var amount: Double
    var note: String
    var createdAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        type: InvestmentType,
        icon: String,
        colorName: String,
        amount: Double = 0,
        note: String = "",
        createdAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.type = type
        self.icon = icon
        self.colorName = colorName
        self.amount = amount
        self.note = note
        self.createdAt = createdAt
    }
}

@Model
final class InvestmentDeposit {
    var id: UUID
    var investmentId: UUID
    var amount: Double
    var date: Date
    var note: String

    init(
        id: UUID = UUID(),
        investmentId: UUID,
        amount: Double,
        date: Date = Date(),
        note: String = ""
    ) {
        self.id = id
        self.investmentId = investmentId
        self.amount = amount
        self.date = date
        self.note = note
    }
}
