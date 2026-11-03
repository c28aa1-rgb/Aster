# Aster

A compact macOS browser built with Electron, React, and Framer Motion. Aster uses Electron’s Chromium engine for browsing and supports Chrome Web Store and local Chromium extensions.

[Download Aster](https://github.com/c28aa1-rgb/Aster/releases/latest) · [Release history](https://github.com/c28aa1-rgb/Aster/releases)

The latest published build is **0.4.17**, with downloads for **Apple Silicon Macs (arm64)**. The features marked **upcoming** below are prepared locally and have not yet been published in a release or added to the GitHub source.

## Available in the current release

- Tabs with mute controls, bookmarks, and a bookmarks bar.
- Saved browsing history and address suggestions from history and Google. Live Google suggestions can be turned off in Settings.
- Previous tabs restored when reopening the app.
- A download list with progress, cancellation, and links to saved files.
- Dark mode and controls for clearing history, cookies, cache, and site data.
- A new-tab page with a clock, Google search, and editable site shortcuts.
- Chrome Web Store installation, pinned extension buttons, and local extension loading.
- In-page navigation errors with the failed address and a retry link.
- Separate controls for macOS window fullscreen and hiding the tabs, toolbar, and bookmarks.
- GitHub update checks while the app is open, plus support for required-update downloads.

Searches use Google by default. Aster uses Chromium, but it is not Google Chrome; extension and website compatibility can differ.

## Install on macOS

1. Download the regular `Aster-<version>-arm64.dmg` from the [latest release](https://github.com/c28aa1-rgb/Aster/releases/latest).
2. Open the DMG and drag **Aster.app** to your **Desktop**.
3. Open **Install Aster.html** in the image for the launch instructions.

The releases are unsigned. Only follow the guide’s quarantine-removal instructions for an Aster download you trust. The guide’s copy button supplies this prefix, including its trailing space:

```text
xattr -dr com.apple.quarantine
```

Paste it into Terminal, drag the Desktop copy of `Aster.app` into Terminal to append its path, then press Return. This removes macOS’s quarantine flag from that app; it does not sign or notarize it.

If Terminal reports **Operation not permitted**, check Terminal’s Desktop Folder access under **System Settings → Privacy & Security → Files & Folders**, then reopen Terminal and retry. A ZIP download is also provided.

## Updating Aster

Aster checks GitHub releases shortly after launch and every 15 minutes. When the app regains focus, it also checks if the previous check was at least five minutes ago. You can check manually from Settings.

When an update is available, open its toolbar button to see the release notes and choose **Download update**. Aster downloads the matching `Aster-Update-<version>-<arch>.dmg` into Downloads, opens it, and closes the browser. Drag the new app to the Desktop and choose **Replace**.

The update DMG contains the app and replacement instructions; the regular installer keeps the first-launch guide. If the update image cannot open, Aster stays open and offers **Open downloaded update**. Missing files can be downloaded again.

### Required updates and extension policy

Aster 0.4.17 and later read [`extension-policy.json`](extension-policy.json) from this repository’s `main` branch:

```json
{
  "disableExtensions": false,
  "minimumVersion": null
}
```

- `minimumVersion: null` leaves updates optional. To require a later version, first publish that release and its matching update DMG, then set `minimumVersion` to its version string, such as `"0.4.18"`. Supported older builds automatically download a release at or above that minimum. Replacing the installed app remains a manual step.
- `disableExtensions: true` disables extensions without deleting their installed files. To restore them, set it back to `false` and restart Aster.

Builds older than 0.4.17 do not understand the minimum-version setting. Required updates also need a working connection to GitHub and an available update asset for the Mac’s architecture.

## Fullscreen and tabs

Right-click the tab bar to find **Full screen** and **Hide tabs and toolbar**. Window fullscreen can keep browser controls visible; hiding the controls gives the website the entire window.

Use **F11** to toggle browser controls, or **fn + F11** when the Mac keyboard requires it. **Escape** restores hidden controls. Fullscreen video also hides the browser controls while active.

Mute a tab using its speaker control. Bookmarks appear below the address bar; history, downloads, extensions, and Settings open from the toolbar.

## Extensions

Open the puzzle icon, choose **Chrome Web Store**, and install an extension with **Add to Chrome**. Aster displays the requested permissions before installing it. Store extensions load again on launch and are checked for updates automatically. Store installation requires Manifest V3.

Choose **Pin** beside an extension to put its button on the toolbar. Click the button to open its popup; click again or outside the popup to close it. Links opened by extensions are handed off to browser tabs. **Load unpacked** loads a local folder containing `manifest.json`.

Extension support comes from `electron-chrome-extensions` and Aster’s integration code. Electron does not implement every Chrome extension API, so installation alone does not guarantee that every extension feature works.

VPN extensions configure Aster’s browser-session proxy, without changing the macOS system proxy. Their servers can be unavailable or blocked by the current network. Disconnect the VPN before removing it when practical; unloading the controlling extension restores the session proxy.

## Upcoming features — not yet published

These changes are implemented in the local development workspace. They are **not included in the current GitHub download or source checkout**:

- **Custom new-tab pages:** local wallpapers, Auto/Dawn/Midnight/Fern themes, a custom heading, and date/clock controls.
- **Split-screen browsing:** two tabs side by side, a resizable divider, pane swapping, and navigation tied to the focused pane.
- **Floating video:** a toolbar action for native picture-in-picture, where permitted by the website.
- **Optional Momentum installation:** a Settings link to its official Chrome Web Store page and support for new-tab extension overrides. Momentum’s onboarding has been tested; its full dashboard compatibility is not verified.
- **Version-only reporting:** automatic daily check-ins containing only the app version, disclosed in Settings. No device names, device identifiers, OS details, or browsing data are included. The service counts daily version activity, not exact unique users.
- **Proxy authentication improvements:** handling actual login challenges and refreshed credentials instead of relying on prefetched credentials.

A new release is needed before existing installations receive these changes.

## Run locally

Use **Node.js 22**, matching the release workflow, and npm. From this repository’s folder:

```bash
npm ci
npm run dev
```

This starts Vite at `http://127.0.0.1:5187` and launches Electron. Quit an installed copy of Aster before starting development to avoid opening the same browser profile in two processes. Aster’s desktop features require Electron; opening the Vite address in another browser is only a UI preview.

If npm fails with `EPERM: process.cwd`, check Terminal’s access to the project’s Desktop folder, reopen Terminal, and enter the project directory again.

### Build and check

```bash
npm run build
npm run dist
```

`build` creates the renderer and bundled preload/new-tab scripts. `dist` also packages the regular macOS installer and ZIP. Output goes into `artifacts/`; `dist/` is reserved for the renderer build.

To build both the regular installer and the separate update DMG locally:

```bash
npm run release
```

Focused checks available in the published source include:

```bash
npm run test:navigation-input
npm run test:update-release
npm run test:new-tab
npm run test:appearance
npm run test:browser-navigation
```

Electron checks launch test browser processes; run them on macOS with a graphical session.

## Publish a release

The [release workflow](.github/workflows/release.yml) runs when a `v*` tag is pushed. The tag must match `package.json`. It installs dependencies, builds the macOS artifacts, and publishes one release with the regular DMG, update DMG, ZIP, blockmaps, and update metadata.

1. Bump the version in `package.json` and `package-lock.json`, for example with `npm version patch --no-git-tag-version`.
2. Update `.github/release-notes.md` and this README’s release status, run the relevant checks, and commit the reviewed release changes.
3. Tag that commit and push the branch and tag:

```bash
ASTER_RELEASE_TAG="v$(node -p "require('./package.json').version")"
git tag "$ASTER_RELEASE_TAG"
git push origin main "$ASTER_RELEASE_TAG"
```

GitHub Actions supplies `GITHUB_TOKEN`. Signing is disabled unless configured deliberately. Aster’s updater ignores draft and prerelease releases and requires the architecture-specific update DMG. Keep the repository owner/name stable for update and policy checks.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘L` | Focus the address bar |
| `⌘T` | Open a new tab |
| `⌘W` | Close the active tab |
| `⌘R` | Reload |
| `⌘⇧R` | Reload without cache |
| `⌘[` / `⌘]` | Go back / forward |
| `F11` or `fn + F11` | Hide or show browser controls |
| `Escape` | Restore hidden browser controls |

## License

Aster is distributed under GPL-3.0 because its Chrome-compatible action popup and extension API layer uses the GPL-licensed `electron-chrome-extensions` package. A proprietary distribution requires that package’s separate commercial license. See [LICENSE](LICENSE).
