import Foundation
import SwiftData

enum GoalPreset: String, Codable, CaseIterable {
    case travel = "Viagem"
    case car = "Carro"
    case house = "Casa"
    case education = "Educação"
    case emergency = "Reserva de Emergência"
    case wedding = "Casamento"
    case electronics = "Eletrônicos"
    case custom = "Personalizado"

    var icon: String {
        switch self {
        case .travel:    return "airplane"
        case .car:       return "car.fill"
        case .house:     return "house.fill"
        case .education: return "graduationcap.fill"
        case .emergency: return "shield.fill"
        case .wedding:   return "heart.fill"
        case .electronics: return "laptopcomputer"
        case .custom:    return "star.fill"
        }
    }

    var color: String {
        switch self {
        case .travel:    return "blue"
        case .car:       return "orange"
        case .house:     return "purple"
        case .education: return "indigo"
        case .emergency: return "green"
        case .wedding:   return "pink"
        case .electronics: return "cyan"
        case .custom:    return "teal"
        }
    }
}

@Model
final class Goal {
    var id: UUID
    var title: String
    var icon: String
    var colorName: String
    var targetAmount: Double
    var currentAmount: Double
    var deadline: Date?
    var note: String
    var createdAt: Date
    var isCompleted: Bool

    init(
        id: UUID = UUID(),
        title: String,
        icon: String,
        colorName: String,
        targetAmount: Double,
        currentAmount: Double = 0,
        deadline: Date? = nil,
        note: String = "",
        createdAt: Date = Date(),
        isCompleted: Bool = false
    ) {
        self.id = id
        self.title = title
        self.icon = icon
        self.colorName = colorName
        self.targetAmount = targetAmount
        self.currentAmount = currentAmount
        self.deadline = deadline
        self.note = note
        self.createdAt = createdAt
        self.isCompleted = isCompleted
    }

    var progress: Double {
        guard targetAmount > 0 else { return 0 }
        return min(currentAmount / targetAmount, 1.0)
    }

    var remaining: Double {
        max(targetAmount - currentAmount, 0)
    }
}
