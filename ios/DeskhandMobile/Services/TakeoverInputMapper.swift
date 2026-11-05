import Foundation
import CoreGraphics

public enum TakeoverInputMapper {
    public static let targetWidth: Double = 1280.0
    public static let targetHeight: Double = 800.0

    /// Maps an iPhone touch coordinate inside the Takeover canvas to the 1280x800 Chromium viewport.
    public static func mapTouchToBrowser(
        touchPoint: CGPoint,
        canvasSize: CGSize
    ) -> (x: Double, y: Double) {
        guard canvasSize.width > 0, canvasSize.height > 0 else {
            return (640, 400)
        }
        let rawX = (Double(touchPoint.x) / Double(canvasSize.width)) * targetWidth
        let rawY = (Double(touchPoint.y) / Double(canvasSize.height)) * targetHeight
        let clampedX = min(max(rawX, 0), targetWidth)
        let clampedY = min(max(rawY, 0), targetHeight)
        return (clampedX, clampedY)
    }
}

