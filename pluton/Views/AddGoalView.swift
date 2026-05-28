import SwiftUI
import SwiftData

struct AddGoalView: View {
    @Environment(\.modelContext) private var ctx
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var selectedPreset: GoalPreset = .travel
    @State private var selectedIcon = GoalPreset.travel.icon
    @State private var selectedColor = GoalPreset.travel.color
    @State private var targetText = ""
    @State private var hasDeadline = false
    @State private var deadline = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var note = ""
    @State private var showIconPicker = false

    private var tomorrow: Date { Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date() }

    private var isValid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty &&
        (Double(targetText.replacingOccurrences(of: ",", with: ".")) ?? 0) > 0
    }

    private let icons = [
        "airplane", "car.fill", "house.fill", "graduationcap.fill", "shield.fill",
        "heart.fill", "laptopcomputer", "star.fill", "gift.fill", "bag.fill",
        "camera.fill", "bicycle", "figure.walk", "music.note", "gamecontroller.fill",
        "fork.knife", "pawprint.fill", "leaf.fill", "sun.max.fill", "moon.fill"
    ]

    private let colors = ["blue", "orange", "purple", "indigo", "green", "pink", "cyan", "teal", "red", "yellow"]

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: DesignSystem.Spacing.xxl) {

                    // ── Preset Selector ──────────────────────────────
                    VStack(alignment: .leading, spacing: DesignSystem.Spacing.md) {
                        Text("Tipo de meta")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, DesignSystem.Spacing.xl)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: DesignSystem.Spacing.sm) {
                                ForEach(GoalPreset.allCases, id: \.self) { preset in
                                    GoalPresetChip(
                                        preset: preset,
                                        isSelected: selectedPreset == preset
                                    ) {
                                        selectedPreset = preset
                                        selectedIcon = preset.icon
                                        selectedColor = preset.color
                                        if title.isEmpty { title = preset.rawValue }
                                    }
                                }
                            }
                            .padding(.horizontal, DesignSystem.Spacing.xl)
                        }
                    }

                    // ── Icon & Color ─────────────────────────────────
                    VStack(spacing: DesignSystem.Spacing.md) {
                        // Preview
                        ZStack {
                            Circle()
                                .fill(Color.categoryColor(from: selectedColor).opacity(0.15))
                                .frame(width: 72, height: 72)
                            Image(systemName: selectedIcon)
                                .font(.system(size: 28, weight: .light))
                                .foregroundStyle(Color.categoryColor(from: selectedColor))
                        }
                        .onTapGesture { showIconPicker.toggle() }

                        // Color picker
                        HStack(spacing: DesignSystem.Spacing.sm) {
                            ForEach(colors, id: \.self) { c in
                                ColorDot(colorName: c, isSelected: selectedColor == c)
                                    .onTapGesture { selectedColor = c }
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, DesignSystem.Spacing.lg)

                    // ── Icon Picker ──────────────────────────────────
                    if showIconPicker {
                        IconColorPicker(
                            icons: icons,
                            colors: colors,
                            selectedIcon: $selectedIcon,
                            selectedColor: $selectedColor,
                            accentColor: Color.categoryColor(from: selectedColor),
                            onIconSelected: { showIconPicker = false }
                        )
                        .padding(.horizontal, DesignSystem.Spacing.xl)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    // ── Fields ───────────────────────────────────────
                    VStack(spacing: 0) {
                        FieldRow(icon: "tag", label: "Título") {
                            TextField("Nome da meta", text: $title)
                                .font(.system(size: 15))
                                .multilineTextAlignment(.trailing)
                        }
                        Divider().padding(.leading, 52)

                        FieldRow(icon: "target", label: "Valor alvo") {
                            HStack(spacing: 4) {
                                Text("R$").font(.system(size: 14)).foregroundStyle(.secondary)
                                TextField("0,00", text: $targetText)
                                    .font(.system(size: 15, design: .rounded))
                                    .keyboardType(.decimalPad)
                                    .multilineTextAlignment(.trailing)
                            }
                        }
                        Divider().padding(.leading, 52)

                        FieldRow(icon: "calendar", label: "Prazo") {
                            Toggle("", isOn: $hasDeadline)
                                .labelsHidden()
                        }

                        if hasDeadline {
                            FieldRow(icon: "calendar.badge.clock", label: "Data") {
                                DatePicker(
                                    "",
                                    selection: $deadline,
                                    in: tomorrow...,
                                    displayedComponents: .date
                                )
                                .labelsHidden()
                            }
                            .transition(.opacity.combined(with: .move(edge: .top)))
                        }

                        Divider().padding(.leading, 52)

                        FieldRow(icon: "note.text", label: "Nota", alignment: .top) {
                            TextField("Opcional", text: $note, axis: .vertical)
                                .font(.system(size: 15))
                                .multilineTextAlignment(.trailing)
                                .lineLimit(3)
                        }
                    }
                    .background(
                        RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                            .fill(DesignSystem.Colors.cardBackground)
                            .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                                .stroke(DesignSystem.Colors.border, lineWidth: 1))
                    )
                    .padding(.horizontal, DesignSystem.Spacing.xl)

                    // ── Save ─────────────────────────────────────────
                    Button("Criar meta") { save() }
                        .buttonStyle(PrimaryButtonStyle(isEnabled: isValid))
                        .disabled(!isValid)
                        .padding(.horizontal, DesignSystem.Spacing.xl)

                    Spacer(minLength: 40)
                }
                .padding(.top, DesignSystem.Spacing.xl)
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: showIconPicker)
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: hasDeadline)
            }
            .background(DesignSystem.Colors.groupedBackground)
            .navigationTitle("Nova Meta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func save() {
        let amount = Double(targetText.replacingOccurrences(of: ",", with: ".")) ?? 0
        let goal = Goal(
            title: title.trimmingCharacters(in: .whitespaces),
            icon: selectedIcon,
            colorName: selectedColor,
            targetAmount: amount,
            deadline: hasDeadline ? deadline : nil,
            note: note
        )
        ctx.insert(goal)
        dismiss()
    }
}

// MARK: - Preset Chip

struct GoalPresetChip: View {
    let preset: GoalPreset
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: preset.icon)
                    .font(.system(size: 12, weight: .light))
                Text(preset.rawValue)
                    .font(.system(size: 13, weight: isSelected ? .medium : .regular))
            }
            .foregroundStyle(isSelected ? Color.categoryColor(from: preset.color) : .secondary)
            .padding(.horizontal, DesignSystem.Spacing.md)
            .padding(.vertical, DesignSystem.Spacing.sm)
            .background(
                Capsule()
                    .fill(isSelected
                          ? Color.categoryColor(from: preset.color).opacity(0.12)
                          : DesignSystem.Colors.cardBackground)
                    .overlay(Capsule().stroke(
                        isSelected ? Color.categoryColor(from: preset.color).opacity(0.3) : DesignSystem.Colors.border,
                        lineWidth: 1
                    ))
            )
        }
        .buttonStyle(.plain)
    }
}
