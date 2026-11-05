import SwiftUI

public struct VoiceCommandBar: View {
    @State private var textPrompt: String = ""
    @State private var voiceService = VoiceNoteService()
    let onSendPrompt: (String, Bool) -> Void

    public init(onSendPrompt: @escaping (String, Bool) -> Void) {
        self.onSendPrompt = onSendPrompt
    }

    public var body: some View {
        VStack(spacing: 8) {
            if voiceService.isRecording {
                HStack {
                    Circle()
                        .fill(Color.red)
                        .frame(width: 10, height: 10)
                    Text("🎙️ On-Device STT (0 API Calls): \(voiceService.liveTranscript)")
                        .font(.caption.bold())
                        .foregroundStyle(.orange)
                    Spacer()
                }
                .padding(.horizontal, 14)
            }

            HStack(spacing: 10) {
                Button {
                    if voiceService.isRecording {
                        let transcript = voiceService.stopRecording()
                        onSendPrompt(transcript, true)
                    } else {
                        voiceService.startRecording()
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: voiceService.isRecording ? "stop.circle.fill" : "mic.fill")
                        Text(voiceService.isRecording ? "Send Voice" : "Voice")
                            .font(.caption.bold())
                    }
                    .foregroundStyle(voiceService.isRecording ? .white : .black)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(voiceService.isRecording ? Color.red : Color.orange)
                    .clipShape(Capsule())
                }

                TextField("Ask @deskhand...", text: $textPrompt)
                    .padding(10)
                    .background(Color.white.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                Button {
                    let trimmed = textPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !trimmed.isEmpty else { return }
                    onSendPrompt(trimmed, false)
                    textPrompt = ""
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.orange)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color(red: 0.08, green: 0.11, blue: 0.18))
        }
    }
}

