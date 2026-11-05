import Foundation

public struct TakeoverSession: Codable, Sendable {
    public let taskId: String
    public let reason: String
    public let pageUrl: String
    public let takeoverUrl: String
    public var active: Bool
}

public struct RemoteTakeoverInputPayload: Codable, Sendable {
    public let taskId: String
    public let type: String
    public let x: Double?
    public let y: Double?
    public let text: String?
    public let actorName: String?

    public init(taskId: String, type: String, x: Double? = nil, y: Double? = nil, text: String? = nil, actorName: String? = nil) {
        self.taskId = taskId
        self.type = type
        self.x = x
        self.y = y
        self.text = text
        self.actorName = actorName
    }
}

