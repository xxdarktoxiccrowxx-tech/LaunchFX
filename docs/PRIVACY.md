# Privacy and permissions

LaunchFX runs locally. It has no account, analytics, advertising, cloud storage or remote effect downloads. The renderer's HTTP, HTTPS and WebSocket requests are blocked.

Normal launch effects use generated imagery. Optional desktop transitions obtain screen thumbnails immediately before a real launch and select the configured display. Only that display's frame is passed through the app's local process boundary into a GPU texture; the other thumbnails are discarded. Images are released afterward and are never deliberately written to disk, logged or uploaded. Preview and QA modes do not read the real screen.

macOS Accessibility is used to read and set only the selected target's window full-screen state. It is not used to read chat content. macOS Screen Recording permission is separate and used only for the optional desktop image. Users grant permissions themselves with explicit controls.

Settings contain preferences and optional local application paths. Exported JSON can therefore contain paths; review it before sharing. Imports validate values and preserve current desktop-capture, login and global-shortcut choices. Diagnostic logs rotate at a small size and avoid image or chat content.

LaunchFX does not modify OpenAI app bundles, intercept their network traffic or collect credentials. Uninstalling LaunchFX does not uninstall ChatGPT or Codex.
