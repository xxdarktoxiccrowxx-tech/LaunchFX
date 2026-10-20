import Cocoa
import ApplicationServices

struct HelperFailure: Error {
    let message: String
}

@MainActor
func emit(_ value: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
}

func argument(_ name: String) -> String? {
    let values = CommandLine.arguments
    guard let index = values.firstIndex(of: name), index + 1 < values.count else { return nil }
    return values[index + 1]
}

@MainActor
func validatedApplication() throws -> (URL, String) {
    guard let raw = argument("--app"), raw.hasPrefix("/"), raw.lowercased().hasSuffix(".app"),
          !raw.unicodeScalars.contains(where: { $0.value < 32 }) else {
        throw HelperFailure(message: "Choose a valid .app application.")
    }
    let url = URL(fileURLWithPath: raw, isDirectory: true).standardizedFileURL.resolvingSymlinksInPath()
    guard let bundle = Bundle(url: url), let id = bundle.bundleIdentifier,
          bundle.executableURL != nil else {
        throw HelperFailure(message: "The selected application is missing or invalid.")
    }
    return (url, id)
}

@MainActor
func sameTarget(_ application: NSRunningApplication, bundleID: String, url: URL) -> Bool {
    !application.isTerminated && application.bundleIdentifier == bundleID
        && application.bundleURL?.standardizedFileURL.resolvingSymlinksInPath() == url
}

@MainActor
func fullScreenWindow(pid: pid_t) -> AXUIElement? {
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, 0.18)
    var candidates: [AXUIElement] = []
    for attribute in [kAXMainWindowAttribute, kAXFocusedWindowAttribute] {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(app, attribute as CFString, &value) == .success,
              let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { continue }
        let window = unsafeBitCast(value, to: AXUIElement.self)
        candidates.append(window)
    }
    // Some clients do not expose a main window until after activation. Inspect
    // their own standard windows as a fallback; never read titles or contents.
    var windowsValue: CFTypeRef?
    if AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &windowsValue) == .success,
       let windows = windowsValue as? [AXUIElement] {
        candidates.append(contentsOf: windows.prefix(20))
    }
    for window in candidates {
        AXUIElementSetMessagingTimeout(window, 0.18)
        var subrole: CFTypeRef?
        guard AXUIElementCopyAttributeValue(window, kAXSubroleAttribute as CFString, &subrole) == .success,
              subrole as? String == kAXStandardWindowSubrole else { continue }
        if isFullScreen(window) != nil { return window }
    }
    return nil
}

@MainActor
func isFullScreen(_ window: AXUIElement) -> Bool? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(window, "AXFullScreen" as CFString, &value) == .success,
          let value, CFGetTypeID(value) == CFBooleanGetTypeID() else { return nil }
    return CFBooleanGetValue(unsafeBitCast(value, to: CFBoolean.self))
}

@MainActor
func setFullScreen(_ requested: Bool, application: NSRunningApplication, bundleID: String, url: URL) async -> String? {
    guard AXIsProcessTrusted() else {
        return "Allow LaunchFX in System Settings → Privacy & Security → Accessibility to control full screen."
    }
    let deadline = ProcessInfo.processInfo.systemUptime + 8.0
    var written: [AXUIElement] = []
    while ProcessInfo.processInfo.systemUptime < deadline {
        guard sameTarget(application, bundleID: bundleID, url: url) else { return "The target application closed before its window was ready." }
        if let window = fullScreenWindow(pid: application.processIdentifier), let state = isFullScreen(window) {
            if state == requested { return nil }
            if !written.contains(where: { CFEqual($0, window) }) {
                let result = AXUIElementSetAttributeValue(window, "AXFullScreen" as CFString, requested ? kCFBooleanTrue : kCFBooleanFalse)
                // A transient AX failure must not suppress every later retry.
                if result == .success { written.append(window) }
                if isFullScreen(window) == requested { return nil }
            }
        }
        try? await Task.sleep(nanoseconds: 130_000_000)
    }
    return "The application opened, but its window mode could not be confirmed. Check Accessibility permission or try again."
}

@MainActor
func openApplication(url: URL, bundleID: String, target: String, mode: String) async throws -> NSRunningApplication {
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = true
    configuration.createsNewApplicationInstance = false
    configuration.promptsUserIfNeeded = true
    return try await withCheckedThrowingContinuation { continuation in
        let completion: @Sendable (NSRunningApplication?, Error?) -> Void = { application, error in
            if let error { continuation.resume(throwing: error) }
            else if let application { continuation.resume(returning: application) }
            else { continuation.resume(throwing: HelperFailure(message: "macOS did not confirm the application opened.")) }
        }
        let unified = mode == "unified" || (mode == "auto" && bundleID == "com.openai.codex")
        if unified {
            let route = target == "chatgpt" ? "chat" : "codex"
            NSWorkspace.shared.open([URL(string: "codex://new?mode=\(route)")!], withApplicationAt: url, configuration: configuration, completionHandler: completion)
        } else {
            NSWorkspace.shared.openApplication(at: url, configuration: configuration, completionHandler: completion)
        }
    }
}

@main
struct LaunchFXHelper {
    @MainActor
    static func main() async {
        // This command-line helper never requests permissions. LaunchFX's explicit
        // permission button grants access to the responsible parent application.
        guard let action = CommandLine.arguments.dropFirst().first, ["status", "launch"].contains(action) else {
            emit(["error": "Invalid helper action."]); return
        }
        do {
            let (url, bundleID) = try validatedApplication()
            if action == "status" {
                let running = NSWorkspace.shared.runningApplications.contains { sameTarget($0, bundleID: bundleID, url: url) }
                emit(["running": running]); return
            }
            guard let target = argument("--target"), ["chatgpt", "codex"].contains(target),
                  let mode = argument("--mode"), ["auto", "application", "unified"].contains(mode),
                  let fullScreen = argument("--fullscreen"), ["true", "false"].contains(fullScreen) else {
                throw HelperFailure(message: "Invalid launch options.")
            }
            let application = try await openApplication(url: url, bundleID: bundleID, target: target, mode: mode)
            guard sameTarget(application, bundleID: bundleID, url: url) else {
                throw HelperFailure(message: "The launched application did not match the selected app.")
            }
            application.activate(options: [.activateIgnoringOtherApps])
            let warning = await setFullScreen(fullScreen == "true", application: application, bundleID: bundleID, url: url)
            emit(["ok": true, "pid": application.processIdentifier, "warning": warning ?? ""])
        } catch {
            emit(["error": (error as? HelperFailure)?.message ?? error.localizedDescription])
        }
    }
}
