import AppKit
import Foundation

// Code-native vector artwork, rendered independently at every macOS icon size.
let output = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "assets")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: r, green: g, blue: b, alpha: a)
}

func render(size: Int, mode: String) -> Data {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let context = NSGraphicsContext(bitmapImageRep: bitmap)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    context.cgContext.scaleBy(x: CGFloat(size) / 1024, y: CGFloat(size) / 1024)

    let tile = NSBezierPath(roundedRect: NSRect(x: 48, y: 48, width: 928, height: 928), xRadius: 208, yRadius: 208)
    NSGradient(colors: [color(0.055, 0.072, 0.105), color(0.009, 0.014, 0.023)])!
        .draw(in: tile, angle: -65)
    color(0.37, 0.45, 0.59, 0.32).setStroke()
    tile.lineWidth = 2.5
    tile.stroke()

    NSGraphicsContext.saveGraphicsState()
    tile.addClip()
    let center = NSPoint(x: 512, y: 565)
    let glow = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [color(0.31, 0.48, 0.68, 0.32).cgColor, color(0.31, 0.48, 0.68, 0).cgColor] as CFArray,
        locations: [0, 1])!
    context.cgContext.drawRadialGradient(glow, startCenter: center, startRadius: 100,
        endCenter: center, endRadius: 340, options: [])

    let tilt = NSAffineTransform()
    tilt.translateX(by: center.x, yBy: center.y)
    tilt.rotate(byDegrees: -14)
    tilt.concat()
    for layer in stride(from: 23, through: 0, by: -1) {
        let fraction = CGFloat(layer) / 23
        let radiusX = 300 + fraction * 142
        let radiusY = 74 + fraction * 67
        let path = NSBezierPath(ovalIn: NSRect(x: -radiusX, y: -radiusY, width: radiusX * 2, height: radiusY * 2))
        color(0.64 + fraction * 0.2, 0.77 + fraction * 0.14, 0.94, 0.11 + (1 - fraction) * 0.32).setStroke()
        path.lineWidth = layer % 3 == 0 ? 4 : 2
        path.stroke()
    }
    NSGraphicsContext.restoreGraphicsState()

    let hole = NSBezierPath(ovalIn: NSRect(x: center.x - 164, y: center.y - 164, width: 328, height: 328))
    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = color(0.45, 0.68, 0.96, 0.95)
    shadow.shadowBlurRadius = 26
    shadow.shadowOffset = .zero
    shadow.set()
    color(0.77, 0.88, 1).setStroke()
    hole.lineWidth = 6
    hole.stroke()
    NSGraphicsContext.restoreGraphicsState()
    color(0.002, 0.005, 0.009).setFill()
    hole.fill()
    color(0.76, 0.86, 0.97).setStroke()
    hole.lineWidth = 3
    hole.stroke()

    let label = "FX"
    let font = NSFont.systemFont(ofSize: 113, weight: .medium)
    let attributes: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: color(0.86, 0.91, 0.98),
        .kern: 12
    ]
    let textSize = label.size(withAttributes: attributes)
    label.draw(at: NSPoint(x: (1024 - textSize.width) / 2, y: 187), withAttributes: attributes)

    NSGraphicsContext.restoreGraphicsState()
    return bitmap.representation(using: .png, properties: [:])!
}

let sizes = [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)]
for mode in ["icon"] {
    try render(size: 1024, mode: mode).write(to: output.appendingPathComponent("icon.png"))
    let iconset = output.appendingPathComponent("\(mode).iconset", isDirectory: true)
    try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
    for (base, scale) in sizes {
        let suffix = scale == 2 ? "@2x" : ""
        let url = iconset.appendingPathComponent("icon_\(base)x\(base)\(suffix).png")
        try render(size: base * scale, mode: mode).write(to: url)
    }
    let icon = output.appendingPathComponent("\(mode).icns")
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
    process.arguments = ["--convert", "icns", "--output", icon.path, iconset.path]
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { fatalError("iconutil failed") }
    print(icon.path)
}
