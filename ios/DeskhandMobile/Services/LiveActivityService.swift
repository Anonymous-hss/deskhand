#if os(iOS)
@preconcurrency import ActivityKit

@MainActor
final class LiveActivityService {
    private var activity: Activity<DeskhandActivityAttributes>?
    func update(_ task: DeskhandTask) async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let state = DeskhandActivityAttributes.ContentState(status: task.status.rawValue, step: task.steps.count,
            caption: task.pendingApproval?.status == "PENDING" ? task.pendingApproval!.promptQuestion : task.steps.last?.thought ?? task.prompt)
        let content = ActivityContent(state: state, staleDate: .now.addingTimeInterval(120))
        let terminal: Set<TaskStatus> = [.completed, .rejected, .failed, .haltedByBudget]
        if activity?.attributes.taskID != task.id {
            if let activity { await activity.end(nil, dismissalPolicy: .immediate) }
            activity = nil
        }
        if terminal.contains(task.status) {
            await activity?.end(content, dismissalPolicy: .after(.now.addingTimeInterval(30)))
            activity = nil
        } else if let activity { await activity.update(content) }
        else {
            activity = try? Activity.request(attributes: DeskhandActivityAttributes(taskID: task.id, prompt: task.prompt), content: content)
        }
    }
    func end() async { await activity?.end(nil, dismissalPolicy: .immediate); activity = nil }
}
#endif
