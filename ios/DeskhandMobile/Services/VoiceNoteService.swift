import Foundation
import Observation
import Speech
import AVFoundation

@Observable @MainActor
public final class VoiceNoteService {
    public private(set) var isRecording = false
    public private(set) var isStarting = false
    public private(set) var liveTranscript = ""
    public private(set) var audioBase64: String?
    public private(set) var level: Float = 0
    public var errorMessage: String?
    @ObservationIgnored private var speechRecognizer: SFSpeechRecognizer?
    @ObservationIgnored private let audioEngine = AVAudioEngine()
    @ObservationIgnored private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var recognitionTask: SFSpeechRecognitionTask?
    @ObservationIgnored private var hasTap = false
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private var audioURL: URL?
    @ObservationIgnored private var audioWriter: VoiceAudioWriter?
    public init() {}

    public func startRecording() async {
        guard !isRecording, !isStarting else { return }
        let token = UUID(); generation = token
        isStarting = true; errorMessage = nil; liveTranscript = ""; audioBase64 = nil
        defer { isStarting = false }
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
        }
        #if os(iOS)
        let microphone = await AVAudioApplication.requestRecordPermission()
        #else
        let microphone = await AVCaptureDevice.requestAccess(for: .audio)
        #endif
        guard generation == token else { return }
        guard speech, microphone else { errorMessage = "Allow microphone and speech recognition in Settings to record a voice command."; return }
        let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-IN"))
        guard let recognizer, recognizer.isAvailable, recognizer.supportsOnDeviceRecognition else {
            errorMessage = "On-device speech recognition is unavailable. Type your command instead."; return
        }
        speechRecognizer = recognizer
        do {
            #if os(iOS)
            try AVAudioSession.sharedInstance().setCategory(.record, mode: .measurement, options: .duckOthers)
            try AVAudioSession.sharedInstance().setActive(true)
            #endif
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.requiresOnDeviceRecognition = true
            request.shouldReportPartialResults = true
            recognitionRequest = request
            let node = audioEngine.inputNode
            let format = node.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                throw NSError(domain: "Voice", code: 1, userInfo: [NSLocalizedDescriptionKey: "No microphone input is available."])
            }
            let audioURL = FileManager.default.temporaryDirectory.appendingPathComponent("deskhand-\(UUID().uuidString).m4a")
            self.audioURL = audioURL
            let writer = try VoiceAudioWriter(url: audioURL, format: format)
            audioWriter = writer
            node.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                request.append(buffer)
                writer.write(buffer)
                let amplitude: Float
                if let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 {
                    var sum: Float = 0
                    for index in 0..<Int(buffer.frameLength) { sum += samples[index] * samples[index] }
                    amplitude = min(sqrt(sum / Float(buffer.frameLength)) * 8, 1)
                } else { amplitude = 0 }
                Task { @MainActor [weak self] in self?.level = amplitude }
            }
            hasTap = true
            recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
                let text = result?.bestTranscription.formattedString
                let message = error?.localizedDescription
                let finished = result?.isFinal ?? false
                Task { @MainActor [weak self] in
                    guard let self, self.generation == token else { return }
                    if let text { self.liveTranscript = text }
                    if let message, self.isRecording { self.errorMessage = message; self.finishCapture() }
                    else if finished { self.finishCapture() }
                }
            }
            audioEngine.prepare()
            try audioEngine.start()
            isRecording = true
        } catch { errorMessage = error.localizedDescription; cancel() }
    }
    private func finishCapture() {
        audioEngine.stop()
        if hasTap { audioEngine.inputNode.removeTap(onBus: 0); hasTap = false }
        recognitionRequest?.endAudio()
        isRecording = false
        level = 0
        audioWriter?.finish(); audioWriter = nil
        if let audioURL {
            audioBase64 = (try? Data(contentsOf: audioURL))?.base64EncodedString()
            try? FileManager.default.removeItem(at: audioURL)
            self.audioURL = nil
        }
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
    }
    public func stopRecording() {
        generation = UUID() // Ignore callbacks from the stopped recognition session.
        finishCapture()
        recognitionTask?.cancel(); recognitionTask = nil; recognitionRequest = nil
    }
    public func cancel() { stopRecording() }
}

// The audio engine invokes its tap serially; only that callback owns this writer.
private final class VoiceAudioWriter: @unchecked Sendable {
    private var file: AVAudioFile?
    private let lock = NSLock()
    init(url: URL, format: AVAudioFormat) throws {
        file = try AVAudioFile(forWriting: url, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: format.sampleRate, AVNumberOfChannelsKey: format.channelCount,
            AVEncoderBitRateKey: 64000], commonFormat: .pcmFormatFloat32, interleaved: false)
    }
    func write(_ buffer: AVAudioPCMBuffer) { lock.withLock { try? file?.write(from: buffer) } }
    func finish() { lock.withLock { file = nil } }
}
