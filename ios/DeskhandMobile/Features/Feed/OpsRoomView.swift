import SwiftUI

public struct OpsRoomView: View {
    @Bindable var wsService: DeskhandWebSocketService
    @State private var selectedPersona: TeamPersona = TeamPersona.demoPersonas[0]

    public init(wsService: DeskhandWebSocketService) {
        self.wsService = wsService
    }

    public var body: some View {
        VStack(spacing: 0) {
            StatusHeaderBar(
                isConnected: wsService.isConnected,
                budget: wsService.budget,
                onKillSwitch: {
                    Task {
                        try? await DeskhandAPIClient.shared.triggerEmergencyKillSwitch()
                    }
                }
            )

            PersonaSwitcherBar(selectedPersona: $selectedPersona)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let task = wsService.activeTask {
                        taskCard(task)
                    } else {
                        emptyDemoShortcuts
                    }
                }
                .padding(16)
            }

            VoiceCommandBar { prompt, isVoice in
                Task {
                    _ = try? await DeskhandAPIClient.shared.startTask(
                        prompt: prompt,
                        onDeviceTranscript: isVoice ? prompt : nil,
                        senderName: selectedPersona.name,
                        senderRole: selectedPersona.role,
                        isVoiceNote: isVoice
                    )
                }
            }
        }
        .background(Color(red: 0.04, green: 0.06, blue: 0.11).ignoresSafeArea())
    }

    @ViewBuilder
    private func taskCard(_ task: DeskhandTask) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("@\(task.senderName)")
                    .font(.subheadline.bold())
                    .foregroundStyle(.orange)
                Spacer()
                Text(task.status.rawValue)
                    .font(.caption2.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.white.opacity(0.1))
                    .clipShape(Capsule())
            }

            Text(task.prompt)
                .font(.body.bold())

            if let approval = task.pendingApproval, task.status == .awaitingApproval {
                ApprovalGateCard(
                    approval: approval,
                    currentPersona: selectedPersona
                ) { decision in
                    Task {
                        try? await DeskhandAPIClient.shared.submitApproval(
                            taskId: task.taskId,
                            decision: decision,
                            responderName: selectedPersona.name,
                            responderRole: selectedPersona.role
                        )
                    }
                }
            }

            if let takeover = task.takeover, task.status == .humanTakeover {
                TouchTakeoverSheet(takeover: takeover) { code in
                    Task {
                        let input = RemoteTakeoverInputPayload(
                            taskId: task.taskId,
                            type: "otp_submit",
                            text: code,
                            actorName: selectedPersona.name
                        )
                        try? await DeskhandAPIClient.shared.submitTakeoverInput(input)
                    }
                }
            }

            if !task.steps.isEmpty {
                StepCarouselView(
                    steps: task.steps,
                    hostBaseURL: wsService.hostBaseURL
                )
            }

            if let bug = task.bugReport {
                VStack(alignment: .leading, spacing: 8) {
                    Text("🐞 Ready-to-File Bug Report")
                        .font(.caption.bold())
                        .foregroundStyle(.red)
                    Text(bug.title)
                        .font(.subheadline.bold())
                    Button("File it in Issue Tracker") {
                        Task {
                            _ = try? await DeskhandAPIClient.shared.startTask(
                                prompt: "file it in the issue tracker",
                                senderName: "Rahul",
                                senderRole: .admin
                            )
                        }
                    }
                    .font(.caption.bold())
                    .foregroundStyle(.black)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.orange)
                    .clipShape(Capsule())
                }
                .padding(12)
                .background(Color.red.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            if let summary = task.summary {
                Text("✅ \(summary)")
                    .font(.subheadline)
                    .foregroundStyle(.green)
            }
        }
        .padding(14)
        .background(Color.white.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var emptyDemoShortcuts: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Chai Co. #ops Quick Demo Triggers")
                .font(.caption.bold())
                .foregroundStyle(.secondary)

            Button("1. Reproduce Checkout Coupon Bug (Priya)") {
                Task {
                    _ = try? await DeskhandAPIClient.shared.startTask(
                        prompt: "checkout fails on staging when the coupon CHAI50 is applied, can you reproduce?",
                        senderName: "Priya",
                        senderRole: .qaLead
                    )
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)

            Button("2. Voice Note: Masala Chai Price ₹229 → ₹249 (Arjun)") {
                Task {
                    _ = try? await DeskhandAPIClient.shared.startTask(
                        prompt: "update the masala chai price to 249 in the store admin and tell the team",
                        senderName: "Arjun",
                        senderRole: .opsMember,
                        isVoiceNote: true
                    )
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(.green)

            Button("3. 2FA Login Code Screen Takeover (Rahul)") {
                Task {
                    _ = try? await DeskhandAPIClient.shared.startTask(
                        prompt: "log into store admin with 2fa login code gate and verify inventory",
                        senderName: "Rahul",
                        senderRole: .admin
                    )
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(.cyan)
        }
    }
}

