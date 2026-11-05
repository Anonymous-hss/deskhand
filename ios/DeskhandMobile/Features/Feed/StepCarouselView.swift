import SwiftUI

public struct StepCarouselView: View {
    let steps: [TaskStep]
    let hostBaseURL: String

    public init(steps: [TaskStep], hostBaseURL: String) {
        self.steps = steps
        self.hostBaseURL = hostBaseURL
    }

    public var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
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

                        AsyncImage(url: URL(string: hostBaseURL + step.screenshotUrl)) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .scaledToFit()
                            default:
                                ZStack {
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(Color.black.opacity(0.4))
                                    Text("📸 Step \(step.stepNumber) Screenshot")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .frame(width: 260, height: 162)
                        .clipShape(RoundedRectangle(cornerRadius: 8))

                        Text(step.thought)
                            .font(.caption)
                            .foregroundStyle(.primary)
                            .lineLimit(2)
                            .frame(width: 260, alignment: .leading)
                    }
                    .padding(10)
                    .background(Color.white.opacity(0.05))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }
}

