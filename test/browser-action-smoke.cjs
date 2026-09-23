const { app, BrowserWindow, session } = require("electron");
const os = require("node:os");
const path = require("node:path");
const { ElectronChromeExtensions } = require("electron-chrome-extensions");
const { installExtensionPopupNavigation } = require("../electron/extension-popup-navigation.cjs");

app.setPath("userData", path.join(os.tmpdir(), `aster-action-smoke-${process.pid}`));

function timeout(ms, message) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
}

function waitFor(check, message, ms = 5000) {
  return Promise.race([
    new Promise((resolve) => {
      const poll = () => check() ? resolve(check()) : setTimeout(poll, 20);
      poll();
    }),
    timeout(ms, message),
  ]);
}

app.whenReady().then(async () => {
  let tabWindow;
  let toolbarWindow;
  const createdTabWindows = [];
  const openedUrls = [];
  try {
    const browserSession = session.defaultSession;
    ElectronChromeExtensions.handleCRXProtocol(browserSession);
    let popupNavigation;
    const extensionApis = new ElectronChromeExtensions({
      license: "GPL-3.0",
      session: browserSession,
      async createTab(details) {
        openedUrls.push(details.url);
        const createdTab = new BrowserWindow({
          show: false,
          webPreferences: { session: browserSession, contextIsolation: true, sandbox: true },
        });
        createdTabWindows.push(createdTab);
        await createdTab.loadURL("data:text/html,<title>Created Aster tab</title>");
        popupNavigation?.closePopup();
        return [createdTab.webContents, tabWindow];
      },
    });
    popupNavigation = installExtensionPopupNavigation(extensionApis, (url) => {
      openedUrls.push(url);
      popupNavigation.closePopup();
    });
    tabWindow = new BrowserWindow({
      show: false,
      webPreferences: { session: browserSession, contextIsolation: true, sandbox: true },
    });
    await tabWindow.loadURL("data:text/html,<title>Active smoke tab</title><h1>Ready</h1>");
    extensionApis.addTab(tabWindow.webContents, tabWindow);
    extensionApis.selectTab(tabWindow.webContents);

    const extension = await browserSession.extensions.loadExtension(path.join(__dirname, "extension"));
    toolbarWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        session: browserSession,
        preload: path.join(__dirname, "../electron/preload.cjs"),
        contextIsolation: true,
        sandbox: true,
      },
    });
    await toolbarWindow.loadFile(path.join(__dirname, "browser-action-smoke.html"));

    const popupCreated = new Promise((resolve) => extensionApis.once("browser-action-popup-created", resolve));
    await toolbarWindow.webContents.executeJavaScript(`(async () => {
      await window.browserAction.getState("_self");
      const action = document.createElement("button", { is: "browser-action" });
      window.testAction = action;
      action.id = ${JSON.stringify(extension.id)};
      action.setAttribute("tab", ${JSON.stringify(String(tabWindow.webContents.id))});
      action.setAttribute("alignment", "bottom left");
      document.body.appendChild(action);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      action.click();
    })()`);

    const popup = await Promise.race([popupCreated, timeout(5000, "Extension popup was not created")]);
    await popup.whenReady();
    const popupResult = await popup.browserWindow.webContents.executeJavaScript(`new Promise((resolve) => {
      const finish = () => resolve({
        heading: document.querySelector("h1")?.textContent,
        tabApi: document.documentElement.dataset.tabApi,
        hasControl: Boolean(document.getElementById("control"))
      });
      if (document.documentElement.dataset.tabApi) finish();
      else setTimeout(finish, 500);
    })`);
    if (popupResult.heading !== "Aster popup works" || popupResult.tabApi !== "ok" || !popupResult.hasControl) {
      throw new Error(`Popup integration incomplete: ${JSON.stringify(popupResult)}`);
    }

    await popup.browserWindow.webContents.executeJavaScript(`setTimeout(() => document.getElementById("open-tab").click(), 0); "scheduled"`);
    await waitFor(
      () => openedUrls.includes("https://example.invalid/from-tabs-create"),
      "chrome.tabs.create was not routed into an Aster tab",
    );
    await waitFor(() => popup.isDestroyed(), "Popup stayed open after chrome.tabs.create");

    const secondPopupCreated = new Promise((resolve) => extensionApis.once("browser-action-popup-created", resolve));
    await toolbarWindow.webContents.executeJavaScript(`window.testAction.click()`);
    const secondPopup = await Promise.race([secondPopupCreated, timeout(5000, "Second extension popup was not created")]);
    await secondPopup.whenReady();
    await secondPopup.browserWindow.webContents.executeJavaScript(`setTimeout(() => document.getElementById("open-window").click(), 0); "scheduled"`);
    await waitFor(
      () => openedUrls.includes("https://example.invalid/from-window-open"),
      "window.open was not routed into an Aster tab",
    );
    await waitFor(() => secondPopup.isDestroyed(), "Popup stayed open after window.open");

    console.log(`BROWSER_ACTION_SMOKE_OK ${JSON.stringify({ ...popupResult, openedUrls })}`);
    popupNavigation.dispose();
    toolbarWindow.destroy();
    createdTabWindows.forEach((window) => window.destroy());
    tabWindow.destroy();
    app.exit(0);
  } catch (error) {
    console.error("BROWSER_ACTION_SMOKE_FAILED", error);
    toolbarWindow?.destroy();
    createdTabWindows.forEach((window) => window.destroy());
    tabWindow?.destroy();
    app.exit(1);
  }
});
