import Foundation
import CoreGraphics

public enum TakeoverInputMapper {
    public static let targetWidth = 1280.0
    public static let targetHeight = 800.0
    /// Coordinates must be local to the rendered image, after scroll/zoom conversion.
    public static func mapTouchToBrowser(touchPoint: CGPoint, canvasSize: CGSize,
        browserSize: CGSize = CGSize(width: 1280, height: 800)) -> (x: Double, y: Double) {
        guard canvasSize.width > 0, canvasSize.height > 0,
              canvasSize.width.isFinite, canvasSize.height.isFinite,
              touchPoint.x.isFinite, touchPoint.y.isFinite,
              browserSize.width > 0, browserSize.height > 0 else { return (0, 0) }
        return (min(max(Double(touchPoint.x / canvasSize.width * browserSize.width), 0), Double(browserSize.width - 1)),
                min(max(Double(touchPoint.y / canvasSize.height * browserSize.height), 0), Double(browserSize.height - 1)))
    }
}
