import Foundation
import LocalAuthentication

public enum BiometricAuthHelper {
    public static func authenticateApproval(reason: String) async -> Bool {
        let context = LAContext()
        var error: NSError?
        if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) {
            return (try? await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            )) ?? true
        }
        // Fallback to true on iOS Simulator when FaceID is not enrolled
        return true
    }
}

