const { app, BrowserWindow, session, shell, webContents } = require("electron");
const { EventEmitter } = require("node:events");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "aster-navigation-"));
app.setPath("userData", profile);
const downloads = path.join(profile, "downloads");
fs.mkdirSync(downloads);
app.setPath("downloads", downloads);
const realExit = app.exit.bind(app);
global.fetch = async (url) => ({
  ok: true,
  text: async () => '<entry><title>v999.0.0</title></entry>',
});
Object.defineProperty(app, "isPackaged", { value: true });
require("../electron/main.cjs");

async function waitFor(check) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error("Navigation check timed out");
}

app.whenReady().then(async () => {
  try {
    let window;
    await waitFor(() => {
      window = BrowserWindow.getAllWindows().find(w => w.getTitle() === "Aster");
      return window && !window.webContents.isLoading();
    });
    window.show();
    window.focus();
    const run = code => window.webContents.executeJavaScript(code);
    const addressFocused = () => run('document.activeElement?.getAttribute("aria-label") === "Search or enter an address"');
    await waitFor(addressFocused);
    await waitFor(() => window.webContents.isFocused());
    window.webContents.insertText("previous address");
    await run('window.aster.command("new-tab")');
    await waitFor(() => webContents.getAllWebContents().filter(w => w.getURL().endsWith("/public/new-tab.html") && !w.isLoading()).length === 2);
    await waitFor(addressFocused);
    assert.equal(window.webContents.isFocused(), true);
    assert.equal(await run('document.activeElement.value'), "");
    window.webContents.insertText("aster typing");
    await waitFor(() => run('document.activeElement.value === "aster typing"'));
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "t", modifiers: ["meta"] });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "t", modifiers: ["meta"] });
    await waitFor(() => webContents.getAllWebContents().filter(w => w.getURL().endsWith("/public/new-tab.html") && !w.isLoading()).length === 3);
    await waitFor(addressFocused);
    assert.equal(window.webContents.isFocused(), true);
    console.log("NEW_TAB_ADDRESS_FOCUS_AND_TYPING_OK");

    const html = path.join(profile, "local help.html");
    fs.writeFileSync(html, "<!doctype html><title>Local HTML works</title>");
    await run(`window.aster.command("navigate", { value: ${JSON.stringify(html)} })`);
    await waitFor(() => webContents.getAllWebContents().some(w => w.getURL() === pathToFileURL(html).href && w.getTitle() === "Local HTML works"));

    const fixture = path.join(profile, "extension");
    fs.mkdirSync(fixture);
    fs.writeFileSync(path.join(fixture, "manifest.json"), JSON.stringify({ manifest_version: 3, name: "Settings navigation check", version: "1.0", permissions: ["tabs"], options_page: "options.html" }));
    fs.writeFileSync(path.join(fixture, "options.html"), "<!doctype html><title>Extension settings work</title>");
    const extension = await session.defaultSession.extensions.loadExtension(fixture);
    const popup = new BrowserWindow({ show: false, webPreferences: { session: session.defaultSession, sandbox: true } });
    await popup.loadURL(`chrome-extension://${extension.id}/options.html`);
    for (const code of ['chrome.runtime.openOptionsPage()', 'chrome.tabs.create({url: "options.html"})']) {
      await popup.webContents.executeJavaScript(code);
      await waitFor(async () => {
        const state = await run('window.aster.getState()');
        const tab = state.tabs.find(t => t.id === state.activeTabId);
        return tab?.url === `chrome-extension://${extension.id}/options.html` && tab.title === "Extension settings work";
      });
    }
    console.log("LOCAL_HTML_AND_EXTENSION_SETTINGS_OK");

    const update = await run('window.aster.checkForUpdates()');
    assert.equal(update.assetName, `Aster-Update-999.0.0-${process.arch}.dmg`);
    const sequence = [];
    shell.openPath = async file => { assert.equal(file, path.join(downloads, update.assetName)); sequence.push("open"); return ""; };
    app.exit = () => sequence.push("close");
    window.webContents.downloadURL = url => {
      const item = new EventEmitter();
      let savedPath;
      item.getURLChain = () => [url];
      item.setSavePath = value => { savedPath = value; };
      item.getSavePath = () => savedPath;
      session.defaultSession.emit("will-download", {}, item);
      fs.writeFileSync(savedPath, "test disk image");
      item.emit("done", {}, "completed");
    };
    await run('window.aster.downloadUpdate()');
    await waitFor(() => sequence.length === 2);
    assert.deepEqual(sequence, ["open", "close"]);
    console.log("UPDATE_DOWNLOAD_AUTO_OPEN_AND_CLOSE_OK");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    fs.rmSync(profile, { recursive: true, force: true });
    realExit(process.exitCode || 0);
  }
});
