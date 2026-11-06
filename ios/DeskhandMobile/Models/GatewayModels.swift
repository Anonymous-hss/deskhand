import Foundation

public struct HostStatus: Decodable, Sendable {
    public let budget: CallBudgetStatus
    public let activeTask: DeskhandTask?
    public let recentTasks: [DeskhandTask]
}
public struct ScreencastFrame: Codable, Sendable {
    public let taskId: String
    public let jpegBase64: String
    public let width: Int
    public let height: Int
}
public struct GatewayEvent: Decodable, Sendable {
    public let event: String
    public let status: HostStatus?
    public let task: DeskhandTask?
    public let frame: ScreencastFrame?
    private enum Keys: String, CodingKey { case event, data, task }
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: Keys.self)
        event = try container.decode(String.self, forKey: .event)
        status = event == "host:status" ? try container.decode(HostStatus.self, forKey: .data) : nil
        frame = event == "takeover:frame" ? try container.decode(ScreencastFrame.self, forKey: .data) : nil
        if event.hasPrefix("task:") {
            if let direct = try? container.decode(DeskhandTask.self, forKey: .data) { task = direct }
            else {
                let nested = try container.nestedContainer(keyedBy: Keys.self, forKey: .data)
                task = try nested.decode(DeskhandTask.self, forKey: .task)
            }
        } else { task = nil }
    }
}
