import Foundation
import Observation

@Observable @MainActor
public final class DeskhandWebSocketService {
    public private(set) var isConnected = false
    public private(set) var activeTask: DeskhandTask?
    public private(set) var recentTasks: [DeskhandTask] = []
    public private(set) var frame: ScreencastFrame?
    public private(set) var budget = CallBudgetStatus(maxCalls: 150, usedCalls: 0, halted: false, haltReason: nil)
    public private(set) var hostBaseURL = "http://localhost:4100"
    public private(set) var isDemo = false
    public private(set) var authenticatedPersona: TeamPersona?
    public var errorMessage: String?
    public private(set) var isSubmitting = false
    @ObservationIgnored private var connection: Task<Void, Never>?
    @ObservationIgnored private var demoTask: Task<Void, Never>?
    @ObservationIgnored private var socket: URLSessionWebSocketTask?
    @ObservationIgnored private let api: DeskhandAPIClient
    #if os(iOS)
    @ObservationIgnored private let liveActivity = LiveActivityService()
    @ObservationIgnored private var activityUpdate: Task<Void, Never>?
    #endif
    public init(api: DeskhandAPIClient = .shared) { self.api = api }

    public func configure(host: String, demo: Bool) async {
        do {
            let url = try HostAddress.validated(host)
            disconnect()
            hostBaseURL = url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            try await api.updateHostURL(hostBaseURL)
            isDemo = demo
            activeTask = nil; recentTasks = []; frame = nil; errorMessage = nil
            budget = CallBudgetStatus(maxCalls: 150, usedCalls: 0, halted: false, haltReason: nil)
            if demo { authenticatedPersona = nil; return }
            if let principal = try? await api.principal() {
                authenticatedPersona = TeamPersona(id: principal.id, name: principal.name, role: principal.role,
                    canApprove: [.admin, .opsLead, .qaLead].contains(principal.role), emoji: "🔐")
            } else { authenticatedPersona = nil }
            connect(url: HostAddress.webSocketURL(for: url))
        } catch { errorMessage = error.localizedDescription }
    }
    public func disconnect() {
        connection?.cancel(); connection = nil
        demoTask?.cancel(); demoTask = nil
        socket?.cancel(with: .goingAway, reason: nil); socket = nil
        isConnected = false
    }
    private func connect(url: URL) {
        connection = Task { [weak self] in
            var delay = 1
            while !Task.isCancelled {
                guard let self else { return }
                let task = URLSession.shared.webSocketTask(with: url)
                self.socket = task
                task.resume()
                do {
                    while !Task.isCancelled {
                        let message = try await task.receive()
                        try Task.checkCancellation()
                        let data: Data
                        switch message {
                        case .string(let text): data = Data(text.utf8)
                        case .data(let bytes): data = bytes
                        @unknown default: continue
                        }
                        let event = try JSONDecoder().decode(GatewayEvent.self, from: data)
                        self.isConnected = true; delay = 1
                        self.apply(event)
                    }
                } catch {
                    if Task.isCancelled { return }
                    self.isConnected = false
                    self.errorMessage = "Connection lost. Retrying… \(error.localizedDescription)"
                }
                task.cancel(with: .goingAway, reason: nil)
                do { try await Task.sleep(for: .seconds(delay)) } catch { return }
                delay = min(delay * 2, 16)
            }
        }
    }
    public func apply(_ event: GatewayEvent) {
        if let status = event.status {
            budget = status.budget; activeTask = status.activeTask; recentTasks = status.recentTasks
            if let task = status.activeTask { upsert(task) } else { frame = nil }
            errorMessage = nil
        }
        if let task = event.task { upsert(task) }
        if let frame = event.frame, frame.taskId == activeTask?.taskId,
           frame.width > 0, frame.height > 0 { self.frame = frame }
    }
    private func upsert(_ task: DeskhandTask) {
        activeTask = task
        if let index = recentTasks.firstIndex(where: { $0.id == task.id }) { recentTasks[index] = task }
        else { recentTasks.insert(task, at: 0) }
        if task.status != .humanTakeover { frame = nil }
        #if os(iOS)
        let previous = activityUpdate
        activityUpdate = Task { [liveActivity] in
            await previous?.value
            await liveActivity.update(task)
        }
        #endif
    }
    @discardableResult
    public func send(prompt: String, persona: TeamPersona, voice: Bool = false, audioBase64: String? = nil) async -> Bool {
        let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSubmitting else { return false }
        guard !budget.halted else { errorMessage = budget.haltReason ?? "Call budget exhausted."; return false }
        isSubmitting = true
        defer { isSubmitting = false }
        if isDemo { playDemo(prompt: text, persona: persona); return true }
        do {
            let task = try await api.startTask(prompt: text, senderName: persona.name, senderRole: persona.role, isVoiceNote: voice, audioBase64: audioBase64)
            // A WebSocket step may arrive before the HTTP task creation response.
            if !recentTasks.contains(where: { $0.id == task.id }) { upsert(task) }
            return true
        } catch { errorMessage = error.localizedDescription; return false }
    }
    public func decide(task: DeskhandTask, decision: String, persona: TeamPersona) async {
        guard !isSubmitting, let approval = task.pendingApproval, approval.status == "PENDING",
              approval.allowedRoles.contains(persona.role) else { return }
        isSubmitting = true; defer { isSubmitting = false }
        if isDemo {
            var result = task
            result.pendingApproval?.status = decision == "approve" ? "APPROVED" : "REJECTED"
            result.pendingApproval?.resolvedBy = persona.name
            result.status = decision == "approve" ? .completed : .rejected
            result.summary = decision == "approve" ? "Demo: price updated to ₹249. Team notified." : "Demo: cancelled. No changes saved."
            upsert(result); return
        }
        do { try await api.submitApproval(taskId: task.id, approvalId: approval.approvalId, decision: decision, responderName: persona.name, responderRole: persona.role) }
        catch { errorMessage = error.localizedDescription }
    }
    public func takeoverInput(_ input: RemoteTakeoverInputPayload) async throws {
        if isDemo {
            if input.type == "hand_back" || input.type == "otp_submit", var task = activeTask {
                task.takeover?.active = false; task.status = .completed
                task.summary = "Demo: handed back to Deskhand. Inventory verified."; upsert(task)
            }
            return
        }
        try await api.submitTakeoverInput(input)
    }
    public func stop() async {
        if isDemo {
            demoTask?.cancel()
            if var task = activeTask { task.status = .failed; task.summary = "Emergency stop."; upsert(task) }
            return
        }
        do { try await api.triggerEmergencyKillSwitch() } catch { errorMessage = error.localizedDescription }
    }
    private func playDemo(prompt: String, persona: TeamPersona) {
        demoTask?.cancel()
        var task = MockDemoServer.task(prompt: prompt, persona: persona)
        let final = task
        task.status = .running; task.steps = []; task.pendingApproval = nil; task.takeover = nil; task.bugReport = nil; task.summary = nil
        upsert(task)
        demoTask = Task { [weak self] in
            for step in final.steps {
                do { try await Task.sleep(for: .milliseconds(650)) } catch { return }
                guard let self else { return }
                task.steps.append(step); self.upsert(task)
            }
            guard !Task.isCancelled else { return }
            self?.upsert(final)
        }
    }
}
