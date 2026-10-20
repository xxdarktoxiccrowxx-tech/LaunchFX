# Verification status

Version 1.1.0 local verification performed on 2026-10-20, on an Apple Silicon Mac running macOS 27.2. Historical 1.0 checks are identified explicitly. These results separate source tests, real rendering, packaged UI operation and native integration coverage.

## Passed

- Syntax and catalog validation: all JavaScript parses; 12 distinct catalog IDs.
- **27 passing Node tests and one Windows-only test skipped on macOS**: isolated settings persistence and corruption recovery, value validation, separate profiles, random favorites, CLI arguments, IPC sender rejection, preview isolation, cancellation, duplicate completion, native error cleanup, animations disabled with fullscreen off, QA guards, Mac shortcut forwarding and quiet login startup. Native OS calls are mocked in lifecycle tests.
- **12/12 WebGL render checks**: shaders compile, all frames contain rendered imagery, all 12 frame hashes differ, entry/hold/handoff frames remain visible and distinct, and every effect finishes on black.
- **12/12 forced Canvas 2D checks**: fallback effects render distinct images and finish on black.
- Synthetic desktop texture successfully loads and visibly distorts in Singularity. No real desktop image was read.
- The browser preview showed approximately 59–60 FPS at its tested dimensions. This is not a full-screen performance guarantee.
- Packaged arm64 Mac QA application opens with hardened runtime and ad-hoc signing; studio, search, effect selection, favorites, independent animation/fullscreen settings, Chinese/English, Eco quality, preview completion, Escape cancellation and configuration reset were exercised.
- The 1.1 packaged app was rechecked in Chinese and English: three recommended entries, all twelve effects, English search, Quantum selection, English full-screen preview, Escape cancellation and automatic completion. The hero remained visible after both returns, and English plus the selected effect survived quitting and reopening.
- In the 1.0 local prototype, preferences survived quitting and reopening the packaged app, and reset restored its Chinese defaults. In 1.1, automated tests verify that first-run/reset language follows the system locale, saved choices remain intact, and Codex defaults to enabled animation/fullscreen.
- Universal Swift helper compiled with arm64 and x86_64 slices. Both Mac app bundles pass strict, deep code-signature verification.
- Mac arm64 / x64 DMG and ZIP packages and Windows x64 NSIS / ZIP packages were produced. Package verification compares bundled source, icons and native helpers with the checkout and rejects a shipped QA marker.

The final UI corrections make a missing imported app path report “not found” and clarify multi-display thumbnail behavior. The studio now resumes its existing WebGL player after a preview rather than destroying the canvas context. Both automatic preview completion and Escape cancellation were rechecked in the packaged Mac QA app: the animated hero remains visible after returning to the studio.

## Not yet verified on real targets

- Actual ChatGPT / Codex launch, native full-screen/windowed handoff and app-version-specific unified routing.
- Granting macOS Accessibility or Screen Recording permissions, real screen transitions, login-item registration, global hotkey registration and everyday shortcut activation.
- Windows installation, Store activation, actual native window behavior, DPI/multiple monitors, and restoring previous window bounds.
- Runtime behavior on Intel Mac hardware.
- Public publisher signing, macOS notarization and Windows Authenticode signing.

QA mode deliberately prevents real target launches and system permission changes. The native launch code is implemented and packaged, but mocked tests and successful builds do not establish that every installed target version behaves identically.

## Evidence and release checklist

Render reports are in [WebGL evidence](evidence/visual-webgl.json) and [Canvas 2D evidence](evidence/visual-canvas2d.json). Desktop screenshots are in `docs/images/`. The public [GitHub Actions runs](https://github.com/xxdarktoxiccrowxx-tech/LaunchFX/actions) provide separate build evidence; a successful installer build is not a target-app interaction test.

Before a public release, run the produced app on both operating systems with the installed target apps. Check cold and already-running launches, animation off/fullscreen on and animation on/fullscreen off, skip/cancel, Store installations, two displays, reduced motion, denied/granted permissions, shortcuts while the studio is in the tray, and login startup. Sign and notarize the release with the maintainer's credentials.
