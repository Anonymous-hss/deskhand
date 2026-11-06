import Foundation

public enum TeamRole: String, Codable, CaseIterable, Sendable {
    case qaLead = "qa-lead"
    case opsLead = "ops-lead"
    case opsMember = "ops-member"
    case admin = "admin"
    case viewer = "viewer"
}

public enum RiskLevel: String, Codable, Sendable {
    case low = "LOW"
    case high = "HIGH"
}

public enum TaskStatus: String, Codable, Hashable, Sendable {
    case queued = "QUEUED"
    case running = "RUNNING"
    case awaitingApproval = "AWAITING_APPROVAL"
    case humanTakeover = "HUMAN_TAKEOVER"
    case completed = "COMPLETED"
    case rejected = "REJECTED"
    case failed = "FAILED"
    case haltedByBudget = "HALTED_BY_BUDGET"
}

public struct TaskStep: Codable, Identifiable, Sendable {
    public var id: Int { stepNumber }
    public let stepNumber: Int
    public let timestamp: String
    public let thought: String
    public let screenshotUrl: String
    public let riskLevel: RiskLevel
    public let pageUrl: String
}

public struct BugReportDraft: Codable, Sendable {
    public let title: String
    public let severity: String
    public let stepsToReproduce: [String]
    public let errorBanner: String
    public let screenshotUrl: String
}

public struct CallBudgetStatus: Codable, Sendable {
    public let maxCalls: Int
    public let usedCalls: Int
    public let halted: Bool
    public let haltReason: String?
}

public struct DeskhandTask: Codable, Identifiable, Sendable {
    public var id: String { taskId }
    public let taskId: String
    public let roomId: String
    public let prompt: String
    public let senderName: String
    public let senderRole: TeamRole
    public var status: TaskStatus
    public var steps: [TaskStep]
    public var pendingApproval: ApprovalRequest?
    public var takeover: TakeoverSession?
    public var bugReport: BugReportDraft?
    public var summary: String?
    public var replayGifUrl: String?
    public var voiceNoteUrl: String? = nil
}

