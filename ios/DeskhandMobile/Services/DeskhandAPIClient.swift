import Foundation

public actor DeskhandAPIClient {
    public static let shared = DeskhandAPIClient()
    private var baseURL: URL = URL(string: "http://localhost:4100")!

    public func updateHostURL(_ urlString: String) {
        if let url = URL(string: urlString) {
            self.baseURL = url
        }
    }

    public func startTask(
        prompt: String,
        onDeviceTranscript: String? = nil,
        senderName: String,
        senderRole: TeamRole,
        isVoiceNote: Bool = false
    ) async throws -> DeskhandTask {
        let endpoint = baseURL.appendingPathComponent("/api/tasks")
        var req = URLRequest(url: endpoint)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload: [String: String] = [
            "prompt": prompt,
            "onDeviceTranscript": onDeviceTranscript ?? prompt,
            "senderName": senderName,
            "senderRole": senderRole.rawValue,
            "source": isVoiceNote ? "ios_voice" : "ios_text"
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(DeskhandTask.self, from: data)
    }

    public func submitApproval(
        taskId: String,
        decision: String,
        responderName: String,
        responderRole: TeamRole
    ) async throws {
        let endpoint = baseURL.appendingPathComponent("/api/tasks/\(taskId)/approval")
        var req = URLRequest(url: endpoint)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload: [String: String] = [
            "decision": decision,
            "responderName": responderName,
            "responderRole": responderRole.rawValue
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)
        _ = try await URLSession.shared.data(for: req)
    }

    public func submitTakeoverInput(_ input: RemoteTakeoverInputPayload) async throws {
        let endpoint = baseURL.appendingPathComponent("/api/tasks/\(input.taskId)/takeover")
        var req = URLRequest(url: endpoint)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(input)
        _ = try await URLSession.shared.data(for: req)
    }

    public func triggerEmergencyKillSwitch() async throws {
        let endpoint = baseURL.appendingPathComponent("/api/kill")
        var req = URLRequest(url: endpoint)
        req.httpMethod = "POST"
        _ = try await URLSession.shared.data(for: req)
    }
}

