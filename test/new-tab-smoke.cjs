const { app, BrowserWindow } = require("electron");
const path = require("node:path");

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, nodeIntegration: false } });
  const expected = "https://www.google.com/search?q=aster+planet+test";
  try {
    await window.loadFile(path.join(__dirname, "../public/new-tab.html"));
    const navigation = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("New-tab search did not navigate")), 5000);
      window.webContents.once("will-navigate", (event, url) => {
        event.preventDefault();
        clearTimeout(timeout);
        resolve(url);
      });
    });
    await window.webContents.executeJavaScript(`
      document.getElementById("query").value = "aster planet test";
      document.getElementById("search").requestSubmit();
    `);
    const url = await navigation;
    if (url !== expected) throw new Error(`Expected ${expected}, got ${url}`);
    console.log(`NEW_TAB_SEARCH_OK ${url}`);

    await window.loadFile(path.join(__dirname, "../build/Install Aster.html"));
    const copied = await window.webContents.executeJavaScript(`
      new Promise((resolve) => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.copiedCommand = value; } } });
        document.getElementById('copy').click();
        setTimeout(() => resolve({ command: window.copiedCommand, status: document.getElementById('copy-status').textContent }), 0);
      })
    `);
    if (copied.command !== 'xattr -dr com.apple.quarantine ' || !copied.status.startsWith("Copied.")) {
      throw new Error(`Install guide copy failed: ${JSON.stringify(copied)}`);
    }
    console.log("INSTALL_GUIDE_COPY_OK");
  } catch (error) {
    console.error("NEW_TAB_SEARCH_FAILED", error);
    process.exitCode = 1;
  } finally {
    window.destroy();
    app.quit();
  }
});
