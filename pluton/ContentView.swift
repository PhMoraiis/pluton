import SwiftUI
import SwiftData

enum AppTab {
    case insights, transactions, forecast, goals, investments
}

struct ContentView: View {
    @Environment(\.modelContext) private var ctx
    @State private var activeTab: AppTab = .insights
    @State private var showAdd = false
    @State private var addForForecast = false
    @State private var showAddGoal = false
    @State private var showAddInvestment = false
    @State private var showFABMenu = false
    @State private var navigatingForward = true

    var body: some View {
        ZStack {
            // Background
            Color(.systemGroupedBackground).ignoresSafeArea()

            VStack(spacing: 0) {
                // ── Header ───────────────────────────────────────────
                ModernHeaderBar(activeTab: $activeTab, navigatingForward: $navigatingForward)

                // ── Content ──────────────────────────────────────────
                Group {
                    switch activeTab {
                    case .insights:
                        HomeView()
                    case .transactions:
                        TransactionsView()
                    case .forecast:
                        ForecastView()
                    case .goals:
                        GoalsView()
                    case .investments:
                        InvestmentsView()
                    }
                }
                .transition(.asymmetric(
                    insertion: .move(edge: navigatingForward ? .trailing : .leading).combined(with: .opacity),
                    removal: .move(edge: navigatingForward ? .leading : .trailing).combined(with: .opacity)
                ))
                .gesture(
                    DragGesture(minimumDistance: 30, coordinateSpace: .local)
                        .onEnded { value in
                            let horizontal = value.translation.width
                            let vertical = abs(value.translation.height)
                            guard abs(horizontal) > vertical else { return }
                            if horizontal < 0 {
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                navigatingForward = true
                                navigateForward()
                            } else {
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                navigatingForward = false
                                navigateBackward()
                            }
                        }
                )
            }
            
            // ── Overlay para fechar o menu ───────────────────────
            if showFABMenu {
                Color.black.opacity(0.001)
                    .ignoresSafeArea()
                    .onTapGesture {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                            showFABMenu = false
                        }
                    }
            }
            
            // ── Floating Action Menu ─────────────────────────────
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    FloatingActionMenu(
                        isExpanded: $showFABMenu,
                        activeTab: activeTab,
                        onAddTransaction: {
                            addForForecast = false
                            showAdd = true
                        },
                        onAddForecast: {
                            addForForecast = true
                            showAdd = true
                        },
                        onAddGoal: {
                            showAddGoal = true
                        },
                        onAddInvestment: {
                            showAddInvestment = true
                        }
                    )
                    .padding(.trailing, DesignSystem.Spacing.xl)
                    .padding(.bottom, DesignSystem.Spacing.xxxl)
                }
            }
        }
        .sheet(isPresented: $showAdd) {
            if addForForecast {
                AddForecastView()
            } else {
                AddTransactionView()
            }
        }
        .sheet(isPresented: $showAddGoal) { AddGoalView() }
        .sheet(isPresented: $showAddInvestment) { AddInvestmentView() }
        .onChange(of: showAdd) { _, newValue in
            if !newValue { showFABMenu = false }
        }
        .onChange(of: showAddGoal) { _, newValue in
            if !newValue { showFABMenu = false }
        }
        .onChange(of: showAddInvestment) { _, newValue in
            if !newValue { showFABMenu = false }
        }
        .onAppear {
            propagateFixedTransactions()
        }
    }

    private func navigateForward() {
        let tabs: [AppTab] = [.insights, .transactions, .forecast, .goals, .investments]
        guard let current = tabs.firstIndex(of: activeTab), current < tabs.count - 1 else { return }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            activeTab = tabs[current + 1]
        }
    }

    private func navigateBackward() {
        let tabs: [AppTab] = [.insights, .transactions, .forecast, .goals, .investments]
        guard let current = tabs.firstIndex(of: activeTab), current > 0 else { return }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            activeTab = tabs[current - 1]
        }
    }

    private func propagateFixedTransactions() {
        let cal = Calendar.current
        let today = Date()
        let currentMonthStart = cal.startOfMonth(for: today)
        let horizonMonthStart = cal.date(byAdding: .month, value: 12, to: currentMonthStart)!

        let fixedTransactions = (try? ctx.fetch(FetchDescriptor<Transaction>(
            predicate: #Predicate { $0.isFixed == true }
        ))) ?? []

        let grouped = Dictionary(grouping: fixedTransactions) { $0.fixedGroupId }

        for (groupId, entries) in grouped {
            guard let groupId else { continue }

            // Encontra o mês mais recente da série
            guard let latestDate = entries.map({ $0.date }).max() else { continue }
            let latestMonthStart = cal.startOfMonth(for: latestDate)

            // Template = entrada mais recente
            guard let template = entries.first(where: {
                cal.isDate($0.date, equalTo: latestMonthStart, toGranularity: .month)
            }) ?? entries.first else { continue }

            // Só propaga se a entrada mais recente ainda está ativa (isFixed = true)
            guard template.isFixed else { continue }

            var cursor = cal.date(byAdding: .month, value: 1, to: latestMonthStart)!

            while cursor <= horizonMonthStart {
                let alreadyExists = fixedTransactions.contains { other in
                    other.fixedGroupId == groupId &&
                    cal.isDate(other.date, equalTo: cursor, toGranularity: .month)
                }
                if !alreadyExists {
                    let copy = Transaction(
                        title: template.title,
                        amount: template.amount,
                        type: template.type,
                        category: template.category,
                        date: cursor,
                        note: template.note,
                        isFixed: true,
                        fixedGroupId: groupId
                    )
                    ctx.insert(copy)
                }
                cursor = cal.date(byAdding: .month, value: 1, to: cursor)!
            }
        }
    }
}

