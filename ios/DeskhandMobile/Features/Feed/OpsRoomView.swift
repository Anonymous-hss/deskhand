import SwiftUI

public struct OpsRoomView: View {
    let wsService: DeskhandWebSocketService
    @State private var selectedPersona = TeamPersona.demoPersonas[0]
    @State private var showSettings = false
    @State private var shortcutsExpanded = true
    public init(wsService: DeskhandWebSocketService) { self.wsService = wsService }
    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                StatusHeaderBar(isConnected: wsService.isConnected, budget: wsService.budget) {
                    Task { await wsService.stop() }
                }
                if wsService.isDemo {
                    Label("OFFLINE DEMO · simulated actions", systemImage: "play.rectangle")
                        .font(.caption.bold()).foregroundStyle(.cyan).padding(8)
                }
                if wsService.isDemo { PersonaSwitcherBar(selectedPersona: $selectedPersona) }
                else {
                    Label(wsService.authenticatedPersona?.name ?? "Pair this phone in Host settings to send tasks or approvals", systemImage: "lock.shield")
                        .font(.caption).padding(8)
                }
                if let error = wsService.errorMessage {
                    HStack(alignment: .top) {
                        Text(error).font(.caption).foregroundStyle(.orange)
                        Spacer()
                        Button("Dismiss") { wsService.errorMessage = nil }.font(.caption)
                    }.padding(.horizontal).padding(.vertical, 8)
                }
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        demoShortcuts
                        ForEach(wsService.recentTasks) { task in
                            TaskTimelineCard(task: task, persona: effectivePersona, store: wsService)
                        }
                    }.padding()
                }
                .overlay { if wsService.isSubmitting { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VoiceCommandBar { text, voice, audio in
                    let persona = effectivePersona
                    return await wsService.send(prompt: text, persona: persona, voice: voice, audioBase64: audio)
                }.disabled(wsService.isSubmitting)
            }
            .background(Color(red: 0.04, green: 0.06, blue: 0.11))
            .navigationTitle("#ops")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar { Button { showSettings = true } label: { Label("Host settings", systemImage: "gearshape") } }
            .sheet(isPresented: $showSettings) { HostSettingsView() }
        }
    }
    private var effectivePersona: TeamPersona {
        wsService.isDemo ? selectedPersona : wsService.authenticatedPersona ?? TeamPersona(id: "unpaired", name: "Unpaired device", role: .viewer, canApprove: false, emoji: "🔒")
    }
    private var demoShortcuts: some View {
        DisclosureGroup(wsService.recentTasks.isEmpty ? "Start a Chai Co. task" : "Start another task", isExpanded: $shortcutsExpanded) {
            VStack(alignment: .leading, spacing: 12) {
                shortcut("Reproduce checkout bug", prompt: "Reproduce checkout failure with coupon CHAI50")
                shortcut("Update price · ₹229 → ₹249", prompt: "Update the masala chai price to 249 in the store admin and tell the team")
                shortcut("Verify inventory · 2FA", prompt: "Log into store admin with 2fa login code gate and verify inventory")
            }.padding(.top, 8)
        }.padding().background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 16))
    }
    private func shortcut(_ label: String, prompt: String) -> some View {
        Button(label) {
            let persona = effectivePersona
            Task { await wsService.send(prompt: prompt, persona: persona) }
        }.buttonStyle(.bordered).tint(.orange).disabled(wsService.isSubmitting)
    }
}

private struct TaskTimelineCard: View {
    let task: DeskhandTask
    let persona: TeamPersona
    let store: DeskhandWebSocketService
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                Text("@\(task.senderName)").foregroundStyle(.orange)
                Spacer()
                Text(task.status.rawValue.replacingOccurrences(of: "_", with: " "))
                    .font(.caption.bold()).foregroundStyle(.secondary)
            }
            Text(task.prompt).font(.headline)
            if let audio = task.voiceNoteUrl, let url = HostAddress.mediaURL(audio, host: store.hostBaseURL) {
                VoiceNotePlaybackView(url: url)
            }
            if let approval = task.pendingApproval, task.status == .awaitingApproval, approval.status == "PENDING" {
                ApprovalGateCard(approval: approval, currentPersona: persona, isDemo: store.isDemo,
                                 host: store.hostBaseURL, isSubmitting: store.isSubmitting) { decision in
                    Task { await store.decide(task: task, decision: decision, persona: persona) }
                }
            }
            if let takeover = task.takeover, task.status == .humanTakeover {
                TouchTakeoverSheet(takeover: takeover, frame: store.frame, screenshotPath: task.steps.last?.screenshotUrl,
                                   host: store.hostBaseURL, persona: persona) { input in
                    try await store.takeoverInput(input)
                }
            }
            if !task.steps.isEmpty { StepCarouselView(steps: task.steps, hostBaseURL: store.hostBaseURL) }
            if let bug = task.bugReport {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Ready-to-file bug report", systemImage: "ladybug").foregroundStyle(.orange)
                    Text(bug.title).bold()
                    Text(bug.errorBanner).font(.caption).textSelection(.enabled)
                    ForEach(bug.stepsToReproduce, id: \.self) { Text("• " + $0).font(.caption) }
                    Button("File it in Issue Tracker") {
                        Task { await store.send(prompt: "file it in the issue tracker", persona: persona) }
                    }.buttonStyle(.borderedProminent).tint(.orange)
                        .disabled(persona.role != .admin || store.isSubmitting)
                    if persona.role != .admin { Text("Switch to Rahul (Admin) to file.").font(.caption) }
                }.padding().background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
            }
            if let summary = task.summary { Text(summary).font(.subheadline).textSelection(.enabled) }
            if let replay = task.replayGifUrl, let url = HostAddress.mediaURL(replay, host: store.hostBaseURL) {
                ReplayView(url: url).frame(height: 210).clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }.padding().background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 16))
    }
}
