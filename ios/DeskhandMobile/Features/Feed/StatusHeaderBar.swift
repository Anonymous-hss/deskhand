import SwiftUI

public struct StatusHeaderBar: View {
    let isConnected: Bool
    let budget: CallBudgetStatus
    let onKillSwitch: () -> Void

    public init(isConnected: Bool, budget: CallBudgetStatus, onKillSwitch: @escaping () -> Void) {
        self.isConnected = isConnected
        self.budget = budget
        self.onKillSwitch = onKillSwitch
    }

    public var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 6) {
                Circle()
                    .fill(isConnected ? Color.green : Color.orange)
                    .frame(width: 8, height: 8)
                Text("Deskhand #ops")
                    .font(.headline.bold())
            }

            Spacer()

            Text("Calls: \(budget.usedCalls)/\(budget.maxCalls)")
                .font(.caption.monospacedDigit().bold())
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color.white.opacity(0.08))
                .clipShape(Capsule())

            Button(action: onKillSwitch) {
                Text("STOP")
                    .font(.caption2.bold())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color.red)
                    .clipShape(Capsule())
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color(red: 0.07, green: 0.09, blue: 0.15))
    }
}

