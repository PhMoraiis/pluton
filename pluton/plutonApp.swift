import SwiftUI
import SwiftData

@main
struct PlutonApp: App {
    @AppStorage("appColorScheme") private var appColorScheme: String = "system"
    @State private var showSplash = true

    let container: ModelContainer

    init() {
        let schema = Schema([
            Transaction.self,
            ForecastEntry.self,
            Goal.self,
            Investment.self,
            InvestmentDeposit.self
        ])

        let config = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            allowsSave: true
        )

        do {
            container = try ModelContainer(for: schema, configurations: config)
        } catch {
            // Schema incompatível — apaga o store e recria limpo
            let storeURL = URL.applicationSupportDirectory.appending(path: "default.store")
            try? FileManager.default.removeItem(at: storeURL)
            try? FileManager.default.removeItem(at: URL.applicationSupportDirectory.appending(path: "default.store-shm"))
            try? FileManager.default.removeItem(at: URL.applicationSupportDirectory.appending(path: "default.store-wal"))

            do {
                container = try ModelContainer(for: schema, configurations: config)
            } catch {
                fatalError("Não foi possível criar o ModelContainer: \(error)")
            }
        }
    }

    private var preferredColorScheme: ColorScheme? {
        switch appColorScheme {
        case "light": return .light
        case "dark":  return .dark
        default:      return nil
        }
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                ContentView()
                    .opacity(showSplash ? 0 : 1)

                if showSplash {
                    SplashView()
                        .transition(.opacity)
                        .zIndex(1)
                }
            }
            .preferredColorScheme(preferredColorScheme)
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
                    withAnimation(.easeInOut(duration: 0.5)) {
                        showSplash = false
                    }
                }
            }
        }
        .modelContainer(container)
    }
}
