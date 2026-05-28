import SwiftUI

// MARK: - Design System

struct DesignSystem {

    struct Colors {
        static let primary = Color.primary
        static let accent = Color.accentColor
        static let success = Color(hex: "4CAF50")
        static let danger = Color(hex: "FF5252")
        static let cardBackground = Color(.secondarySystemBackground)
        static let surfaceBackground = Color(.tertiarySystemBackground)
        static let groupedBackground = Color(.systemBackground)
        static let border = Color.primary.opacity(0.08)
        static let labelSecondary = Color.secondary
    }

    struct Spacing {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 20
        static let xxl: CGFloat = 28
        static let xxxl: CGFloat = 40
    }

    struct Radius {
        static let sm: CGFloat = 10
        static let md: CGFloat = 14
        static let lg: CGFloat = 18
        static let xl: CGFloat = 22
        static let xxl: CGFloat = 28
        static let full: CGFloat = 9999
    }

    struct Shadows {
        static let sm = Shadow(color: .black.opacity(0.04), radius: 6, y: 2)
        static let md = Shadow(color: .black.opacity(0.07), radius: 14, y: 6)
        static let lg = Shadow(color: .black.opacity(0.12), radius: 28, y: 12)

        struct Shadow {
            let color: Color
            let radius: CGFloat
            let y: CGFloat
        }
    }
}

// MARK: - Color Hex Init

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8) & 0xFF) / 255
        let b = Double(int & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

// MARK: - View Extensions

extension View {
    func glassEffect(cornerRadius: CGFloat = DesignSystem.Radius.xxl) -> some View { self }

    func cardStyle(padding: CGFloat = DesignSystem.Spacing.xl, cornerRadius: CGFloat = DesignSystem.Radius.xl) -> some View {
        self.padding(padding)
            .background {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(DesignSystem.Colors.cardBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .stroke(DesignSystem.Colors.border, lineWidth: 1)
                    )
            }
    }
}

extension Color {
    static func categoryColor(from string: String) -> Color {
        switch string {
        case "orange": return .orange
        case "blue": return .blue
        case "purple": return .purple
        case "red": return .red
        case "pink": return .pink
        case "indigo": return .indigo
        case "teal": return .teal
        case "cyan": return .cyan
        case "green": return .green
        case "mint": return .mint
        case "yellow": return .yellow
        default: return .gray
        }
    }
}

extension TransactionCategory {
    var colorValue: Color { Color.categoryColor(from: self.color) }
}

// MARK: - Card

struct Card<Content: View>: View {
    let content: Content
    var padding: CGFloat = DesignSystem.Spacing.xl
    var cornerRadius: CGFloat = DesignSystem.Radius.xl

    init(padding: CGFloat = DesignSystem.Spacing.xl, cornerRadius: CGFloat = DesignSystem.Radius.xl, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .background {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(DesignSystem.Colors.cardBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .stroke(DesignSystem.Colors.border, lineWidth: 1)
                    )
            }
    }
}

// MARK: - Button Styles

struct PrimaryButtonStyle: ButtonStyle {
    var isEnabled: Bool = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .medium))
            .foregroundStyle(Color(.systemBackground))
            .frame(maxWidth: .infinity)
            .padding(.vertical, DesignSystem.Spacing.lg)
            .background(
                RoundedRectangle(cornerRadius: DesignSystem.Radius.full)
                    .fill(isEnabled ? Color.primary : Color.secondary.opacity(0.2))
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(.primary)
            .padding(.horizontal, DesignSystem.Spacing.lg)
            .padding(.vertical, DesignSystem.Spacing.md)
            .background(
                RoundedRectangle(cornerRadius: DesignSystem.Radius.full)
                    .fill(DesignSystem.Colors.cardBackground)
                    .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.full)
                        .stroke(DesignSystem.Colors.border, lineWidth: 1))
            )
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

// MARK: - Badge

