import AppKit
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 36, pixelsHigh: 36,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor.white.setStroke()
let orbit = NSBezierPath(ovalIn: NSRect(x: 2, y: 11, width: 32, height: 14))
orbit.lineWidth = 1.6
orbit.stroke()
let core = NSBezierPath(ovalIn: NSRect(x: 9, y: 9, width: 18, height: 18))
core.lineWidth = 3
core.stroke()
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "assets/tray.png"))
