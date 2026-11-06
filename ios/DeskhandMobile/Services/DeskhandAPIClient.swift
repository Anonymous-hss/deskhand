import Foundation

public enum GatewayError: LocalizedError {
    case invalidHost, http(Int, String), invalidResponse
    public var errorDescription: String? {
        switch self {
        case .invalidHost: "Enter an http:// or https:// host address without a path."
        case .http(let status, let message): "Host returned \(status): \(message)"
        case .invalidResponse: "The host returned an invalid response."
        }
    }
}

public enum HostAddress {
    public static func validated(_ value: String) throws -> URL {
        guard let parts = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              ["http", "https"].contains(parts.scheme?.lowercased() ?? ""),
              let host = parts.host, !host.isEmpty, parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil, ["", "/"].contains(parts.path),
              let url = parts.url else { throw GatewayError.invalidHost }
        return url
    }
    public static func webSocketURL(for url: URL) -> URL {
        var parts = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        parts.scheme = url.scheme == "https" ? "wss" : "ws"
        parts.path = "/ws"
        return parts.url!
    }
    public static func mediaURL(_ path: String, host: String) -> URL? {
        guard let base = URL(string: host), let url = URL(string: path, relativeTo: base)?.absoluteURL,
              ["http", "https"].contains(url.scheme ?? "") else { return nil }
        return url
    }
}

public actor DeskhandAPIClient {
    public static let shared = DeskhandAPIClient()
    private var baseURL: URL
    private let session: URLSession
    private var accessToken: String?
    public init(baseURL: URL = URL(string: "http://localhost:4100")!, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }
    public func updateHostURL(_ value: String) throws {
        baseURL = try HostAddress.validated(value)
        accessToken = HostCredentialStore.token(for: baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
    }
    public func pair(code: String) async throws {
        struct PairResponse: Decodable { let token: String }
        let data = try await request("api/pair", body: JSONEncoder().encode(["code": code]))
        let token = try JSONDecoder().decode(PairResponse.self, from: data).token
        try HostCredentialStore.save(token, for: baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        accessToken = token
    }
    public func principal() async throws -> HostPrincipal {
        try JSONDecoder().decode(HostPrincipal.self, from: await request("api/auth/session", method: "GET"))
    }
    private func request(_ path: String, body: Data? = nil, method: String = "POST") async throws -> Data {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        if let accessToken { request.setValue("Bearer " + accessToken, forHTTPHeaderField: "Authorization") }
        request.timeoutInterval = 20
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw GatewayError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw GatewayError.http(http.statusCode, message ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode))
        }
        return data
    }
    public func status() async throws -> HostStatus {
        try JSONDecoder().decode(HostStatus.self, from: await request("api/status", method: "GET"))
    }
    public func startTask(prompt: String, onDeviceTranscript: String? = nil, senderName: String,
                          senderRole: TeamRole, isVoiceNote: Bool = false, audioBase64: String? = nil) async throws -> DeskhandTask {
        var payload = ["prompt": prompt, "senderName": senderName, "senderRole": senderRole.rawValue,
                       "source": isVoiceNote ? "ios_voice" : "ios_text"]
        if isVoiceNote { payload["onDeviceTranscript"] = onDeviceTranscript ?? prompt; payload["audioBase64"] = audioBase64 }
        return try JSONDecoder().decode(DeskhandTask.self, from: await request("api/tasks", body: JSONEncoder().encode(payload)))
    }
    public func submitApproval(taskId: String, approvalId: String? = nil, decision: String, responderName: String, responderRole: TeamRole) async throws {
        _ = try await request("api/tasks/\(taskId)/approval", body: JSONEncoder().encode([
            "decision": decision, "approvalId": approvalId ?? ""]))
    }
    public func submitTakeoverInput(_ input: RemoteTakeoverInputPayload) async throws {
        _ = try await request("api/tasks/\(input.taskId)/takeover", body: JSONEncoder().encode(input))
    }
    public func triggerEmergencyKillSwitch() async throws { _ = try await request("api/kill") }
}