// MARK: - Modern Header Bar

struct ModernHeaderBar: View {
    @Binding var activeTab: AppTab
    @Binding var navigatingForward: Bool
    @AppStorage("appColorScheme") private var appColorScheme: String = "system"
    @State private var showThemeMenu = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center) {
                // Logo com menu de tema
                Menu {
                    Text("Tema")
                        .font(.headline)
                    Divider()
                    Button {
                        appColorScheme = "system"
                    } label: {
                        Label("Sistema", systemImage: appColorScheme == "system" ? "checkmark.circle.fill" : "circle.dotted")
                    }
                    Button {
                        appColorScheme = "light"
                    } label: {
                        Label("Claro", systemImage: appColorScheme == "light" ? "checkmark.circle.fill" : "sun.max")
                    }
                    Button {
                        appColorScheme = "dark"
                    } label: {
                        Label("Escuro", systemImage: appColorScheme == "dark" ? "checkmark.circle.fill" : "moon")
                    }
                } label: {
                    Text("Pluton")
                        .font(.system(size: 20, weight: .semibold, design: .rounded))
                        .foregroundStyle(.primary)
                }
                .menuStyle(.automatic)
                .tint(.primary)

                Spacer()

                // Tab selector
                ModernTabSelector(activeTab: $activeTab, onSelect: { tab in
                    let tabs: [AppTab] = [.insights, .transactions, .forecast, .goals, .investments]
                    if let current = tabs.firstIndex(of: activeTab), let next = tabs.firstIndex(of: tab) {
                        navigatingForward = next > current
                    }
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        activeTab = tab
                    }
                })
            }
            .padding(.horizontal, DesignSystem.Spacing.xl)
            .padding(.top, DesignSystem.Spacing.md)
            .padding(.bottom, DesignSystem.Spacing.lg)

            Divider().opacity(0.4)
        }
        .background(DesignSystem.Colors.groupedBackground.ignoresSafeArea(edges: .top))
    }
}

struct ModernTabSelector: View {
    @Binding var activeTab: AppTab
    @Namespace private var animation
    var onSelect: (AppTab) -> Void = { _ in }

    private let tabs: [(tab: AppTab, icon: String)] = [
        (.insights, "chart.bar"),
        (.transactions, "list.bullet"),
        (.forecast, "calendar"),
        (.goals, "target"),
        (.investments, "chart.pie")
    ]

    var body: some View {
        HStack(spacing: 2) {
            ForEach(tabs, id: \.tab) { item in
                ModernTabButton(icon: item.icon, tab: item.tab, activeTab: $activeTab, namespace: animation, onSelect: onSelect)
            }
        }
        .padding(3)
        .background(
            RoundedRectangle(cornerRadius: DesignSystem.Radius.md)
                .fill(DesignSystem.Colors.cardBackground)
                .overlay(RoundedRectangle(cornerRadius: DesignSystem.Radius.md)
                    .stroke(DesignSystem.Colors.border, lineWidth: 1))
        )
    }
}

struct ModernTabButton: View {
    let icon: String
    let tab: AppTab
    @Binding var activeTab: AppTab
    let namespace: Namespace.ID
    var onSelect: (AppTab) -> Void = { _ in }

    private var isActive: Bool { activeTab == tab }

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onSelect(tab)
        } label: {
            Image(systemName: icon)
                .font(.system(size: 14, weight: isActive ? .medium : .light))
                .foregroundStyle(isActive ? .primary : .secondary)
                .frame(width: 40, height: 32)
                .background {
                    if isActive {
                        RoundedRectangle(cornerRadius: DesignSystem.Radius.sm)
                            .fill(DesignSystem.Colors.surfaceBackground)
                            .matchedGeometryEffect(id: "activeTab", in: namespace)
                    }
                }
        }
        .buttonStyle(.plain)
    }
}
