import SwiftUI
import AVFoundation

struct VoiceNotePlaybackView: View {
    let url: URL
    @State private var player: AVPlayer?
    @State private var playing = false
    var body: some View {
        Button {
            if playing { player?.pause(); playing = false }
            else {
                if player == nil { player = AVPlayer(url: url) }
                player?.seek(to: .zero); player?.play(); playing = true
            }
        } label: { Label(playing ? "Pause voice note" : "Play voice note", systemImage: playing ? "pause.circle" : "waveform.circle") }
        .onDisappear { player?.pause(); playing = false }
        .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) { notification in
            if let item = notification.object as? AVPlayerItem, item === player?.currentItem { playing = false }
        }
    }
}
