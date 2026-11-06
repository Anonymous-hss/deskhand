import ActivityKit
import SwiftUI
import WidgetKit

@main
struct DeskhandWidgetBundle: WidgetBundle {
    var body: some Widget { DeskhandLiveActivity() }
}

struct DeskhandLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DeskhandActivityAttributes.self) { context in
            VStack(alignment: .leading, spacing: 6) {
                Label("Deskhand · #ops", systemImage: "desktopcomputer").font(.headline)
                Text(context.state.status.replacingOccurrences(of: "_", with: " ")).font(.caption.bold()).foregroundStyle(.orange)
                Text(context.state.caption).font(.subheadline).lineLimit(2)
                Text("Step \(context.state.step)").font(.caption)
            }.padding().activityBackgroundTint(.black).activitySystemActionForegroundColor(.orange)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Label("Deskhand", systemImage: "desktopcomputer").font(.caption) }
                DynamicIslandExpandedRegion(.trailing) { Text("Step \(context.state.step)").font(.caption) }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.status == "AWAITING_APPROVAL" ? "Approval needed · open Deskhand" : context.state.caption).lineLimit(2)
                }
            } compactLeading: { Image(systemName: context.state.status == "AWAITING_APPROVAL" ? "hand.raised.fill" : "desktopcomputer").foregroundStyle(.orange) }
              compactTrailing: { Text("\(context.state.step)").monospacedDigit() }
              minimal: { Image(systemName: "desktopcomputer").foregroundStyle(.orange) }
        }
    }
}
