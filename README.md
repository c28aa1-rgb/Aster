# Aster

Aster is a compact macOS browser shell built with Electron, React, and Framer Motion. It uses Electron's Chromium runtime for real web browsing and supports Chrome Web Store and unpacked Chromium extensions.

## Run locally

```bash
npm install
npm run dev
```

## Build the macOS app

```bash
npm run dist
```

The packaged `.dmg` and `.zip` are written to `artifacts/` (`dist/` is reserved for the renderer build).

For the DMG install, drag `Aster.app` out of the mounted image to your **Desktop**, then open **Install Aster.html** for step-by-step Terminal instructions. The guide has a copy button for this command prefix:

```bash
xattr -dr com.apple.quarantine
```

The guide's copy button includes the needed space after `quarantine`. After pasting the command into Terminal, drag the Desktop copy of `Aster.app` into Terminal so macOS fills in the exact app path, then press Return. If Terminal reports “Operation not permitted,” enable Terminal's **Desktop Folder** access in **System Settings → Privacy & Security → Files & Folders**, reopen Terminal, and rerun it. Removing quarantine weakens macOS's downloaded-app protection; only do this for an Aster download you trust. The ZIP remains unchanged.

## Releasing updates

Pushing a `v*` tag to the GitHub repository builds and publishes a macOS release from `.github/workflows/release.yml`. Send people the repository's **Releases** page link; each release contains the `.dmg` and `.zip` downloads. `GITHUB_TOKEN` is provided by GitHub Actions. Keep the repository's GitHub owner/name stable if you use in-app updates.

Code-signing is optional for a downloadable build, but macOS will show stronger security warnings for unsigned apps. For signed/notarized distribution and reliable in-app updates, configure `CSC_LINK` (base64-encoded Developer ID Application `.p12`) and `CSC_KEY_PASSWORD` as repository Actions secrets, plus the Apple notarization credentials described in electron-builder's documentation.

For example, after setting the real GitHub `origin` and adding the signing secrets:

```bash
git tag v0.4.2
git push origin v0.4.2
```

When signing is configured, the app checks shortly after launch, downloads updates in the background, and offers to restart when one is ready. macOS requires signing for that update path. Since earlier Aster builds were unsigned, current users must install a signed release manually once before in-app updates can work.

Searches from the address bar and new-tab page use Google by default. Aster's browser engine remains Electron's bundled Chromium; it is not Google's proprietary Chrome distribution.

## Extensions

Open the puzzle icon in the toolbar. Choose **Chrome Web Store**, open an extension, and use the store's **Add to Chrome** button. Aster shows a native permission confirmation before downloading and installing it, restores it on launch, and checks for updates automatically.

To use an extension's toolbar interface, open the puzzle icon and choose **Pin** beside an extension that provides a toolbar action. Its icon appears next to the puzzle button. Click the pinned icon to open the extension popup; click it again or click outside the popup to close it. Links opened by the popup—including `chrome.tabs.create` and `_blank` links—are handed off to a normal Aster tab and dismiss the popup.

For local development extensions, choose **Load unpacked** and select a folder containing `manifest.json`.

Aster adds action popups and common `chrome.tabs`, `chrome.runtime`, `chrome.storage`, cookies, context-menu, notification, and navigation APIs through `electron-chrome-extensions`. Electron still does not implement every proprietary Chrome extension API, so individual extensions may have compatibility limitations. Chrome Web Store installation requires Manifest V3.

### VPN extensions

Aster supports the Chromium `chrome.proxy` API for direct, system, auto-detect, fixed-server, and PAC configurations, plus authenticated proxy challenges from Manifest V3 extension workers. The proxy applies to Aster's browser session only; it does not change the macOS system proxy.

Urban VPN has been exercised from Chrome Web Store installation through consent, connection, authenticated proxy selection, and a successful tab navigation. VPN services can still fail when their own endpoints or selected proxy servers are unavailable. Disconnect the extension before removing it when practical; unloading the controlling extension also restores the session proxy.

Opening Extensions or History is temporary browser chrome. Creating, switching, or closing a tab—including with `+` or `⌘T`—dismisses that panel and returns to the selected web tab.

## Keyboard shortcuts

- `⌘L` focuses the address field
- `⌘T` opens a tab
- `⌘W` closes the active tab
- `⌘R` reloads
- `⌘[` / `⌘]` go back and forward

## License

Aster is distributed under GPL-3.0 because its Chrome-compatible action popup and extension API layer uses the GPL-licensed `electron-chrome-extensions` package. A proprietary distribution requires that package's separate commercial license.
