#if os(iOS)
import ActivityKit

public struct DeskhandActivityAttributes: ActivityAttributes, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public var status: String
        public var step: Int
        public var caption: String
    }
    public var taskID: String
    public var prompt: String
}
#endif
