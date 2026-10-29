const { app, BrowserWindow, session } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { installExtension, uninstallExtension } = require("electron-chrome-web-store");

const extensionId = process.env.TEST_EXTENSION_ID || "majdfhpaihoncoakbjgbdhglocklcgno";
const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), "aster-reinstall-"));
const extensionsPath = path.join(profilePath, "Extensions");
app.setPath("userData", profilePath);

function timeout(ms, operation) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`${operation} timed out`)), ms));
}

async function withTimeout(operation, promise) {
  return Promise.race([promise, timeout(60000, operation)]);
}

app.whenReady().then(async () => {
  let popupWindow;
  try {
    const browserSession = session.defaultSession;
    const first = await withTimeout("first install", installExtension(extensionId, { session: browserSession, extensionsPath }));
    if (first.id !== extensionId) throw new Error(`First install returned ${first.id}`);
    await withTimeout("uninstall", uninstallExtension(extensionId, { session: browserSession, extensionsPath }));
    if (browserSession.extensions.getExtension(extensionId)) throw new Error("Extension remained loaded after uninstall");
    if (fs.existsSync(path.join(extensionsPath, extensionId))) throw new Error("Extension files remained after uninstall");
    const second = await withTimeout("reinstall", installExtension(extensionId, { session: browserSession, extensionsPath }));
    if (second.id !== extensionId || !browserSession.extensions.getExtension(extensionId)) {
      throw new Error(`Reinstall did not load ${extensionId}`);
    }
    const popupPath = second.manifest.action?.default_popup || second.manifest.browser_action?.default_popup;
    if (!popupPath) throw new Error("Reinstalled extension has no HTML popup to verify");
    popupWindow = new BrowserWindow({ show: false, webPreferences: { session: browserSession, sandbox: true } });
    const popupUrl = new URL(popupPath, `chrome-extension://${extensionId}/`).href;
    await withTimeout("reinstalled popup", popupWindow.loadURL(popupUrl));
    if (popupWindow.webContents.getURL() !== popupUrl) throw new Error("Reinstalled popup did not open its HTML page");
    console.log(`WEB_STORE_REINSTALL_OK ${JSON.stringify({ id: second.id, version: second.version, popupUrl })}`);
    popupWindow.destroy();
    app.exit(0);
  } catch (error) {
    console.error("WEB_STORE_REINSTALL_FAILED", error);
    popupWindow?.destroy();
    app.exit(1);
  }
});
