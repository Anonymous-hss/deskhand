import SwiftUI

public struct ApprovalGateCard: View {
    let approval: ApprovalRequest
    let currentPersona: TeamPersona
    var isDemo = false
    var host = "http://localhost:4100"
    var isSubmitting = false
    let onDecision: (String) -> Void
    @State private var authenticating = false
    @State private var authGeneration = UUID()
    @State private var authError: String?
    public init(approval: ApprovalRequest, currentPersona: TeamPersona, isDemo: Bool = false,
                host: String = "http://localhost:4100", isSubmitting: Bool = false, onDecision: @escaping (String) -> Void) {
        self.approval = approval; self.currentPersona = currentPersona; self.isDemo = isDemo
        self.host = host; self.isSubmitting = isSubmitting; self.onDecision = onDecision
    }
    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Approval needed", systemImage: "hand.raised.fill").font(.caption.bold()).foregroundStyle(.orange)
            Text(approval.promptQuestion).font(.headline)
            if let diff = approval.observedDiff {
                Text("\(diff.field): \(diff.before) → \(diff.after)").font(.title3.bold())
            } else { Text(approval.diffSummary).font(.title3.bold()) }
            if let expiresAt = approval.expiresAt { Text("Approval expires: " + expiresAt).font(.caption).foregroundStyle(.secondary) }
            Text(approval.targetUrl).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
            if !approval.screenshotUrl.isEmpty {
                AsyncImage(url: HostAddress.mediaURL(approval.screenshotUrl, host: host)) { image in
                    image.resizable().scaledToFit()
                } placeholder: { Label("Approval screenshot loading", systemImage: "photo") }
                    .accessibilityLabel("Browser paused before saving the change")
            }
            if approval.allowedRoles.contains(currentPersona.role) {
                ViewThatFits(in: .horizontal) {
                    HStack { approveButton; rejectButton }
                    VStack { approveButton; rejectButton }
                }
            } else {
                Label("Requires: " + approval.allowedRoles.map(\.rawValue).joined(separator: ", "), systemImage: "lock")
                    .font(.caption).foregroundStyle(.orange)
            }
            if let authError { Text(authError).font(.caption).foregroundStyle(.orange) }
        }.padding().background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(.orange, lineWidth: 1))
            .onChange(of: currentPersona.id) { authGeneration = UUID(); authenticating = false }
            .onChange(of: approval.approvalId) { authGeneration = UUID(); authenticating = false }
            .onDisappear { authGeneration = UUID() }
    }
    private var approveButton: some View {
        Button(authenticating ? "Authenticating…" : "Approve") {
            let token = UUID(); authGeneration = token
            authenticating = true; authError = nil
            Task { @MainActor in
                let allowed: Bool
                if isDemo { allowed = true }
                else { allowed = await BiometricAuthHelper.authenticateApproval(reason: approval.promptQuestion) }
                authenticating = false
                guard token == authGeneration else { return }
                if allowed { onDecision("approve") }
                else { authError = "Authentication was cancelled or unavailable. No approval was sent." }
            }
        }.buttonStyle(.borderedProminent).tint(.green).disabled(authenticating || isSubmitting)
    }
    private var rejectButton: some View {
        Button("Not now", role: .destructive) { onDecision("reject") }
            .buttonStyle(.bordered).disabled(authenticating || isSubmitting)
    }
}
