const { app, BrowserWindow, dialog, session } = require("electron");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { installExtensionPopupNavigation } = require("../electron/extension-popup-navigation.cjs");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "aster-proton-permissions-"));
app.setPath("userData", profile);
Object.defineProperty(app, "isPackaged", { value: true });
const prompts = [];
let response = 1;
dialog.showMessageBox = async (_parent, options) => {
  prompts.push({ message: options.message, detail: options.detail });
  // Proton closes its popup after 200ms; consent must still finish afterward.
  await new Promise(resolve => setTimeout(resolve, 600));
  return { response };
};
require("../electron/main.cjs");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function testPopupRemainsOpenDuringPermissionPrompt() {
  const extensionApis = new EventEmitter();
  const popupWindow = new EventEmitter();
  let destroyed = false;
  popupWindow.isDestroyed = () => destroyed;
  popupWindow.webContents = { setWindowOpenHandler() {}, on() {} };
  const popup = {
    extensionId: "proton",
    browserWindow: popupWindow,
    maybeClose() { destroyed = true; },
    isDestroyed: () => destroyed,
    destroy() { destroyed = true; },
  };
  popupWindow.on("blur", popup.maybeClose);
  const navigation = installExtensionPopupNavigation(extensionApis, () => {});
  extensionApis.emit("browser-action-popup-created", popup);
  return navigation.withActivePopupOpen("proton", async () => {
    popupWindow.emit("blur");
    if (destroyed) throw new Error("Proton popup closed while its permission prompt was active");
  }).then(() => {
    if (popupWindow.listenerCount("blur") !== 1) throw new Error("Popup close handling was not restored after the prompt");
    navigation.dispose();
  });
}

app.whenReady().then(async () => {
  try {
    await testPopupRemainsOpenDuringPermissionPrompt();
    await delay(2000);
    const extensionPath = process.env.PROTON_EXTENSION_PATH;
    if (!extensionPath) throw new Error("Set PROTON_EXTENSION_PATH to the installed Proton extension directory");
    const extension = await session.defaultSession.extensions.loadExtension(extensionPath);
    const win = new BrowserWindow({ show: false, webPreferences: { session: session.defaultSession, sandbox: true, contextIsolation: true } });
    await win.loadURL(`chrome-extension://${extension.id}/popup.html`);
    await delay(3000);
    const before = await win.webContents.executeJavaScript(`({ text: document.body.innerText, request:typeof globalThis.browser?.permissions?.request })`);
    if (!before.text.includes("Allow VPN permissions") || before.request !== "function") throw new Error("Proton's permission onboarding did not initialize");
    await win.webContents.executeJavaScript(`setTimeout(() => document.querySelector('button.sign-in-button')?.click(), 0); true`);
    await delay(1500);
    if (!prompts.some(p => p.message.includes("Proton"))) throw new Error("Proton Next did not show a permission prompt");
    if (prompts.length !== 1) throw new Error(`Next produced ${prompts.length} duplicate prompts`);
    // Denial must keep the next popup gated. On Allow, intercept Proton's login URL before any account sign-in.
    const next = new BrowserWindow({ show: false, webPreferences: { session: session.defaultSession, sandbox: true, contextIsolation: true } });
    await next.loadURL(`chrome-extension://${extension.id}/popup.html`);
    await delay(1500);
    if (!(await next.webContents.executeJavaScript(`document.body.innerText.includes('Allow VPN permissions')`))) throw new Error("Deny unexpectedly granted permissions");
    const signInUrls = [];
    const popupErrors = [];
    next.webContents.on("console-message", (details) => popupErrors.push(details.message));
    session.defaultSession.webRequest.onBeforeRequest({ urls: ["https://account.proton.me/*", "https://account.protonvpn.com/*"] }, (details, callback) => {
      signInUrls.push(details.url);
      callback({ cancel: true });
    });
    response = 0;
    await next.webContents.executeJavaScript(`document.querySelector('button.sign-in-button')?.click(); true`);
    await delay(4000);
    if (!signInUrls.length) {
      const state = next.isDestroyed() ? "popup closed" : await next.webContents.executeJavaScript(`document.body.innerText.slice(0, 300)`);
      throw new Error(`Proton's Allow action did not open a Proton account tab: ${JSON.stringify({ state, prompts, popupErrors })}`);
    }
    const savedGrants = JSON.parse(fs.readFileSync(path.join(profile, "extension-permissions.json"), "utf8"))[extension.id];
    if (!savedGrants?.permissions.includes("proxy") || !savedGrants?.origins.includes("https://account.proton.me/*")) {
      throw new Error("Allowed Proton permissions were not persisted");
    }
    next.destroy();
    session.defaultSession.extensions.removeExtension(extension.id);
    await delay(300);
    const reloadedExtension = await session.defaultSession.extensions.loadExtension(extensionPath);
    const verify = new BrowserWindow({ show: false, webPreferences: { session: session.defaultSession, sandbox: true, contextIsolation: true } });
    await verify.loadURL(`chrome-extension://${reloadedExtension.id}/popup.html`);
    await delay(1000);
    const permissionsRestored = await verify.webContents.executeJavaScript(`browser.permissions.contains({permissions:['proxy'],origins:['https://account.proton.me/*']})`);
    if (!permissionsRestored) throw new Error("Allowed Proton permissions did not survive an extension reload");
    console.log("PROTON_PERMISSIONS_PROMPT_OK");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    for (const win of BrowserWindow.getAllWindows()) win.destroy();
    fs.rmSync(profile, { recursive: true, force: true });
    app.exit(process.exitCode || 0);
  }
});
