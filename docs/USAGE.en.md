# Using LaunchFX

[English README](../README.en.md) · [中文使用指南](USAGE.zh.md) · [Releases](https://github.com/xxdarktoxiccrowxx-tech/LaunchFX/releases)

LaunchFX plays an opening animation before launching your installed ChatGPT or Codex app. It works through its own launch button, shortcuts, menu, and optional keyboard shortcuts. The original app icons keep their normal behavior.

## Install and choose a language

On macOS, drag LaunchFX from the disk image into Applications. On Windows, run the installer, or extract the entire portable ZIP and open `LaunchFX.exe`. Keep the app in that location before creating launch shortcuts.

Current packages are not publisher-verified releases: macOS builds are ad-hoc signed and not notarized, and Windows builds are unsigned. Download from this repository's [release page](https://github.com/xxdarktoxiccrowxx-tech/LaunchFX/releases) and check available checksums. Your operating system may show a security warning. Keep system protections enabled; build from source if you prefer to inspect and compile the app yourself. See [verification status](VERIFICATION.md) before relying on a platform-specific behavior.

For a new configuration, LaunchFX chooses Chinese when the system language is Chinese and English otherwise. Click **English** or **中文** at the top right to change it. Existing saved language choices are preserved.

## Choose an opening scene

The Effects page starts with three recommended scenes:

- **Singularity:** a black hole with a gravitational pull, especially effective with desktop transitions.
- **Aurora:** soft ribbons of light for a quieter entrance.
- **Warp Drive:** a passage through starlight.

Choose **Browse all 12 effects**, a category, or the search box to explore the whole library. Search matches English and Chinese names and descriptions. Click a card to select it for the currently selected app. Click the heart to add it to Favorites.

**Preview effect** plays the scene full screen and then returns to the studio. A preview never launches ChatGPT/Codex, captures the screen, or plays sound. Escape and × both close the preview.

## Set up ChatGPT and Codex separately

Use the ChatGPT/Codex tabs in **Launch settings**. Each profile remembers its own effect and options.

| Control | Behavior |
| --- | --- |
| Play animation | On: play the selected effect before opening the app. Off: open the app directly and still apply its window setting. |
| Open full screen | On: request native full screen on macOS or borderless full screen on Windows. Off: request a regular window. |
| Duration | Set the effect length from 1.5 to 15 seconds in half-second increments. |
| More launch options → Shuffle favorites | Pick a new effect from Favorites. With no favorites, use the whole library. |

Codex defaults to full screen; ChatGPT defaults to a regular window. Changing one profile does not change the other. Settings save automatically.

Click **Launch ChatGPT** or **Launch Codex** for a real launch. During the animation, Escape skips to the app; × cancels the launch. Once the effect has finished and handoff has begun, the target app may already be opening.

## Find your installed apps

If the panel says **Locate your installed app**, click it to select the app. You can also use **Settings → Apps & shortcuts** to inspect detection, choose a `.app` on macOS or `.exe` on Windows, or return to auto-detection.

Under **How to open**:

- **Automatic** works for most installations.
- **Open app directly** opens the selected application without selecting a unified-client mode.
- **Unified ChatGPT / Codex app** uses the selected client's `codex://new?mode=chat` or `codex://new?mode=codex` link. It requires a client that supports those routes; the routes can change with client updates.

On Windows, Automatic recognizes a unified client only when its exact protocol registration or Store manifest confirms support. If automatic detection cannot verify it, choose the installed client `.exe` for the Codex profile and select **Unified ChatGPT / Codex app** explicitly. Use **Open app directly** for a standalone client.

ChatGPT and Codex are installed separately from LaunchFX. LaunchFX does not modify them, provide an account, or bypass their access requirements.

## Make it your everyday launcher

Choose **Create launch shortcut** in the profile panel or Settings.

- **macOS:** a `ChatGPT — LaunchFX.app` or `Codex — LaunchFX.app` launcher appears on the desktop. Drag it into the Dock to use it as your normal entry point.
- **Windows:** a desktop `.lnk` shortcut is created. Use it directly, or pin it through the options your Windows version offers.
- **Menu bar / system tray:** open either target from the LaunchFX menu.
- **Global keyboard shortcuts:** enable them in Settings to use `⌘ + Alt + 1/2` on macOS or `Ctrl + Alt + 1/2` on Windows. `1` opens ChatGPT; `2` opens Codex.

Shortcuts point to the installed copy of LaunchFX. Recreate them if you move that copy. Closing the studio normally leaves LaunchFX in the menu bar or tray; choose Quit from its menu to exit completely. **Launch at login** is optional and starts only LaunchFX quietly, without opening a target app.

## Bring your desktop into the black hole

Select Singularity, then enable **Settings → Immersion → Bring your desktop into the effect**. On macOS, allow Screen Recording in **Settings → System permissions**; restarting LaunchFX may be necessary after a permission change.

Before a real launch, LaunchFX obtains screen thumbnails and uses the selected screen's image as a temporary texture. Other thumbnails are discarded. The image is kept in memory only and released after playback; it is never written to a file or uploaded. Preview always uses a synthetic scene.

If permission is unavailable or capture fails, the animation still plays using a synthetic scene. Different effects blend the desktop differently; Singularity emphasizes the inward warp.

**Full-screen control** and **Desktop transitions** use different macOS permissions. Accessibility controls the target window. Screen Recording supplies the desktop image. Enabling either setting does not grant a permission automatically.

## Performance, sound, and accessibility

Under **Appearance & performance**, choose Balanced, High, or Eco quality, and a 30, 60, or 120 FPS limit. These are caps, not promised frame rates. Actual performance depends on your GPU, display size, and other running apps. Eco with 30 FPS is a useful battery-saving option.

Motion intensity changes the effect's strength. Accent color changes its lighting while each scene keeps its visual character. Display selection can follow the pointer, use the main display, or use a specific connected display.

**Reduce motion** can follow the system, remain on, or always play the full animation. Reduced motion keeps the studio preview still and uses a static scene with gentle fades during launch. It preserves your selected duration: 4 seconds and 10 seconds remain different lengths. When reduced motion is active, a hint appears beside Duration. The studio pauses background rendering while a launch or preview is running, then resumes afterward.

**Play a launch sound** is off by default. When enabled, a soft ambient sound is generated locally for real launches. Volume is separate. Safe previews remain silent.

You can navigate with the keyboard. `⌘/Ctrl + F` focuses effect search, and `⌘/Ctrl + ,` opens Settings. Visible focus outlines mark the active control.

## Save, move, and reset your setup

Settings save automatically. If a write fails, **Not saved** and **Retry save** appear at the top. Launch and preview wait for a successful save instead of using old settings. Retry, or change another setting, to save all outstanding changes.

Changes save automatically. **Settings → Settings & data** lets you export or import a JSON file, open the data folder, or reset your configuration. Reset asks for confirmation and preserves a backup.

Imports validate settings and do not newly enable login startup, global shortcuts, or desktop access. App paths may need to be selected again on another computer. If a configuration becomes unreadable, LaunchFX backs it up and falls back to defaults, with a visible notice.

The data folder contains settings and limited diagnostics. LaunchFX does not store desktop images, chat content, or account information. See [Privacy](PRIVACY.md) for details.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| The app opens without an effect | Open it through LaunchFX or its shortcut. Enable Play animation. Check whether Skip if app is already open is enabled. |
| The app does not enter full screen | On macOS, allow Accessibility and refresh the permission status. On Windows, check whether the target app runs with higher privileges. |
| LaunchFX cannot find the app | Choose the installed `.app` or `.exe` manually. Check the standalone/unified-client opening mode. |
| The black hole does not use the real desktop | Enable desktop transitions, grant Screen Recording on macOS, and restart LaunchFX if needed. Previews deliberately use synthetic imagery. |
| Playback is slow | Try Eco quality or 30 FPS and close other GPU-heavy programs. |
| A global shortcut does not work | Another app may own that key combination. Use the menu or a desktop shortcut, and check the displayed diagnostic. |
| A created shortcut stops working | LaunchFX may have moved. Create the shortcut again from its new location. |

Current testing does not establish real target handoff or permission behavior on every OS/client combination. Report a reproducible issue with versions and steps in [GitHub Issues](https://github.com/xxdarktoxiccrowxx-tech/LaunchFX/issues). Avoid attaching private desktop images or chat contents.

To uninstall, turn off login startup and global shortcuts, quit LaunchFX, remove the application and any shortcuts you created. You can keep the data folder for a future reinstall or delete it yourself.
