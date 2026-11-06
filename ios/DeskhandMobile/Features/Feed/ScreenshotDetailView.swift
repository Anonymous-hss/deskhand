import SwiftUI

struct ScreenshotDetailView: View {
    let step: TaskStep
    let host: String
    @Environment(\.dismiss) private var dismiss
    @State private var zoom: CGFloat = 1
    @State private var savedZoom: CGFloat = 1
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text(step.thought).font(.headline).textSelection(.enabled).padding(.horizontal)
                GeometryReader { geometry in
                    ScrollView([.horizontal, .vertical]) {
                        AsyncImage(url: HostAddress.mediaURL(step.screenshotUrl, host: host)) { phase in
                            switch phase {
                            case .success(let image):
                                image.resizable().scaledToFit()
                                    .frame(width: max(geometry.size.width, 1) * zoom)
                                    .accessibilityLabel("Browser screenshot for step \(step.stepNumber)")
                            case .failure:
                                ContentUnavailableView("Screenshot unavailable", systemImage: "photo", description: Text("Reconnect to the host and try again."))
                            default: ProgressView("Loading screenshot…").frame(width: geometry.size.width, height: 200)
                            }
                        }
                    }
                    .simultaneousGesture(MagnifyGesture().onChanged { value in
                        zoom = min(max(savedZoom * value.magnification, 1), 5)
                    }.onEnded { _ in savedZoom = zoom })
                }
                Text(step.pageUrl).font(.caption).foregroundStyle(.secondary).textSelection(.enabled).padding(.horizontal)
                Text("Pinch to zoom · drag to inspect").font(.caption).foregroundStyle(.secondary).padding(.horizontal)
            }
            .navigationTitle("Step \(step.stepNumber)")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .automatic) { Button("Reset zoom") { zoom = 1; savedZoom = 1 } }
            }
        }
    }
}
