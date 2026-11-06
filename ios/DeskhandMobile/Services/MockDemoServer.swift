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
    public static func task(prompt: String, persona: TeamPersona) -> DeskhandTask {
        let id = "demo-" + UUID().uuidString
        let isQA = prompt.lowercased().contains("coupon") || prompt.lowercased().contains("reproduce")
        let isTakeover = prompt.lowercased().contains("2fa") || prompt.lowercased().contains("login")
        let filing = prompt.lowercased().contains("file it")
        let captions = isQA ? ["Opened Chai Co. staging shop", "Applied CHAI50 to the cart", "Reproduced checkout error 500"]
            : isTakeover ? ["Opened the admin login", "Waiting for a teammate’s verification code"]
            : filing ? ["Opened issue tracker", "Filed coupon checkout bug"]
            : ["Opened Store Admin", "Entered ₹249; save is paused"]
        let steps = captions.enumerated().map { index, caption in
            TaskStep(stepNumber: index + 1, timestamp: "Demo", thought: caption, screenshotUrl: "",
                     riskLevel: index == 1 && !isQA ? .high : .low, pageUrl: "Demo · Chai Co.")
        }
        let approval = ApprovalRequest(approvalId: "approval-" + id, taskId: id, stepNumber: 3,
            promptQuestion: "Change Masala Chai from ₹229 to ₹249?", diffSummary: "Masala Chai Tin (250g): ₹229 → ₹249",
            targetUrl: "Demo · Store Admin / products / masala-chai", screenshotUrl: "", allowedRoles: [.qaLead, .opsLead, .admin], status: "PENDING")
        let takeover = TakeoverSession(taskId: id, reason: "Enter the 6-digit login code to verify inventory.",
            pageUrl: "Demo · Store Admin", takeoverUrl: "", active: true)
        let bug = BugReportDraft(title: "Checkout fails with CHAI50", severity: "CRITICAL", stepsToReproduce: captions,
                                 errorBanner: "500 CouponDiscountOverflowException", screenshotUrl: "")
        return DeskhandTask(taskId: id, roomId: "ops", prompt: prompt, senderName: persona.name, senderRole: persona.role,
            status: isQA || filing ? .completed : isTakeover ? .humanTakeover : .awaitingApproval,
            steps: steps, pendingApproval: isQA || isTakeover || filing ? nil : approval,
            takeover: isTakeover ? takeover : nil, bugReport: isQA ? bug : nil,
            summary: isQA ? "Reproduced checkout error. Bug report ready." : filing ? "Demo: issue filed in tracker." : nil)
    }

}

