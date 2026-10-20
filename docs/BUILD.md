# Build and release

## Toolchain

- Node.js 24 (minimum supported by this project: 22.12).
- pnpm 11.25.0, pinned in `package.json`; install dependencies with the committed lockfile.
- macOS: Xcode Command Line Tools, including Swift, lipo, codesign and iconutil.
- Windows: Windows PowerShell 5.1 and .NET, already supplied by supported Windows installations.

The application ships Electron, so users do not need Node, pnpm, Swift or a separate runtime.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build:native
pnpm qa
```

`pnpm run pack` creates an unpacked app for the current platform. `pnpm dist:mac` compiles a universal Swift helper and creates Apple Silicon and Intel DMG/ZIP artifacts. `pnpm dist:win` creates x64 NSIS and portable ZIP artifacts. Outputs are in `release/`.

Build Windows installers on Windows for release verification. Cross-building on macOS can create packages but cannot validate Windows window management, Store activation or installation.

## GitHub

This directory is the repository root. Upload its source contents, including `.github`, assets, native source, tests and `pnpm-lock.yaml`. Do not upload `node_modules`, `release`, local settings, test artifacts or signing credentials. The included `.gitignore` excludes generated outputs.

`.github/workflows/build.yml` runs static checks and pure tests, then builds on separate macOS and Windows runners. Windows PowerShell 5.1 parses the native helper before packaging. Artifacts are attached to the workflow run. Publishing a GitHub Release triggers the same build, then a separate job with repository-content write access attaches installers and SHA-256 checksums. The release tag must exactly match `v` plus the package version. A tag push alone does not publish a public GitHub Release.

After building, `pnpm verify:packages` compares packaged application sources and helpers against the current checkout and checks that QA mode markers did not enter production packages.

After testing downloaded artifacts, create a release and attach the appropriate installers, portable archives and checksums. For a local repository:

```sh
git init -b main
git add .
git commit -m "Build LaunchFX launch-animation studio"
# Create your GitHub repository, then add its actual URL:
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

`private: true` in package.json prevents accidental npm publication; it does not limit public GitHub source distribution.

## Signing

The local build does not include anyone's developer credentials. macOS artifacts are suitable for local evaluation; they are not Developer ID notarized. Windows artifacts are not Authenticode signed. Operating systems may show publisher or trust warnings.

For public macOS distribution, replace the default ad-hoc `mac.identity: "-"` with your own Developer ID identity and configure notarization credentials using electron-builder's supported environment variables. Keep them in encrypted CI secrets. Do not commit certificates or passwords. The entitlements file enables Electron's JIT.

Windows executable resource editing is enabled, so both the executable and installer have LaunchFX branding. For a signed Windows release, set `win.signExecutable: true` and configure your signing identity. The default build skips Authenticode signing.

## CLI

```sh
LaunchFX --launch=codex
LaunchFX --launch=chatgpt
LaunchFX --preview=singularity
LaunchFX --hidden
LaunchFX --qa
```

On macOS use `open -n -a LaunchFX --args --launch=codex` after installing. The extra instance forwards its arguments to the existing Electron instance, then exits. Concurrent launch effects are rejected rather than stacking full-screen overlays.

## Architecture

- `src/main`: Electron process, validated IPC, settings store, native-platform adapter.
- `src/renderer`: studio UI, overlay, local WebGL/Canvas effects.
- `src/shared/catalog.json`: bilingual effect metadata.
- `native/macos`: Swift app opening and target-specific AXFullScreen control.
- `native/windows`: PowerShell with Win32 window control and Store activation.
- `tests`: pure Node tests and browser visual QA page.

Renderer processes have no Node integration, use context isolation and sandboxing, and load packaged content through a restricted local protocol. Remote network requests are blocked. Native helpers receive validated structured data and never receive free-form shell code from the UI.

## Visual QA

Serve the project root locally and open `tests/visual-effects.html`. It renders every effect, reports shader errors and frame hashes, checks the final black frame, and supports a synthetic desktop fixture. FPS there measures that test surface, not every screen or machine.

Native application QA uses `--qa`, with isolated temporary settings. A packaged QA copy may contain `Contents/Resources/launchfx-qa.json` to activate the same guard; never ship that marker in the production artifact.
