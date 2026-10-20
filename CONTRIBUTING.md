# Contributing

Use Node 24 and the committed pnpm lockfile. Run `pnpm check` and `pnpm test` before opening a pull request. Preview changes with `pnpm qa`, which cannot open target apps or change system integrations.

For a new effect, update the bilingual catalog, add a distinct shader and Canvas fallback, and verify it with the visual QA page. Keep the total GPU context count bounded, honor reduced motion, release textures, and make the final frame black for a clean handoff.

For launch or window changes, test only against a disposable test app until reviewed. Preserve exact target identification and bounded timeouts. Do not use global full-screen keyboard shortcuts, modify application bundles, or introduce network access to the renderer.

Include operating system, architecture, reproduction steps, expected behavior and relevant redacted errors in bug reports. Do not attach real desktop screenshots, exported settings or logs without checking them for personal information.
