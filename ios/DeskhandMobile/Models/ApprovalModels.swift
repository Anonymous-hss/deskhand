import Foundation

public struct ApprovalRequest: Codable, Identifiable, Sendable {
    public var id: String { approvalId }
    public let approvalId: String
    public let taskId: String
    public let stepNumber: Int
    public let promptQuestion: String
    public let diffSummary: String
    public let targetUrl: String
    public let screenshotUrl: String
    public let allowedRoles: [TeamRole]
    public var status: String
    public var resolvedBy: String?
    public var expiresAt: String? = nil
    public var observedDiff: ApprovalDiff? = nil
}

public struct TeamPersona: Identifiable, Sendable {
    public let id: String
    public let name: String
    public let role: TeamRole
    public let canApprove: Bool
    public let emoji: String

    public static let demoPersonas: [TeamPersona] = [
        TeamPersona(id: "priya", name: "Priya", role: .qaLead, canApprove: true, emoji: "👩‍💻"),
        TeamPersona(id: "arjun", name: "Arjun", role: .opsMember, canApprove: false, emoji: "📱"),
        TeamPersona(id: "rahul", name: "Rahul", role: .admin, canApprove: true, emoji: "🛡️")
    ]
}


public struct ApprovalDiff: Codable, Sendable {
    public let before: String
    public let after: String
    public let field: String
}
