import SwiftUI

struct HostSettingsView: View {
    @AppStorage("hostURL") private var hostURL = "http://localhost:4100"
    @AppStorage("demoMode") private var demoMode = true
    @State private var draft = ""
    @State private var draftDemo = true
    @State private var pairingCode = ""
    @State private var saving = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                Section("Connection") {
                    Toggle("Offline demo", isOn: $draftDemo)
                    TextField("http://192.168.1.10:4100", text: $draft)
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .textInputAutocapitalization(.never).keyboardType(.URL)
                        #endif
                    Text("Use your Windows host’s LAN address on a physical iPhone. Localhost works only when the host runs on the simulator’s Mac.")
                        .font(.caption).foregroundStyle(.secondary)
                    if !draftDemo {
                        SecureField("8-digit Studio pairing code (first connection)", text: $pairingCode)
                        Text("In Studio, select Pair iPhone operator. Enter its single-use code here. The operator credential is stored in this device’s Keychain.").font(.caption)
                    }
                    if let error { Text(error).foregroundStyle(.red) }
                }
                Section("Demo personas") {
                    Text("Priya and Rahul can review approvals. Arjun sends voice tasks. Offline demo never connects to the Windows host and skips device authentication; live approvals require Face ID or device passcode.")
                }
                Section("Voice") {
                    Text("Speech stays on device. Review the transcript before sending it to the host. The original audio uploads alongside the transcript when you Send.")
                }
            }
            .navigationTitle("Host settings")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saving = true
                        Task { @MainActor in
                            defer { saving = false }
                            do {
                                _ = try HostAddress.validated(draft)
                                if !draftDemo {
                                    try await DeskhandAPIClient.shared.updateHostURL(draft)
                                    if !pairingCode.isEmpty {
                                        if (try? await DeskhandAPIClient.shared.principal()) == nil {
                                            try await DeskhandAPIClient.shared.pair(code: pairingCode.trimmingCharacters(in: .whitespacesAndNewlines))
                                        }
                                        pairingCode = ""
                                    }
                                    _ = try await DeskhandAPIClient.shared.principal()
                                }
                                hostURL = draft; demoMode = draftDemo; dismiss()
                            } catch { self.error = error.localizedDescription }
                        }
                    }.disabled(saving)
                }
            }
            .onAppear { draft = hostURL; draftDemo = demoMode }
        }
    }
}
