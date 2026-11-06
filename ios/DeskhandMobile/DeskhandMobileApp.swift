import SwiftUI

@main
public struct DeskhandMobileApp: App {
    @State private var store = DeskhandWebSocketService()
    @AppStorage("hostURL") private var hostURL = "http://localhost:4100"
    @AppStorage("demoMode") private var demoMode = true
    @Environment(\.scenePhase) private var scenePhase
    public init() {}
    public var body: some Scene {
        WindowGroup {
            OpsRoomView(wsService: store)
                .preferredColorScheme(.dark)
                .task(id: "\(hostURL)-\(demoMode)-\(scenePhase)") {
                    if scenePhase == .active { await store.configure(host: hostURL, demo: demoMode) }
                    else if scenePhase == .background { store.disconnect() }
                }
        }
    }
}
