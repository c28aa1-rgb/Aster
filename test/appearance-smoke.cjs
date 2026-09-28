const { app, BrowserWindow, nativeTheme, webContents } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "aster-appearance-"));
app.setPath("userData", profile);
fs.writeFileSync(path.join(profile, "appearance.json"), JSON.stringify({ theme: "dark" }));
Object.defineProperty(app, "isPackaged", { value: true });
require("../electron/main.cjs");

async function waitFor(check) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Appearance check timed out");
}

app.whenReady().then(async () => {
  let window;
  try {
    await waitFor(() => {
      window = BrowserWindow.getAllWindows().find(w => w.getTitle() === "Aster");
      return window && !window.webContents.isLoading();
    });
    const run = code => window.webContents.executeJavaScript(code);
    await waitFor(() => run('document.documentElement.dataset.theme === "dark"'));
    assert.equal(nativeTheme.themeSource, "dark");
    await run('document.querySelector("button[aria-label=Settings]").click()');
    await waitFor(() => run('!!document.querySelector("[role=switch]")'));
    assert.equal(await run('document.querySelector("[role=switch]").getAttribute("aria-checked")'), "true");
    await run('document.querySelector("[role=switch]").click()');
    await waitFor(() => run('document.documentElement.dataset.theme === "light"'));
    assert.equal(nativeTheme.themeSource, "light");
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, "appearance.json"))).theme, "light");
    await run('document.querySelector("[role=switch]").click()');
    await waitFor(() => run('document.documentElement.dataset.theme === "dark"'));
    const home = () => webContents.getAllWebContents().filter(w => w.getURL().endsWith("/public/new-tab.html"));
    await waitFor(() => home().length > 0 && !home()[0].isLoading());
    await waitFor(async () => await home()[0].executeJavaScript('matchMedia("(prefers-color-scheme: dark)").matches'));
    assert.equal(await home()[0].executeJavaScript('getComputedStyle(document.documentElement).color'), "rgb(224, 238, 237)");
    await run('window.aster.command("new-tab")');
    await waitFor(() => home().length === 2 && home().every(w => !w.isLoading()));
    for (const tab of home()) assert.equal(await tab.executeJavaScript('matchMedia("(prefers-color-scheme: dark)").matches'), true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, "appearance.json"))).theme, "dark");
    console.log("APPEARANCE_RESTORE_TOGGLE_NEW_TAB_OK");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    for (const win of BrowserWindow.getAllWindows()) win.destroy();
    fs.rmSync(profile, { recursive: true, force: true });
    app.exit(process.exitCode || 0);
  }
});
