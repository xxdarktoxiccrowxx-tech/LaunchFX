# Changelog

## 1.1.1 — 2026-10-20 · Playback timing fix

- Honor the selected duration in normal and reduced-motion modes. Reduced motion now uses a visible still scene with gentle fades, rather than a fixed 0.65-second near-black frame.
- Use a monotonic playback clock so dropped frames do not distort duration. Start timing after the renderer is ready.
- Remove the overlay before waiting for native app/window confirmation; renderer failures and timeouts cancel with an error instead of launching an unfinished scene.
- Pause studio rendering during previews and launches, retain the hero canvas, and resume it afterwards.
- Keep failed settings edits available for retry and block stale-setting launches until saving succeeds.
- Add duration, native-handoff, watchdog, readiness and settings-queue regression coverage.

### 中文

修复预览及启动时的短暂播放、黑屏停帧和时长失效。4 秒／10 秒设置在普通与减少动态模式下都按所选时长播放；优化后台渲染开销，并让保存失败可以重试。

## 1.1.0 — 2026-10-20 · Public preview

- Redesign all twelve WebGL and Canvas 2D effects around a recognizable focal form, restrained backgrounds and distinct entry, hold and handoff stages.
- Enlarge the black-hole silhouette; sharpen selected orbit tracks, star nodes, portal gates and highlights without adding particle clutter.
- Give the studio a larger hero, three recommended entry points, a complete searchable library and simpler launch controls.
- Complete English and Chinese interface labels, accessibility names, overlay copy and usage guides. New installations and resets follow system language; saved choices remain intact.
- Detect Windows unified clients only through matching protocol registration or Store metadata, preserve explicit direct-launch choices, and improve native launch feedback.
- Improve macOS window discovery and retry temporary accessibility failures.
- Add lifecycle, locale and Windows native-fixture checks; publish cross-platform installers and checksums through GitHub Actions.

This is the first public preview. Packages are not publisher-signed/notarized. Real ChatGPT/Codex handoff and native full-screen behavior still require target-version verification. See docs/VERIFICATION.md for tested coverage.

### 中文

十二款动画重新聚焦主体、减少视觉噪声；完善中英文、精选入口、统一版识别和启动反馈。此版本为首次公开预览，签名、公证和真实目标应用联动的验证范围见验证记录。

## 1.0.0 — Local prototype

Initial offline studio with twelve effects, independent profiles, previews, shortcuts, tray integration, optional desktop transitions and settings management. Built locally before the public repository was created.
