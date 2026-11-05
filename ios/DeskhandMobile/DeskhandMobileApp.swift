import SwiftUI

@main
public struct DeskhandMobileApp: App {
    @State private var wsService = DeskhandWebSocketService()

    public init() {}

    public var body: some Scene {
        WindowGroup {
            OpsRoomView(wsService: wsService)
                .preferredColorScheme(.dark)
                .onAppear {
                    wsService.connect()
                }
        }
    }
}

