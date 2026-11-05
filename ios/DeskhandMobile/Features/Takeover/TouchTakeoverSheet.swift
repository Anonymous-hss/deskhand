import SwiftUI

public struct TouchTakeoverSheet: View {
    let takeover: TakeoverSession
    let onSubmitOtpAndRelease: (String) -> Void
    @State private var otpCode: String = "482910"

    public init(
        takeover: TakeoverSession,
        onSubmitOtpAndRelease: @escaping (String) -> Void
    ) {
        self.takeover = takeover
        self.onSubmitOtpAndRelease = onSubmitOtpAndRelease
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("🖐️ LIVE SCREEN TAKEOVER")
                    .font(.caption.bold())
                    .foregroundStyle(.cyan)
                Spacer()
                Text("1280×800 Touch Bridge")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Text(takeover.reason)
                .font(.headline.bold())

            HStack(spacing: 10) {
                TextField("6-Digit Code", text: $otpCode)
                    .font(.title3.monospacedDigit().bold())
                    .padding(10)
                    .background(Color.black.opacity(0.4))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                Button {
                    onSubmitOtpAndRelease(otpCode)
                } label: {
                    Text("Type & Hand Back")
                        .font(.subheadline.bold())
                        .foregroundStyle(.black)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .background(Color.cyan)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
        .padding(14)
        .background(Color.cyan.opacity(0.14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.cyan, lineWidth: 2)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

