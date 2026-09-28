const { app, BrowserWindow, dialog, session } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
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

app.whenReady().then(async () => {
  try {
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
    // Denial must keep the next popup gated. Grant through the same Promise API
    // without starting Proton sign-in or using a real account.
    const next = new BrowserWindow({ show: false, webPreferences: { session: session.defaultSession, sandbox: true, contextIsolation: true } });
    await next.loadURL(`chrome-extension://${extension.id}/popup.html`);
    await delay(1500);
    if (!(await next.webContents.executeJavaScript(`document.body.innerText.includes('Allow VPN permissions')`))) throw new Error("Deny unexpectedly granted permissions");
    response = 0;
    const granted = await next.webContents.executeJavaScript(`browser.permissions.request({permissions:['proxy'], origins:['http://*/*','https://*/*','ftp://*/*','ws://*/*','wss://*/*','https://account.protonvpn.com/*','https://account.proton.me/*']})`);
    if (granted !== true) throw new Error("Allow did not resolve Proton's permission request");
    await next.loadURL(`chrome-extension://${extension.id}/popup.html`);
    await delay(1500);
    const after = await next.webContents.executeJavaScript(`({ gated:document.body.innerText.includes('Allow VPN permissions'), button:document.querySelector('button.sign-in-button')?.innerText })`);
    if (after.gated || after.button !== "Sign in") throw new Error(`Proton did not proceed to sign-in: ${JSON.stringify(after)}`);
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
