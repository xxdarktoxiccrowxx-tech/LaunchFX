# LaunchFX implementation contract

An offline Electron desktop app for ChatGPT / Codex launch animations. Renderer sandboxed; local assets only. Native helpers may control the selected target window only after the user launches it. QA mode must never launch target applications, capture the desktop, request permissions, register global shortcuts, or change login items.

## Ownership

- Main/backend agent: `src/main/**`, `native/**`, backend tests under `tests/`, `scripts/build-native.mjs`.
- Effects agent: `src/renderer/effects/**` and `assets/posters/**`.
- Studio UI agent: `src/renderer/index.html`, `studio.js`, `studio.css`, `overlay.html`, `overlay.js`, `overlay.css`.
- Root: shared catalog, package/build config, artwork, docs, CI, integration and packaging.

## Catalog

`src/shared/catalog.json` is an array of `{id,name,nameEn,description,descriptionEn,category,accent}`. IDs:
`singularity, quantum, aurora, warp, matrix, portal, eclipse, nebula, ripple, orbit, ink, constellation`.

## Renderer effects API

`import { EffectPlayer } from './effects/engine.js'`

`new EffectPlayer(canvas, {effectId,quality:'auto'|'high'|'eco',intensity:0.75,accent:'#86a8ff',seed:42})`

- `resize()`
- `render(timeSeconds,progress0to1)`; starts clean, visually climaxes around 0.5, fades to black at 1
- `setEffect(effectId)`
- `setOptions({quality,intensity,accent,seed})`
- `setDesktopImage(dataUrl): Promise<boolean>` optional in-memory texture only
- `destroy()`
- `supported` boolean, `error` optional string

Rendering loop is owned by the UI. Preview tiles should use static frames; only hero/hover preview animates. Stop frames when document hidden. Avoid more than three live GL contexts. Provide a canvas fallback if WebGL unavailable.

## Settings

```json
{
  "schemaVersion":1,
  "language":"zh",
  "profiles":{
    "chatgpt":{"enabled":true,"fullscreen":false,"effectId":"aurora","duration":4.5,"random":false,"appPath":"","launchMode":"auto"},
    "codex":{"enabled":true,"fullscreen":true,"effectId":"singularity","duration":6,"random":false,"appPath":"","launchMode":"auto"}
  },
  "favorites":["singularity","aurora","warp"],
  "quality":"auto",
  "fpsLimit":60,
  "intensity":0.75,
  "accent":"#86a8ff",
  "sound":false,
  "volume":0.2,
  "desktopCapture":false,
  "reduceMotion":"system",
  "display":"cursor",
  "runAtLogin":false,
  "minimizeToTray":true,
  "skipIfRunning":false,
  "hotkeys":false,
  "defaultTarget":"codex"
}
```

`fullscreen=false` explicitly requests a normal window. macOS uses native AXFullScreen (requires Accessibility); Windows uses target-only borderless fullscreen with window-style restoration. Do not send global toggle keys.

`launchMode`: auto detects native Codex vs unified ChatGPT; application opens selected app normally; unified uses `codex://new?mode=chat|codex` pinned to selected app. Never execute a shell command from imported settings.

## Preload bridge: window.launchfx

All methods return promises; errors reject with user-readable messages.

- `getState()` → `{settings,catalog,platform,version,qa,capabilities:{screenCaptureStatus,accessibilityTrusted,nativeHelperAvailable},apps:[{id,detectedPath,installed}],displays:[{id,label,primary}]}`
- `saveSettings(patch)` → normalized settings. Merge deeply; validate before write. Apply OS login/hotkey changes only from an explicit relevant patch, not import.
- `launch(targetId)` → `{ok:true}` (actual launch lifecycle sent through event)
- `preview({targetId,effectId?})` → `{ok:true}`; always synthetic, no capture and no target launch
- `chooseApp(targetId)` → `{path?,cancelled}`; update profile path when chosen
- `createShortcut(targetId)` → `{path,manualPinNote}`
- `exportSettings()` / `importSettings()` → `{ok?,cancelled?}`; import returns new settings too if convenient
- `resetSettings()` → `{settings?,cancelled?}`; native confirm, backup old config
- `openDataFolder()` → `{ok:true}`
- `requestPermission('accessibility'|'screen')` → `{ok:true}`; only explicit UI button invokes
- `onStateChanged(handler)` → unsubscribe; payload new getState-shaped object
- `onLaunchStatus(handler)` → unsubscribe; payload `{phase:'playing'|'opening'|'done'|'error'|'cancelled',message?,targetId?}`
- `overlayConfig()` → overlay-only `{effectId,targetName,targetId,duration,intensity,quality,accent,seed,desktopImage:null|string,preview,reducedMotion,sound,volume,fpsLimit}`
- `finishOverlay('finish'|'skip'|'cancel')` → `{ok:true}`; only own active overlay sender accepted

## Lifecycle

One overlay at a time. `--launch=codex|chatgpt` allows shortcuts; `--preview=effectId` never launches target. `--qa` uses a temporary/separate settings directory, disables all external effects above, but permits preview/settings for UI QA. `--hidden` startup stays in tray. Single-instance second-instance args processed safely.

Overlay is opaque and full display bounds, with selected display (`cursor`, `primary`, or display ID), skip Esc, cancel X. Begin native target launch only after effect completion (safe cancellation). Bounded launch/helper waits; always close overlay on failure and report actionable error in studio. Animation disabled still applies target fullscreen choice. Captured image only in memory, never logs/export/disk; explicit setting off by default. Never capture in preview.

UI: default Chinese, English option; sophisticated dark studio with silver/indigo hero, 12 distinct thumbnail cards, favorites/search, per-target animation/fullscreen/random/duration, live preview vs launch clearly differentiated, advanced settings/permissions/shortcuts/import/export/reset, toast errors, keyboard-accessible controls, responsive >=900px. Settings autosave with visible feedback. No external CDN/fonts.

Packaging: Electron/electron-builder, macOS arm64/x64 app/DMG/ZIP, Windows x64 NSIS/ZIP. GitHub Actions builds on native runners. Windows runtime helper PowerShell + built-in .NET, no external compiler required at runtime. macOS Swift helper compiled during build. Source under MIT; original app name/logo not copied.
