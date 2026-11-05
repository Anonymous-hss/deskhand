import Foundation

public enum MockDemoServer {
    public static func samplePriceApprovalTask() -> DeskhandTask {
        let step1 = TaskStep(
            stepNumber: 1,
            timestamp: "16:15:01",
            thought: "Opened Chai Co. Store Admin portal (/admin)",
            screenshotUrl: "/captures/mock-step-1.png",
            riskLevel: .low,
            pageUrl: "http://localhost:4000/admin"
        )
        let step2 = TaskStep(
            stepNumber: 2,
            timestamp: "16:15:04",
            thought: "Typed 249 into Masala Chai Tin (250g) price field (was ₹229)",
            screenshotUrl: "/captures/mock-step-2.png",
            riskLevel: .high,
            pageUrl: "http://localhost:4000/admin"
        )
        let approval = ApprovalRequest(
            approvalId: "appr-demo-1",
            taskId: "task-demo-249",
            stepNumber: 3,
            promptQuestion: "Change Masala Chai from ₹229 to ₹249?",
            diffSummary: "Masala Chai Tin (250g): ₹229 → ₹249",
            targetUrl: "http://localhost:4000/admin",
            screenshotUrl: "/captures/mock-step-2.png",
            allowedRoles: [.qaLead, .admin],
            status: "PENDING",
            resolvedBy: nil
        )
        return DeskhandTask(
            taskId: "task-demo-249",
            roomId: "ops",
            prompt: "Update the masala chai price to 249 in the store admin and tell the team",
            senderName: "Arjun",
            senderRole: .opsMember,
            status: .awaitingApproval,
            steps: [step1, step2],
            pendingApproval: approval,
            takeover: nil,
            bugReport: nil,
            summary: nil,
            replayGifUrl: nil
        )
    }
}

