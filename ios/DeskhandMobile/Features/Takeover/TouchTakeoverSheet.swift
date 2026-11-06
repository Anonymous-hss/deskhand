import SwiftUI

public struct TouchTakeoverSheet: View {
    let takeover: TakeoverSession
    let frame: ScreencastFrame?
    let screenshotPath: String?
    let host: String
    let persona: TeamPersona
    let onInput: (RemoteTakeoverInputPayload) async throws -> Void
    @State private var code = ""
    @State private var text = ""
    @State private var zoom: CGFloat = 1
    @State private var savedZoom: CGFloat = 1
    @State private var sending = false
    @State private var error: String?
    public init(takeover: TakeoverSession, frame: ScreencastFrame?, screenshotPath: String?, host: String,
                persona: TeamPersona, onInput: @escaping (RemoteTakeoverInputPayload) async throws -> Void) {
        self.takeover = takeover; self.frame = frame; self.screenshotPath = screenshotPath
        self.host = host; self.persona = persona; self.onInput = onInput
    }
    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Screen takeover", systemImage: "hand.draw.fill").font(.headline).foregroundStyle(.cyan)
            Text(takeover.reason).font(.subheadline)
            Text(frame == nil ? "Waiting for live frames · use the quick code field below" : "Live browser · pinch to zoom · tap to click")
                .font(.caption).foregroundStyle(.secondary)
            GeometryReader { geometry in
                let width = geometry.size.width * zoom
                let ratio = frame.map { CGFloat($0.height) / CGFloat($0.width) } ?? 0.625
                ScrollView([.horizontal, .vertical]) {
                    canvas.frame(width: width, height: width * ratio)
                        .contentShape(Rectangle())
                        .onTapGesture { point in
                            guard let frame else { return }
                            let mapped = TakeoverInputMapper.mapTouchToBrowser(touchPoint: point,
                                canvasSize: CGSize(width: width, height: width * ratio),
                                browserSize: CGSize(width: frame.width, height: frame.height))
                            submit(type: "tap", x: mapped.x, y: mapped.y)
                        }
                }
                .simultaneousGesture(MagnifyGesture().onChanged { value in
                    zoom = min(max(savedZoom * value.magnification, 1), 4)
                }.onEnded { _ in savedZoom = zoom })
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }.frame(height: 220)
            Button("Reset zoom") { zoom = 1; savedZoom = 1 }.font(.caption)
            HStack {
                TextField("Type remote text", text: $text).textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
                Button("Send keys") { submit(type: "type", text: text) }
                    .disabled(text.isEmpty || frame == nil || sending)
            }
            TextField("6-digit verification code", text: $code).textFieldStyle(.roundedBorder)
                .textContentType(.oneTimeCode)
                #if os(iOS)
                .keyboardType(.numberPad)
                #endif
                .onChange(of: code) { code = String(code.filter(\.isNumber).prefix(6)) }
            Button("Type code & hand back") { submit(type: "otp_submit", text: code) }
                .buttonStyle(.borderedProminent).tint(.cyan)
                .disabled(code.count != 6 || sending)
            Button("Hand back to Deskhand") { submit(type: "hand_back") }
                .disabled(sending)
            if sending { ProgressView("Sending…") }
            if let error { Text(error).font(.caption).foregroundStyle(.orange) }
        }.padding().background(.cyan.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
    }
    @ViewBuilder private var canvas: some View {
        #if os(iOS)
        if let frame, let data = Data(base64Encoded: frame.jpegBase64), let image = UIImage(data: data) {
            Image(uiImage: image).resizable().scaledToFit().accessibilityLabel("Live remote browser")
        } else { fallback }
        #else
        if let frame, let data = Data(base64Encoded: frame.jpegBase64), let image = NSImage(data: data) {
            Image(nsImage: image).resizable().scaledToFit().accessibilityLabel("Live remote browser")
        } else { fallback }
        #endif
    }
    private var fallback: some View {
        ZStack {
            Color.black.opacity(0.3)
            if let screenshotPath, !screenshotPath.isEmpty {
                AsyncImage(url: HostAddress.mediaURL(screenshotPath, host: host)) { image in image.resizable().scaledToFit() }
                    placeholder: { Label("Waiting for browser", systemImage: "display") }
            } else { Label("Browser paused · enter your code below", systemImage: "lock.display").font(.caption) }
        }
    }
    private func submit(type: String, x: Double? = nil, y: Double? = nil, text: String? = nil) {
        guard !sending else { return }
        let input = RemoteTakeoverInputPayload(taskId: takeover.taskId, type: type, x: x, y: y, text: text, actorName: persona.name)
        sending = true; error = nil
        Task { @MainActor in
            defer { sending = false }
            do { try await onInput(input); if type == "type" { self.text = "" }; if type == "otp_submit" { code = "" } }
            catch { self.error = error.localizedDescription }
        }
    }
}