struct Badge: View {
    let text: String
    let color: Color
    var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(color)
            .padding(.horizontal, DesignSystem.Spacing.sm)
            .padding(.vertical, 3)
            .background(Capsule().fill(color.opacity(0.1)))
    }
}

// MARK: - Stat Card

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color
    var trend: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: DesignSystem.Spacing.md) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .light))
                    .foregroundStyle(.secondary)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(DesignSystem.Colors.surfaceBackground))
                Spacer()
                if let trend { Badge(text: trend, color: color) }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.system(size: 20, weight: .semibold, design: .rounded))
                    .foregroundStyle(.primary)
            }
        }
        .padding(DesignSystem.Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                    .stroke(DesignSystem.Colors.border, lineWidth: 1))
        )
    }
}

// MARK: - Field Row

struct FieldRow<Content: View>: View {
    let icon: String
    let label: String
    var alignment: VerticalAlignment = .center
    let content: Content

    init(icon: String, label: String, alignment: VerticalAlignment = .center, @ViewBuilder content: () -> Content) {
        self.icon = icon; self.label = label; self.alignment = alignment; self.content = content()
    }

    var body: some View {
        HStack(alignment: alignment, spacing: DesignSystem.Spacing.md) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .light))
                .foregroundStyle(.secondary)
                .frame(width: 20, alignment: .center)

            Text(label)
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(.secondary)
                .frame(width: 80, alignment: .leading)

            content
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.horizontal, DesignSystem.Spacing.lg)
        .padding(.vertical, DesignSystem.Spacing.md)
    }
}

// MARK: - Empty State

struct EmptyStateView: View {
    let icon: String
    let title: String
    let description: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: DesignSystem.Spacing.lg) {
            Image(systemName: icon)
                .font(.system(size: 40, weight: .thin))
                .foregroundStyle(.tertiary)
            VStack(spacing: DesignSystem.Spacing.xs) {
                Text(title)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(.primary)
                Text(description)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            if let actionTitle, let action {
                Button(action: action) { Text(actionTitle) }.buttonStyle(SecondaryButtonStyle())
            }
        }
        .padding(DesignSystem.Spacing.xxxl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Color Dot

struct ColorDot: View {
    let colorName: String
    let isSelected: Bool

    var body: some View {
        let c = Color.categoryColor(from: colorName)
        let opacity: Double = isSelected ? 0.5 : 0
        Circle()
            .fill(c)
            .frame(width: 26, height: 26)
            .overlay(
                Circle()
                    .stroke(Color.primary.opacity(opacity), lineWidth: 2)
                    .padding(-3)
            )
    }
}

// MARK: - Icon Color Picker

struct IconColorPicker: View {
    let icons: [String]
    let colors: [String]
    @Binding var selectedIcon: String
    @Binding var selectedColor: String
    let accentColor: Color
    var onIconSelected: () -> Void = {}

    var body: some View {
        VStack(spacing: DesignSystem.Spacing.md) {
            HStack(spacing: DesignSystem.Spacing.sm) {
                ForEach(colors, id: \.self) { c in
                    ColorDot(colorName: c, isSelected: selectedColor == c)
                        .onTapGesture { selectedColor = c }
                }
            }
            .frame(maxWidth: .infinity)

            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible()), count: 5),
                spacing: DesignSystem.Spacing.md
            ) {
                ForEach(icons, id: \.self) { icon in
                    IconCell(
                        icon: icon,
                        isSelected: selectedIcon == icon,
                        accentColor: accentColor
                    ) {
                        selectedIcon = icon
                        onIconSelected()
                    }
                }
            }
        }
    }
}

struct IconCell: View {
    let icon: String
    let isSelected: Bool
    let accentColor: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .light))
                .foregroundStyle(isSelected ? accentColor : .secondary)
                .frame(width: 48, height: 48)
                .background(
                    RoundedRectangle(cornerRadius: DesignSystem.Radius.md)
                        .fill(isSelected
                              ? accentColor.opacity(0.12)
                              : DesignSystem.Colors.cardBackground)
                )
        }
        .buttonStyle(.plain)
    }
}
