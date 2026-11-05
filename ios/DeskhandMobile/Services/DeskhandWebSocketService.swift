import Foundation
import Observation

@Observable
@MainActor
public final class DeskhandWebSocketService {
    public var isConnected: Bool = false
    public var activeTask: DeskhandTask?
    public var recentTasks: [DeskhandTask] = []
    public var budget: CallBudgetStatus = CallBudgetStatus(
        maxCalls: 150,
        usedCalls: 0,
        halted: false,
        haltReason: nil
    )
    public var hostBaseURL: String = "http://localhost:4100"

    private var wsTask: URLSessionWebSocketTask?

    public init() {}

    public func connect(wsURLString: String = "ws://localhost:4100/ws") {
        guard let url = URL(string: wsURLString) else { return }
        wsTask?.cancel(with: .goingAway, reason: nil)
        let session = URLSession(configuration: .default)
        let task = session.webSocketTask(with: url)
        self.wsTask = task
        task.resume()
        self.isConnected = true
        Task {
            await listenLoop()
        }
    }

    private func listenLoop() async {
        guard let task = wsTask else { return }
        while !Task.isCancelled {
            do {
                let message = try await task.receive()
                if case .string(let text) = message {
                    handleIncomingJSON(text)
                }
            } catch {
                self.isConnected = false
                break
            }
        }
    }

    private func handleIncomingJSON(_ text: String) {
        guard let data = text.data(using: .utf8),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let event = raw["event"] as? String else { return }

        if event == "host:status",
           let statusDict = raw["data"] as? [String: Any],
           let budgetDict = statusDict["budget"],
           let budgetData = try? JSONSerialization.data(withJSONObject: budgetDict),
           let decodedBudget = try? JSONDecoder().decode(CallBudgetStatus.self, from: budgetData) {
            self.budget = decodedBudget
        }

        if event.hasPrefix("task:"),
           let eventData = raw["data"] as? [String: Any] {
            let taskObj = (eventData["task"] as? [String: Any]) ?? eventData
            if let taskData = try? JSONSerialization.data(withJSONObject: taskObj),
               let decodedTask = try? JSONDecoder().decode(DeskhandTask.self, from: taskData) {
                self.activeTask = decodedTask
                if let idx = self.recentTasks.firstIndex(where: { $0.taskId == decodedTask.taskId }) {
                    self.recentTasks[idx] = decodedTask
                } else {
                    self.recentTasks.insert(decodedTask, at: 0)
                }
            }
        }
    }
}

