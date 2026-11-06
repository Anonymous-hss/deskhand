import SwiftUI

public struct StepCarouselView: View {
    let steps: [TaskStep]
    let hostBaseURL: String
    @State private var selectedStep: TaskStep?

    public init(steps: [TaskStep], hostBaseURL: String) {
        self.steps = steps
        self.hostBaseURL = hostBaseURL
    }

    public var body: some View {
        ScrollViewReader { proxy in
        ScrollView(.horizontal) {
            HStack(spacing: 12) {
                ForEach(steps) { step in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("STEP \(step.stepNumber)")
                                .font(.caption2.bold())
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Color.orange.opacity(0.2))
                                .foregroundStyle(.orange)
                                .clipShape(Capsule())
                            Spacer()
                            Text(step.pageUrl)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }

                        Button { selectedStep = step } label: {
                        AsyncImage(url: step.screenshotUrl.isEmpty ? nil : HostAddress.mediaURL(step.screenshotUrl, host: hostBaseURL)) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .scaledToFit()
                            default:
                                ZStack {
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(Color.black.opacity(0.4))
                                    Text(step.screenshotUrl.isEmpty ? "Demo · \(step.thought)" : "Screenshot unavailable")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .frame(width: 260, height: 162)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Inspect screenshot for step \(step.stepNumber)")
                        .disabled(step.screenshotUrl.isEmpty)

                        Text(step.thought)
                            .font(.caption)
                            .foregroundStyle(.primary)
                            .lineLimit(2)
                            .frame(width: 260, alignment: .leading)
                    }
                    .padding(10)
                    .background(Color.white.opacity(0.05))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .id(step.id)
                }
            }
        }
        .sheet(item: $selectedStep) { step in
            ScreenshotDetailView(step: step, host: hostBaseURL)
        }
        .scrollIndicators(.hidden)
        .onChange(of: steps.count) { if let last = steps.last { proxy.scrollTo(last.id, anchor: .trailing) } }
        }
    }
}
