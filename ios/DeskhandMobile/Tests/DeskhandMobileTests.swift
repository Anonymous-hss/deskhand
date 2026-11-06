import Foundation
import Testing
@testable import DeskhandMobile

@Test func validatesHostAddresses() throws {
    let host = try HostAddress.validated(" https://192.168.1.4:4100/ ")
    #expect(HostAddress.webSocketURL(for: host).absoluteString == "wss://192.168.1.4:4100/ws")
    for value in ["file:///tmp/host", "localhost:4100", "http://user:pass@host", "http://host/api", "http://host?token=secret"] {
        #expect(throws: GatewayError.self) { try HostAddress.validated(value) }
    }
    #expect(HostAddress.mediaURL("/captures/step.png", host: "http://192.168.1.4:4100")?.absoluteString == "http://192.168.1.4:4100/captures/step.png")
}

@Test func mapsZoomedCanvasAndClampsToPixelBounds() {
    let center = TakeoverInputMapper.mapTouchToBrowser(touchPoint: CGPoint(x: 320, y: 200), canvasSize: CGSize(width: 640, height: 400))
    #expect(center.x == 640 && center.y == 400)
    let edge = TakeoverInputMapper.mapTouchToBrowser(touchPoint: CGPoint(x: 2000, y: -5), canvasSize: CGSize(width: 640, height: 400))
    #expect(edge.x == 1279 && edge.y == 0)
    let empty = TakeoverInputMapper.mapTouchToBrowser(touchPoint: .zero, canvasSize: .zero)
    #expect(empty.x == 0 && empty.y == 0)
}

@Test @MainActor func restoresSnapshotAndDecodesNestedEvents() throws {
    let task = MockDemoServer.samplePriceApprovalTask()
    let taskJSON = String(decoding: try JSONEncoder().encode(task), as: UTF8.self)
    let budget = #"{"maxCalls":150,"usedCalls":42,"halted":false,"haltReason":null}"#
    let snapshot = "{\"event\":\"host:status\",\"data\":{\"budget\":\(budget),\"activeTask\":\(taskJSON),\"recentTasks\":[\(taskJSON)]}}"
    let store = DeskhandWebSocketService()
    store.apply(try JSONDecoder().decode(GatewayEvent.self, from: Data(snapshot.utf8)))
    #expect(store.activeTask?.id == task.id)
    #expect(store.recentTasks.count == 1)
    #expect(store.budget.usedCalls == 42)
    for event in ["task:step", "task:approval_required", "task:takeover_requested", "task:completed"] {
        let data = event == "task:completed" ? taskJSON : "{\"task\":\(taskJSON)}"
        let message = "{\"event\":\"\(event)\",\"data\":\(data)}"
        store.apply(try JSONDecoder().decode(GatewayEvent.self, from: Data(message.utf8)))
    }
    #expect(store.recentTasks.count == 1)
}

@Test @MainActor func demoRoleEnforcementAndRejection() async throws {
    let store = DeskhandWebSocketService()
    await store.configure(host: "http://localhost:4100", demo: true)
    let task = MockDemoServer.samplePriceApprovalTask()
    let json = try JSONEncoder().encode(task)
    let event = "{\"event\":\"task:started\",\"data\":\(String(decoding: json, as: UTF8.self))}"
    store.apply(try JSONDecoder().decode(GatewayEvent.self, from: Data(event.utf8)))
    await store.decide(task: task, decision: "approve", persona: TeamPersona.demoPersonas[1])
    #expect(store.activeTask?.status == .awaitingApproval)
    await store.decide(task: task, decision: "reject", persona: TeamPersona.demoPersonas[0])
    #expect(store.activeTask?.status == .rejected)
    #expect(store.activeTask?.pendingApproval?.status == "REJECTED")
    #expect(!store.isConnected)
}

@Test func threeDemoScenariosAreDistinct() {
    let persona = TeamPersona.demoPersonas[0]
    #expect(MockDemoServer.task(prompt: "coupon CHAI50", persona: persona).bugReport != nil)
    #expect(MockDemoServer.task(prompt: "price 249", persona: persona).status == .awaitingApproval)
    #expect(MockDemoServer.task(prompt: "2fa login", persona: persona).takeover?.active == true)
}

private final class DeniedProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let response = HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"error":"Role is not authorized"}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@Test func apiSurfacesForbiddenApproval() async {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [DeniedProtocol.self]
    let api = DeskhandAPIClient(session: URLSession(configuration: config))
    do {
        try await api.submitApproval(taskId: "task-1", decision: "approve", responderName: "Arjun", responderRole: .opsMember)
        Issue.record("A forbidden approval must throw")
    } catch {
        #expect(error.localizedDescription.contains("403"))
        #expect(error.localizedDescription.contains("Role is not authorized"))
    }
}

@Test @MainActor func rejectedTaskDispatchReportsFailureForDraftRetention() async {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [DeniedProtocol.self]
    let api = DeskhandAPIClient(session: URLSession(configuration: config))
    let store = DeskhandWebSocketService(api: api)
    let accepted = await store.send(prompt: "Keep this draft", persona: TeamPersona.demoPersonas[0])
    #expect(!accepted)
    #expect(store.errorMessage?.contains("403") == true)
    #expect(!store.isSubmitting)
    #expect(store.recentTasks.isEmpty)
}
