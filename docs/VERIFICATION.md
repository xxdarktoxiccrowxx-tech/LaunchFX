# Verification status

## Version 1.1.1 — duration and handoff fixes

Local source and browser checks were performed on 2026-10-20 on an Apple Silicon Mac. The production source is commit `029a750e3ab5e77269510d6143bce1dcc5601f51`. These results separate renderer timing, controller behavior, packaged UI operation and actual native integration.

- **44 of 45 Node tests passed locally; one Windows-only test was skipped on macOS.** Coverage includes full and reduced-motion duration, clock stalls, readiness and handoff lifecycle, background-rendering suspension, saving before launch, and recovery from a failed settings write. Mocked lifecycle/controller tests do not open native target applications.
- The browser fixture runs the actual overlay markup, module and WebGL renderer in Chrome, with IPC mocked. It reproduces the old reduced-motion defect: both 4-second and 10-second requests finish in roughly 0.7 seconds, with sampled black frames.
- With the fix, reduced motion retains the selected duration and displays a static scene with gentle fades. Full-motion previews also retain their selected duration. No corrected run completed at the one-second checkpoint, and no renderer errors were reported.

| Scene and mode | Requested | Before fix | After fix |
| --- | ---: | ---: | ---: |
| Singularity, reduced-motion preview | 4 s | 0.728 s | 4.004 s |
| Singularity, reduced-motion preview | 10 s | 0.697 s | 10.010 s |
| Singularity, full-motion preview | 4 s | Not measured | 4.017 s |
| Singularity, full-motion preview | 10 s | Not measured | 10.014 s |
| Aurora, full-motion mock launch | 4 s | Not measured | 4.156 s |
| Warp, full-motion mock launch | 10 s | Not measured | 10.002 s |

See [sanitized browser timing evidence](evidence/overlay-timing-1.1.1.json). These are renderer measurements, not real target-app handoff tests. Some full-motion runs included frame gaps of 100–399.9 ms, so this evidence does not establish uninterrupted rendering or a universal 60 FPS guarantee. An earlier 4-second run with frequent synchronous GPU readback measured 4.260 seconds; the final fixture samples only four pixel milestones and does not read the final frame before completion.

Packaged Apple Silicon Mac QA used an isolated copy with the same production source and temporary settings. Native overlay start/completion logs measured:

| Mode | Requested | Native elapsed |
| --- | ---: | ---: |
| Full motion (system preference) | 4 s | 4.080 s |
| Full motion (system preference) | 10 s | 10.015 s |
| Reduced motion (Always) | 4 s | 4.017 s |
| Reduced motion (Always) | 10 s | 10.016 s |

All four previews completed and returned to the studio; the 10-second full-motion preview remained visible and advanced beyond one second. See [native timing evidence](evidence/native-timing-1.1.1.json). No target app was opened and no permissions were changed. The production app installed in Applications opens as version 1.1.1 with the original user settings preserved byte-for-byte. The Mac app passes strict deep signature verification, and both Mac architectures plus the local Windows build passed package/source checks.

The [v1.1.1 release workflow](https://github.com/xxdarktoxiccrowxx-tech/LaunchFX/actions/runs/39506915951) completed successfully on 2026-10-20. Both native runners passed 44 of 45 tests with one other-platform test skipped and no failures. Windows passed the separate PowerShell 5.1 compatibility check. Both Mac architectures and Windows x64 passed package-source verification, and the publish job attached all six installers/archives plus SHA256SUMS.txt.

All six public download URLs responded without authentication. File sizes and ZIP/EXE headers were checked with ranged requests; all six checksum entries match the GitHub asset digests, and the checksum file matches its own digest. This was endpoint/range verification, not a full installer re-download or Windows installation test. See [public release evidence](evidence/public-release-1.1.1.json). Local build bytes can differ from CI builds; use each distribution's own checksum file.

## Historical version 1.1.0 checks

Version 1.1.0 local verification was performed on 2026-10-20 on an Apple Silicon Mac running macOS 27.2. The following observations belong to 1.1.0 unless explicitly marked 1.0.

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

The 1.1.0 UI corrections made a missing imported app path report “not found” and clarify multi-display thumbnail behavior. The 1.1.0 studio resumed its existing WebGL player after a preview rather than destroying the canvas context. Both automatic preview completion and Escape cancellation were rechecked in the packaged Mac QA app: the animated hero remains visible after returning to the studio.

## Not yet verified on real targets

- Actual ChatGPT / Codex launch, native full-screen/windowed handoff and app-version-specific unified routing.
- Granting macOS Accessibility or Screen Recording permissions, real screen transitions, login-item registration, global hotkey registration and everyday shortcut activation.
- Windows installation, Store activation, actual native window behavior, DPI/multiple monitors, and restoring previous window bounds.
- Runtime behavior on Intel Mac hardware.
- Public publisher signing, macOS notarization and Windows Authenticode signing.

QA mode deliberately prevents real target launches and system permission changes. The native launch code is implemented and packaged, but mocked tests and successful builds do not establish that every installed target version behaves identically.

## Evidence and release checklist

Render reports are in [WebGL evidence](evidence/visual-webgl.json) and [Canvas 2D evidence](evidence/visual-canvas2d.json). Desktop screenshots are in `docs/images/`. The public [GitHub Actions runs](https://github.com/xxdarktoxiccrowxx-tech/LaunchFX/actions) provide separate build evidence; a successful installer build is not a target-app interaction test.

## Historical v1.1.0 public preview build

The [v1.1.0 release workflow](https://github.com/xxdarktoxiccrowxx-tech/LaunchFX/actions/runs/39487259442) builds commit `a1d158bb3cf44602162fa263a8e43bf529fcf1b9` on native macOS and Windows runners. Both platform build jobs passed on 2026-10-20:

- Each platform passed 27 tests, with one test for the other operating system skipped. Windows executed the real PowerShell parser and compiled the Win32 declarations, then checked unified-client metadata using synthetic fixtures. It did not open ChatGPT or Codex.
- Windows PowerShell 5.1 compatibility parsing passed separately.
- Both macOS architectures and Windows x64 passed package-source, icon, native-helper and production-mode checks. The Windows verifier now uses native path separators for the archive API; its initial CI failure was in the verifier, not a missing packaged source file.
- The release contains Mac arm64/x64 DMG and ZIP packages, Windows x64 NSIS and ZIP packages, and SHA-256 checksums. All six public download endpoints responded successfully; the checksum file matches the six GitHub asset SHA-256 digests. See [public download evidence](evidence/public-release.json). These are CI builds; local rebuilds can differ in bytes. Match downloads against the release's own checksum file.

Before promoting this public preview to a stable release, run the produced app on both operating systems with the installed target apps. Check cold and already-running launches, animation off/fullscreen on and animation on/fullscreen off, skip/cancel, Store installations, two displays, reduced motion, denied/granted permissions, shortcuts while the studio is in the tray, and login startup. Sign and notarize the release with the maintainer's credentials.
