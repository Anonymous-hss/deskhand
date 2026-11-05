import SwiftUI

public struct ApprovalGateCard: View {
    let approval: ApprovalRequest
    let currentPersona: TeamPersona
    let onDecision: (String) -> Void

    public init(
        approval: ApprovalRequest,
        currentPersona: TeamPersona,
        onDecision: @escaping (String) -> Void
    ) {
        self.approval = approval
        self.currentPersona = currentPersona
        self.onDecision = onDecision
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("🛑 SAFETY SWITCH — APPROVAL NEEDED")
                    .font(.caption.bold())
                    .foregroundStyle(.orange)
                Spacer()
                Text("Role: \(currentPersona.role.rawValue)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Text(approval.promptQuestion)
                .font(.headline.bold())

            Text(approval.diffSummary)
                .font(.subheadline)
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.black.opacity(0.35))
                .clipShape(RoundedRectangle(cornerRadius: 8))

            if currentPersona.canApprove {
                HStack(spacing: 12) {
                    Button {
                        Task {
                            let ok = await BiometricAuthHelper.authenticateApproval(
                                reason: approval.promptQuestion
                            )
                            if ok {
                                onDecision("approve")
                            }
                        }
                    } label: {
                        Text("✅ Approve")
                            .font(.subheadline.bold())
                            .foregroundStyle(.black)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color.green)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }

                    Button {
                        onDecision("reject")
                    } label: {
                        Text("✋ Not now")
                            .font(.subheadline.bold())
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color.red)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            } else {
                Text("🔒 Switch persona to Priya (qa-lead) or Rahul (admin) to approve risky actions.")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
        }
        .padding(14)
        .background(Color.orange.opacity(0.14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.orange, lineWidth: 2)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

