const { app, BrowserWindow } = require("electron");
const path = require("node:path");

async function expectSearch(window, submit, label) {
  const expected = "https://www.google.com/search?q=aster+planet+test";
  const navigation = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} did not navigate`)), 5000);
    window.webContents.once("will-navigate", (event, url) => {
      event.preventDefault();
      clearTimeout(timeout);
      resolve(url);
    });
  });
  await window.webContents.executeJavaScript(`document.getElementById("query").value = "aster planet test"; document.getElementById("query").focus();`);
  await submit();
  const url = await navigation;
  if (url !== expected) throw new Error(`Expected ${expected}, got ${url}`);
  console.log(`${label}_OK ${url}`);
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, nodeIntegration: false } });
  try {
    await window.loadFile(path.join(__dirname, "../public/new-tab.html"));
    await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { clearInterval(timer); reject(new Error('Shortcut enhancement did not mount')); }, 5000);
      const timer = setInterval(() => { if (document.querySelectorAll('#shortcuts svg').length === 3) { clearTimeout(timeout); clearInterval(timer); resolve(); } }, 20);
    })`);
    await expectSearch(window, () => window.webContents.executeJavaScript(`document.querySelector('.search-submit').click()`), 'NEW_TAB_BUTTON');
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    await expectSearch(window, async () => {
      await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
      await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    }, 'NEW_TAB_ENTER');

    // Block the enhancement bundle: the native form must still be usable.
    window.webContents.session.webRequest.onBeforeRequest({ urls: ['file://*/*new-tab.js'] }, (_details, callback) => callback({ cancel: true }));
    await new Promise(resolve => { window.webContents.once('did-finish-load', resolve); window.reload(); });
    const fallback = await window.webContents.executeJavaScript(`document.querySelectorAll('#shortcuts svg').length === 0`);
    if (!fallback) throw new Error('Fallback test did not block the enhancement bundle');
    await expectSearch(window, () => window.webContents.executeJavaScript(`document.querySelector('.search-submit').click()`), 'NEW_TAB_FALLBACK');
    window.webContents.session.webRequest.onBeforeRequest(null);

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
    app.exit(process.exitCode || 0);
  }
});
