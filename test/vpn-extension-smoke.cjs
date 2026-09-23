const { app, BrowserWindow, session } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ElectronChromeExtensions } = require("electron-chrome-extensions");
const { installExtension } = require("electron-chrome-web-store");
const { installProxyExtensionApi } = require("../electron/proxy-extension-api.cjs");
const { installPatchedExtensionPreload } = require("../electron/extension-runtime.cjs");

const VPN_EXTENSION_ID = process.env.VPN_EXTENSION_ID || "majdfhpaihoncoakbjgbdhglocklcgno";
const userDataPath = process.env.VPN_PROFILE_PATH || path.join(os.tmpdir(), `aster-vpn-smoke-${process.pid}`);
const extensionsPath = path.join(userDataPath, "Extensions");
app.setPath("userData", userDataPath);

function timeout(ms, message) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
}

app.whenReady().then(async () => {
  let tabWindow;
  let popupWindow;
  try {
    const browserSession = session.defaultSession;
    const workerConsole = [];
    const workerStatuses = [];
    const networkErrors = [];
    browserSession.serviceWorkers.on("console-message", (_event, details) => {
      workerConsole.push(details.message);
    });
    browserSession.serviceWorkers.on("running-status-changed", (details) => {
      workerStatuses.push(details);
    });
    browserSession.webRequest.onErrorOccurred({ urls: ["<all_urls>"] }, (details) => {
      if (details.url.startsWith("http")) networkErrors.push({ url: details.url, error: details.error });
    });
    ElectronChromeExtensions.handleCRXProtocol(browserSession);
    const extensionApis = new ElectronChromeExtensions({
      license: "GPL-3.0",
      session: browserSession,
    });
    installPatchedExtensionPreload(browserSession);
    const proxyApi = installProxyExtensionApi(extensionApis, browserSession);

    tabWindow = new BrowserWindow({
      show: false,
      webPreferences: { session: browserSession, contextIsolation: true, sandbox: true },
    });
    await tabWindow.loadURL("data:text/html,<title>VPN test tab</title><h1>VPN test</h1>");
    extensionApis.addTab(tabWindow.webContents, tabWindow);
    extensionApis.selectTab(tabWindow.webContents);

    const extension = await Promise.race([
      installExtension(VPN_EXTENSION_ID, { session: browserSession, extensionsPath }),
      timeout(45000, "Timed out installing the VPN extension from the Chrome Web Store"),
    ]);
    const manifest = extension.manifest;
    const popupPath = manifest.action?.default_popup || manifest.browser_action?.default_popup;
    if (!popupPath) throw new Error("The VPN extension does not expose a toolbar popup");

    const workerScope = `chrome-extension://${extension.id}/`;
    let workerStarted = false;
    let workerError = "";
    try {
      await Promise.race([
        browserSession.serviceWorkers.startWorkerForScope(workerScope),
        timeout(10000, "Service worker did not start"),
      ]);
      workerStarted = true;
    } catch (error) {
      workerError = error.message;
    }

    popupWindow = new BrowserWindow({
      show: false,
      webPreferences: { session: browserSession, contextIsolation: true, sandbox: true },
    });
    await popupWindow.loadURL(new URL(popupPath, workerScope).href);
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const inspectPopup = () => popupWindow.webContents.executeJavaScript(`({
        title: document.title,
        text: document.body?.innerText?.replace(/\\s+/g, " ").trim().slice(0, 500),
        buttons: [...document.querySelectorAll("button")].map((button) => button.innerText.trim()).filter(Boolean).slice(0, 20),
        controls: [...document.querySelectorAll("button, [role=button], input, [tabindex]")].map((element) => ({
          tag: element.tagName,
          text: element.innerText?.replace(/\\s+/g, " ").trim().slice(0, 80) || "",
          label: element.getAttribute("aria-label") || "",
          title: element.getAttribute("title") || "",
          type: element.getAttribute("type") || "",
          className: String(element.className || "").slice(0, 120)
        })).slice(0, 40),
        api: {
          runtime: typeof chrome.runtime?.sendMessage,
          tabs: typeof chrome.tabs?.create,
          proxy: typeof chrome.proxy,
          proxySettings: typeof chrome.proxy?.settings?.set,
        }
      })`);
    let popup = await inspectPopup();
    if (process.env.VPN_ACCEPT_TERMS === "1" && popup.buttons.includes("Accept")) {
      await popupWindow.webContents.executeJavaScript(`{
        const button = [...document.querySelectorAll("button")].find((item) => item.innerText.trim() === "Accept");
        button?.click();
      }`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      popup = await inspectPopup();
    }
    if (process.env.VPN_CONNECT === "1" && popup.controls.some((control) => control.className.includes("play-button"))) {
      await popupWindow.webContents.executeJavaScript(`setTimeout(() => document.querySelector(".play-button")?.click(), 0); "scheduled"`);
      await new Promise((resolve) => setTimeout(resolve, 10000));
      popup = await inspectPopup();
    }
    const resolvedProxy = await Promise.race([
      browserSession.resolveProxy("https://example.com"),
      timeout(10000, "Proxy resolution timed out"),
    ]);
    let tabNavigation;
    try {
      await Promise.race([
        tabWindow.loadURL("https://example.com/"),
        timeout(20000, "Proxied tab navigation timed out"),
      ]);
      tabNavigation = {
        ok: true,
        url: tabWindow.webContents.getURL(),
        title: tabWindow.webContents.getTitle(),
      };
    } catch (error) {
      tabNavigation = { ok: false, error: error.message, url: tabWindow.webContents.getURL() };
    }
    let proxiedRequest;
    try {
      const response = await Promise.race([
        browserSession.fetch("https://example.com/", { cache: "no-store" }),
        timeout(15000, "Proxied request timed out"),
      ]);
      proxiedRequest = { ok: response.ok, status: response.status };
    } catch (error) {
      proxiedRequest = { ok: false, error: error.message };
    }

    const runningWorkers = Object.values(browserSession.serviceWorkers.getAllRunning()).map((worker) => worker.scope);
    const result = {
      id: extension.id,
      name: extension.name,
      version: extension.version,
      installed: fs.existsSync(path.join(extensionsPath, extension.id)),
      workerStarted: workerStarted || runningWorkers.includes(workerScope),
      workerError,
      runningWorkers,
      workerStatuses,
      workerConsole: workerConsole.slice(-20),
      networkErrors: networkErrors.slice(-20),
      proxyState: proxyApi.getState(),
      resolvedProxy,
      tabNavigation,
      proxiedRequest,
      popup,
    };
    console.log(`VPN_EXTENSION_SMOKE ${JSON.stringify(result)}`);
    if (!result.installed || !popup.text) throw new Error("The VPN extension did not install and render its popup");

    popupWindow.destroy();
    tabWindow.destroy();
    app.exit(0);
  } catch (error) {
    console.error("VPN_EXTENSION_SMOKE_FAILED", error);
    popupWindow?.destroy();
    tabWindow?.destroy();
    app.exit(1);
  }
});
