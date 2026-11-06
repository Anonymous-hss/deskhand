import SwiftUI

public struct VoiceCommandBar: View {
    @State private var textPrompt = ""
    @State private var isVoiceDraft = false
    @State private var voiceService = VoiceNoteService()
    @State private var holding = false
    @State private var isSending = false
    let onSendPrompt: (String, Bool, String?) async -> Bool
    public init(onSendPrompt: @escaping (String, Bool, String?) async -> Bool) { self.onSendPrompt = onSendPrompt }
    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if voiceService.isRecording || voiceService.isStarting {
                Label(voiceService.liveTranscript.isEmpty ? "Listening on device…" : voiceService.liveTranscript,
                      systemImage: "waveform")
                    .font(.callout).foregroundStyle(.orange)
                ProgressView(value: Double(voiceService.level)).tint(.orange).accessibilityLabel("Microphone level")
                Button("Finish recording") { finish() }
            }
            if let error = voiceService.errorMessage { Text(error).font(.caption).foregroundStyle(.orange) }
            if isVoiceDraft { Text("Voice transcript · review before sending · 0 STT API calls").font(.caption).foregroundStyle(.secondary) }
            HStack(alignment: .bottom) {
                Button {
                    if voiceService.isRecording { finish() }
                    else { Task { await voiceService.startRecording() } }
                } label: {
                    Image(systemName: voiceService.isRecording ? "stop.circle.fill" : "mic.fill")
                        .font(.title2).frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel(voiceService.isRecording ? "Finish recording" : "Record voice command")
                .accessibilityHint("Tap to start and stop, or hold to record. Review the transcript before sending.")
                .highPriorityGesture(DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        guard !holding else { return }
                        holding = true
                        Task { await voiceService.startRecording() }
                    }
                    .onEnded { _ in holding = false; finish() })
                TextField("Ask Deskhand…", text: $textPrompt, axis: .vertical)
                    .lineLimit(1...4).textFieldStyle(.roundedBorder)
                Button { send() } label: { Image(systemName: "arrow.up.circle.fill").font(.title).frame(minWidth: 44, minHeight: 44) }
                    .accessibilityLabel("Send command")
                    .disabled(textPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || voiceService.isRecording)
            }
        }
        .disabled(isSending)
        .padding().background(.bar)
        .onChange(of: voiceService.isRecording) {
            if !voiceService.isRecording, !voiceService.liveTranscript.isEmpty {
                textPrompt = voiceService.liveTranscript; isVoiceDraft = true
            }
        }
        .onDisappear { voiceService.cancel() }
    }
    private func finish() {
        voiceService.stopRecording()
        let transcript = voiceService.liveTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        if !transcript.isEmpty { textPrompt = transcript; isVoiceDraft = true }
    }
    private func send() {
        let text = textPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard !isSending else { return }
        let voice = isVoiceDraft
        let audio = voice ? voiceService.audioBase64 : nil
        isSending = true
        Task { @MainActor in
            defer { isSending = false }
            if await onSendPrompt(text, voice, audio) {
                textPrompt = ""; isVoiceDraft = false
            }
        }
    }
}
