import SwiftUI

struct SplashView: View {
    @State private var scale: CGFloat = 0.75
    @State private var logoOpacity: Double = 0
    @State private var textOpacity: Double = 0

    private var appIcon: UIImage? {
        guard
            let icons = Bundle.main.object(forInfoDictionaryKey: "CFBundleIcons") as? [String: Any],
            let primary = icons["CFBundlePrimaryIcon"] as? [String: Any],
            let files = primary["CFBundleIconFiles"] as? [String],
            let last = files.last
        else { return nil }
        return UIImage(named: last)
    }

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()

            VStack(spacing: 18) {
                Group {
                    if let icon = appIcon {
                        Image(uiImage: icon)
                            .resizable()
                            .scaledToFit()
                    } else {
                        // Fallback: ícone de sistema
                        Image(systemName: "wallet.bifold.fill")
                            .resizable()
                            .scaledToFit()
                            .foregroundStyle(.primary)
                            .padding(20)
                            .background(Color(.secondarySystemBackground))
                    }
                }
                .frame(width: 100, height: 100)
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                .shadow(color: .black.opacity(0.15), radius: 24, x: 0, y: 10)
                .scaleEffect(scale)
                .opacity(logoOpacity)

                Text("Pluton")
                    .font(.system(size: 26, weight: .semibold, design: .rounded))
                    .foregroundStyle(.primary)
                    .opacity(textOpacity)
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.72)) {
                scale = 1.0
                logoOpacity = 1
            }
            withAnimation(.easeOut(duration: 0.35).delay(0.2)) {
                textOpacity = 1
            }
        }
    }
}
