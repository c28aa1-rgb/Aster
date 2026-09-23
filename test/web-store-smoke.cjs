const { app, BrowserWindow, session } = require("electron");
const os = require("node:os");
const path = require("node:path");
const { installChromeWebStore } = require("electron-chrome-web-store");

app.setPath("userData", path.join(os.tmpdir(), `aster-web-store-smoke-${process.pid}`));

app.whenReady().then(async () => {
  try {
    await installChromeWebStore({
      session: session.defaultSession,
      autoUpdate: false,
      loadExtensions: false,
      beforeInstall: async () => ({ action: "deny" }),
    });
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        session: session.defaultSession,
        contextIsolation: true,
        sandbox: true,
      },
    });
    await window.loadURL("https://chromewebstore.google.com/");
    const result = await window.webContents.executeJavaScript(`({
      hasInstaller: typeof chrome?.webstorePrivate?.beginInstallWithManifest3 === "function",
      hasManagement: typeof chrome?.management?.getAll === "function",
      chromeUserAgent: navigator.userAgent.includes("Chrome/") && !navigator.userAgent.includes("Electron/")
    })`);
    if (!result.hasInstaller || !result.hasManagement || !result.chromeUserAgent) {
      throw new Error(`Web Store bridge is incomplete: ${JSON.stringify(result)}`);
    }
    console.log(`WEB_STORE_SMOKE_OK ${JSON.stringify(result)}`);
    window.destroy();
    app.exit(0);
  } catch (error) {
    console.error("WEB_STORE_SMOKE_FAILED", error);
    app.exit(1);
  }
});
