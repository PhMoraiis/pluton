import SwiftUI
import SwiftData

struct GoalsView: View {
    @Query(sort: \Goal.createdAt, order: .reverse) private var goals: [Goal]
    @Environment(\.modelContext) private var ctx
    @State private var showAdd = false
    @State private var goalToEdit: Goal?
    @State private var goalToDeposit: Goal?
    @State private var goalToDelete: Goal?
    @State private var showDeleteAlert = false

    private var totalSaved: Double { goals.reduce(0) { $0 + $1.currentAmount } }
    private var totalTarget: Double { goals.reduce(0) { $0 + $1.targetAmount } }
    private var activeGoals: [Goal] { goals.filter { !$0.isCompleted } }
    private var completedGoals: [Goal] { goals.filter { $0.isCompleted } }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: DesignSystem.Spacing.xxl) {

                // ── Header ───────────────────────────────────────────
                VStack(alignment: .leading, spacing: 6) {
                    Text("Metas")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(.secondary)
                    Text(totalSaved, format: .currency(code: "BRL"))
                        .font(.system(size: 42, weight: .semibold, design: .rounded))
                        .foregroundStyle(.primary)
                    if totalTarget > 0 {
                        Text("de \(totalTarget.formatted(.currency(code: "BRL"))) no total")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, DesignSystem.Spacing.xl)
                .padding(.top, DesignSystem.Spacing.xxl)

                // ── Stats ────────────────────────────────────────────
                if !goals.isEmpty {
                    HStack(spacing: DesignSystem.Spacing.md) {
                        GoalStatCard(
                            label: "Ativas",
                            value: "\(activeGoals.count)",
                            icon: "target",
                            color: Color(hex: "A8C5DA")
                        )
                        GoalStatCard(
                            label: "Concluídas",
                            value: "\(completedGoals.count)",
                            icon: "checkmark.seal.fill",
                            color: Color(hex: "B5D5C5")
                        )
                    }
                    .padding(.horizontal, DesignSystem.Spacing.xl)
                }

                // ── Metas Ativas ─────────────────────────────────────
                if activeGoals.isEmpty && completedGoals.isEmpty {
                    EmptyStateView(
                        icon: "target",
                        title: "Nenhuma meta",
                        description: "Crie sua primeira meta financeira",
                        actionTitle: "Criar meta",
                        action: { showAdd = true }
                    )
                    .frame(minHeight: 300)
                } else {
                    if !activeGoals.isEmpty {
                        VStack(alignment: .leading, spacing: DesignSystem.Spacing.md) {
                            Text("Em andamento")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, DesignSystem.Spacing.xl)

                            VStack(spacing: DesignSystem.Spacing.md) {
                                ForEach(activeGoals) { goal in
                                    GoalCard(goal: goal)
                                        .padding(.horizontal, DesignSystem.Spacing.xl)
                                        .contentShape(Rectangle())
                                        .onTapGesture { goalToEdit = goal }
                                        .contextMenu {
                                            Button { goalToDeposit = goal } label: {
                                                Label("Adicionar dinheiro", systemImage: "plus.circle")
                                            }
                                            Button { goalToEdit = goal } label: {
                                                Label("Editar", systemImage: "pencil")
                                            }
                                            Button(role: .destructive) {
                                                goalToDelete = goal
                                                showDeleteAlert = true
                                            } label: {
                                                Label("Excluir", systemImage: "trash")
                                            }
                                        }
                                }
                            }
                        }
                    }

                    if !completedGoals.isEmpty {
                        VStack(alignment: .leading, spacing: DesignSystem.Spacing.md) {
                            Text("Concluídas")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, DesignSystem.Spacing.xl)

                            VStack(spacing: DesignSystem.Spacing.md) {
                                ForEach(completedGoals) { goal in
                                    GoalCard(goal: goal)
                                        .padding(.horizontal, DesignSystem.Spacing.xl)
                                        .opacity(0.6)
                                }
                            }
                        }
                    }
                }

                Spacer(minLength: 100)
            }
        }
        .background(DesignSystem.Colors.groupedBackground)
        .sheet(isPresented: $showAdd) { AddGoalView() }
        .sheet(item: $goalToEdit) { goal in EditGoalView(goal: goal) }
        .sheet(item: $goalToDeposit) { goal in GoalDepositView(goal: goal) }
        .alert("Excluir meta?", isPresented: $showDeleteAlert) {
            Button("Excluir", role: .destructive) {
                if let g = goalToDelete { ctx.delete(g) }
            }
            Button("Cancelar", role: .cancel) {}
        } message: { Text("Esta ação não pode ser desfeita.") }
    }
}

// MARK: - Goal Card

struct GoalCard: View {
    let goal: Goal

    private var color: Color { Color.categoryColor(from: goal.colorName) }

    var body: some View {
        VStack(alignment: .leading, spacing: DesignSystem.Spacing.lg) {
            HStack(spacing: DesignSystem.Spacing.md) {
                ZStack {
                    Circle()
                        .fill(color.opacity(0.15))
                        .frame(width: 44, height: 44)
                    Image(systemName: goal.icon)
                        .font(.system(size: 18, weight: .light))
                        .foregroundStyle(color)
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(goal.title)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.primary)
                    if let deadline = goal.deadline {
                        Text(deadline, style: .date)
                            .font(.system(size: 12, weight: .regular))
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                if goal.isCompleted {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(Color(hex: "B5D5C5"))
                        .font(.system(size: 18))
                } else {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(Int(goal.progress * 100))%")
                            .font(.system(size: 15, weight: .semibold, design: .rounded))
                            .foregroundStyle(color)
                        Text(goal.remaining, format: .currency(code: "BRL"))
                            .font(.system(size: 11, weight: .regular))
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // Progress bar
            VStack(alignment: .leading, spacing: 6) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(color.opacity(0.12))
                            .frame(height: 6)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(color)
                            .frame(width: geo.size.width * goal.progress, height: 6)
                            .animation(.spring(response: 0.6, dampingFraction: 0.8), value: goal.progress)
                    }
                }
                .frame(height: 6)

                HStack {
                    Text(goal.currentAmount, format: .currency(code: "BRL"))
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundStyle(.primary)
                    Spacer()
                    Text(goal.targetAmount, format: .currency(code: "BRL"))
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(DesignSystem.Spacing.xl)
        .background(
            RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                    .stroke(DesignSystem.Colors.border, lineWidth: 1))
        )
    }
}

// MARK: - Goal Stat Card

struct GoalStatCard: View {
    let label: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        HStack(spacing: DesignSystem.Spacing.md) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .light))
                .foregroundStyle(color)
                .frame(width: 36, height: 36)
                .background(Circle().fill(color.opacity(0.12)))
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.system(size: 20, weight: .semibold, design: .rounded))
                    .foregroundStyle(.primary)
                Text(label)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(DesignSystem.Spacing.lg)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.xl)
                    .stroke(DesignSystem.Colors.border, lineWidth: 1))
        )
    }
}
