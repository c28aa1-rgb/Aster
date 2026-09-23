const { app, BrowserWindow, WebContentsView, dialog, ipcMain, session, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("node:fs");
const path = require("node:path");
const { installChromeWebStore, uninstallExtension } = require("electron-chrome-web-store");
const { ElectronChromeExtensions } = require("electron-chrome-extensions");
const { installExtensionPopupNavigation } = require("./extension-popup-navigation.cjs");
const { installProxyExtensionApi } = require("./proxy-extension-api.cjs");
const { installPatchedExtensionPreload } = require("./extension-runtime.cjs");

const CHROME_HEIGHT = 112;
const tabs = new Map();
let mainWindow;
let activeTabId = null;
let overlayOpen = false;
let nextTabId = 1;
let extensions = [];
let unpackedExtensionPaths = [];
let pinnedExtensionIds = [];
let chromeExtensions;
let extensionPopupNavigation;
let history = [];

const isDev = !app.isPackaged;
const rendererUrl = isDev
  ? "http://127.0.0.1:5187"
  : `file://${path.join(__dirname, "../dist/index.html")}`;
const newTabPath = path.join(__dirname, "../public/new-tab.html");

function savedExtensionsPath() {
  return path.join(app.getPath("userData"), "extensions.json");
}

function savedPinsPath() {
  return path.join(app.getPath("userData"), "pinned-extensions.json");
}

function webStoreExtensionsPath() {
  return path.join(app.getPath("userData"), "Extensions");
}

function newTabUrl() {
  return `file://${newTabPath}`;
}

function isNewTab(url) {
  return !url || url === "aster://newtab" || url === newTabUrl();
}

function displayUrl(url) {
  return isNewTab(url) ? "" : url;
}

function normalizeInput(value) {
  const input = String(value || "").trim();
  if (!input) return newTabUrl();
  if (/^(https?|file):\/\//i.test(input)) return input;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(input)) return `http://${input}`;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(input)) return `https://${input}`;
  return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
}

function startUpdateChecks() {
  if (!app.isPackaged || !fs.existsSync(path.join(process.resourcesPath, "app-update.yml"))) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", async (info) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Restart to update", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Aster update ready",
      message: `Aster ${info.version} has been downloaded.`,
      detail: "Restart Aster to finish installing the update.",
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on("error", (error) => console.warn("Aster update check failed:", error.message));
  // Let the first window settle before doing network work.
  setTimeout(() => autoUpdater.checkForUpdates().catch((error) => {
    console.warn("Aster update check failed:", error.message);
  }), 5000);
}

function snapshot() {
  return {
    activeTabId,
    tabs: [...tabs.values()].map(({ id, view, title, url, favicon, loading, canGoBack, canGoForward }) => ({
      id,
      webContentsId: view.webContents.id,
      title: isNewTab(url) ? "New tab" : title || "Loading…",
      url: displayUrl(url),
      favicon,
      loading,
      canGoBack,
      canGoForward,
    })),
    extensions: extensions.map((extension) => ({
      id: extension.id,
      name: extension.name,
      version: extension.version,
      path: extension.path,
      source: extension.source,
      hasAction: extension.hasAction,
      pinned: pinnedExtensionIds.includes(extension.id),
    })),
    history: history.slice(0, 40),
  };
}

function refreshExtensions() {
  const storeRoot = path.resolve(webStoreExtensionsPath());
  extensions = session.defaultSession.extensions.getAllExtensions().map((extension) => {
    const extensionPath = path.resolve(extension.path);
    const manifest = extension.manifest || {};
    return {
      id: extension.id,
      name: extension.name,
      version: extension.version,
      path: extension.path,
      source: extensionPath.startsWith(`${storeRoot}${path.sep}`) ? "store" : "unpacked",
      hasAction: Boolean(manifest.action || manifest.browser_action),
    };
  });
  sendState();
}

function loadPinnedExtensions() {
  try {
    const saved = JSON.parse(fs.readFileSync(savedPinsPath(), "utf8"));
    pinnedExtensionIds = Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : [];
  } catch {
    pinnedExtensionIds = [];
  }
}

function savePinnedExtensions() {
  fs.writeFileSync(savedPinsPath(), JSON.stringify(pinnedExtensionIds, null, 2));
}

function toggleExtensionPin(id) {
  const extension = extensions.find((item) => item.id === id);
  if (!extension?.hasAction) return;
  pinnedExtensionIds = pinnedExtensionIds.includes(id)
    ? pinnedExtensionIds.filter((pinnedId) => pinnedId !== id)
    : [...pinnedExtensionIds, id];
  savePinnedExtensions();
  sendState();
}

function sendState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("browser:state", snapshot());
  }
}

function updateViewBounds() {
  const tab = tabs.get(activeTabId);
  if (!mainWindow || !tab || overlayOpen) return;
  const [width, height] = mainWindow.getContentSize();
  tab.view.setBounds({ x: 0, y: CHROME_HEIGHT, width, height: Math.max(0, height - CHROME_HEIGHT) });
}

function syncTab(tab) {
  if (!tab || tab.view.webContents.isDestroyed()) return;
  const wc = tab.view.webContents;
  tab.url = wc.getURL();
  tab.title = wc.getTitle();
  tab.loading = wc.isLoading();
  tab.canGoBack = wc.navigationHistory.canGoBack();
  tab.canGoForward = wc.navigationHistory.canGoForward();
  sendState();
}

function recordHistory(tab) {
  if (!tab.url || isNewTab(tab.url) || tab.url.startsWith("devtools:")) return;
  history = [
    { title: tab.title || tab.url, url: tab.url, visitedAt: Date.now() },
    ...history.filter((item) => item.url !== tab.url),
  ].slice(0, 200);
}

function handleShortcut(tab, event, input) {
  if (!input.meta && !input.control) return;
  const key = input.key.toLowerCase();
  if (key === "l") {
    event.preventDefault();
    mainWindow.webContents.send("browser:focus-address");
  } else if (key === "t") {
    event.preventDefault();
    createTab();
  } else if (key === "w") {
    event.preventDefault();
    closeTab(tab.id);
  } else if (key === "r") {
    event.preventDefault();
    input.shift ? tab.view.webContents.reloadIgnoringCache() : tab.view.webContents.reload();
  } else if (key === "[") {
    event.preventDefault();
    if (tab.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack();
  } else if (key === "]") {
    event.preventDefault();
    if (tab.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward();
  }
}

function wireTab(tab) {
  const wc = tab.view.webContents;
  const sync = () => syncTab(tab);
  wc.on("did-start-loading", sync);
  wc.on("did-stop-loading", () => {
    sync();
    recordHistory(tab);
  });
  wc.on("did-navigate", sync);
  wc.on("did-navigate-in-page", sync);
  wc.on("page-title-updated", (_event, title) => {
    tab.title = title;
    sendState();
  });
  wc.on("page-favicon-updated", (_event, favicons) => {
    tab.favicon = favicons[0] || "";
    sendState();
  });
  wc.on("before-input-event", (event, input) => handleShortcut(tab, event, input));
  wc.setWindowOpenHandler(({ url }) => {
    createTab(url);
    return { action: "deny" };
  });
}

function createTab(url = newTabUrl()) {
  const shouldFocusAddress = isNewTab(url);
  const id = String(nextTabId++);
  const view = new WebContentsView({
    webPreferences: {
      session: session.defaultSession,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const tab = {
    id,
    view,
    title: "New tab",
    url,
    favicon: "",
    loading: false,
    canGoBack: false,
    canGoForward: false,
  };
  tabs.set(id, tab);
  chromeExtensions?.addTab(view.webContents, mainWindow);
  wireTab(tab);
  activateTab(id);
  view.webContents.loadURL(normalizeInput(url));
  extensionPopupNavigation?.closePopup();
  if (shouldFocusAddress) {
    setTimeout(() => {
      if (activeTabId === id && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("browser:focus-address");
      }
    }, 0);
  }
  return id;
}

function activateTab(id) {
  const tab = tabs.get(String(id));
  if (!tab || !mainWindow) return;
  const previous = tabs.get(activeTabId);
  if (previous) mainWindow.contentView.removeChildView(previous.view);
  dismissOverlay();
  activeTabId = tab.id;
  chromeExtensions?.selectTab(tab.view.webContents);
  if (!overlayOpen) {
    mainWindow.contentView.addChildView(tab.view);
    updateViewBounds();
    tab.view.webContents.focus();
  }
  sendState();
}

function closeTab(id) {
  const targetId = String(id);
  const ids = [...tabs.keys()];
  const index = ids.indexOf(targetId);
  const tab = tabs.get(targetId);
  if (!tab) return;
  if (mainWindow) mainWindow.contentView.removeChildView(tab.view);
  chromeExtensions?.removeTab(tab.view.webContents);
  tab.view.webContents.close();
  tabs.delete(targetId);
  if (tabs.size === 0) return createTab();
  if (activeTabId === targetId) activateTab(ids[index + 1] || ids[index - 1]);
  sendState();
}

function dismissOverlay() {
  overlayOpen = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("browser:dismiss-overlay");
  }
}

function setOverlay(open) {
  if (overlayOpen === open) return;
  overlayOpen = open;
  const tab = tabs.get(activeTabId);
  if (!mainWindow || !tab) return;
  if (open) {
    mainWindow.contentView.removeChildView(tab.view);
  } else {
    mainWindow.contentView.addChildView(tab.view);
    updateViewBounds();
  }
}

async function loadExtensionFromPath(extensionPath, persist = true) {
  const extension = await session.defaultSession.extensions.loadExtension(extensionPath, { allowFileAccess: true });
  if (persist && !unpackedExtensionPaths.includes(extensionPath)) {
    unpackedExtensionPaths.push(extensionPath);
    saveExtensions();
  }
  refreshExtensions();
  return extension;
}

function saveExtensions() {
  fs.writeFileSync(savedExtensionsPath(), JSON.stringify(unpackedExtensionPaths, null, 2));
}

async function restoreExtensions() {
  try {
    unpackedExtensionPaths = JSON.parse(fs.readFileSync(savedExtensionsPath(), "utf8"));
    for (const extensionPath of unpackedExtensionPaths) {
      try {
        await loadExtensionFromPath(extensionPath, false);
      } catch (error) {
        console.warn(`Could not restore extension at ${extensionPath}:`, error.message);
      }
    }
  } catch {
    // First launch has no saved extensions.
  }
}

async function chooseExtension() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Load unpacked Chromium extension",
    buttonLabel: "Load extension",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const extensionPath = result.filePaths[0];
  if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
    throw new Error("That folder does not contain a manifest.json file.");
  }
  const extension = await loadExtensionFromPath(extensionPath);
  return { id: extension.id, name: extension.name, version: extension.version, path: extensionPath, source: "unpacked" };
}

async function removeExtension(id) {
  const extension = extensions.find((item) => item.id === id);
  if (!extension) return;
  if (extension.source === "store") {
    await uninstallExtension(id, {
      session: session.defaultSession,
      extensionsPath: webStoreExtensionsPath(),
    });
  } else {
    session.defaultSession.extensions.removeExtension(id);
    unpackedExtensionPaths = unpackedExtensionPaths.filter(
      (extensionPath) => path.resolve(extensionPath) !== path.resolve(extension.path),
    );
    saveExtensions();
  }
  pinnedExtensionIds = pinnedExtensionIds.filter((pinnedId) => pinnedId !== id);
  savePinnedExtensions();
  refreshExtensions();
}

async function confirmWebStoreInstall({ localizedName, manifest, icon, browserWindow }) {
  const permissions = [...new Set([
    ...(Array.isArray(manifest.permissions) ? manifest.permissions : []),
    ...(Array.isArray(manifest.host_permissions) ? manifest.host_permissions : []),
  ])];
  const detail = permissions.length
    ? `Requested access:\n${permissions.slice(0, 12).map((permission) => `• ${permission}`).join("\n")}`
    : "This extension does not list additional permissions.";
  const result = await dialog.showMessageBox(browserWindow || mainWindow, {
    type: "question",
    buttons: ["Add extension", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    icon,
    message: `Add “${localizedName || manifest.name || "this extension"}” to Aster?`,
    detail,
    noLink: true,
  });
  return { action: result.response === 0 ? "allow" : "deny" };
}

async function secureWebStoreDirectory() {
  const extensionsRoot = webStoreExtensionsPath();
  await fs.promises.mkdir(extensionsRoot, { recursive: true, mode: 0o700 });
  const rootStat = await fs.promises.lstat(extensionsRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error("The Chrome Web Store extension directory is not a private directory.");
  }
  await fs.promises.chmod(extensionsRoot, 0o700);
  for (const entry of await fs.promises.readdir(extensionsRoot, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing unsafe extension directory entry: ${entry.name}`);
    }
  }
}

function findTabByWebContents(webContents) {
  return [...tabs.values()].find((tab) => tab.view.webContents === webContents);
}

async function requestExtensionPermissions(extension, permissions) {
  const requested = [
    ...(Array.isArray(permissions.permissions) ? permissions.permissions : []),
    ...(Array.isArray(permissions.origins) ? permissions.origins : []),
  ];
  const result = await dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: ["Allow", "Deny"],
    defaultId: 0,
    cancelId: 1,
    message: `Allow “${extension.name}” additional access?`,
    detail: requested.length
      ? requested.slice(0, 12).map((permission) => `• ${permission}`).join("\n")
      : "The extension requested additional access.",
    noLink: true,
  });
  return result.response === 0;
}

async function initializeExtensionSupport() {
  const browserSession = session.defaultSession;
  await secureWebStoreDirectory();
  loadPinnedExtensions();
  ElectronChromeExtensions.handleCRXProtocol(browserSession);
  chromeExtensions = new ElectronChromeExtensions({
    license: "GPL-3.0",
    session: browserSession,
    async createTab(details) {
      const requestedUrl = Array.isArray(details.url) ? details.url[0] : details.url;
      const id = createTab(requestedUrl || newTabUrl());
      const tab = tabs.get(id);
      return [tab.view.webContents, mainWindow];
    },
    selectTab(webContents) {
      const tab = findTabByWebContents(webContents);
      if (tab) activateTab(tab.id);
    },
    removeTab(webContents) {
      const tab = findTabByWebContents(webContents);
      if (tab) closeTab(tab.id);
    },
    async createWindow(details) {
      const requestedUrl = Array.isArray(details.url) ? details.url[0] : details.url;
      createTab(requestedUrl || newTabUrl());
      return mainWindow;
    },
    requestPermissions: requestExtensionPermissions,
  });
  installPatchedExtensionPreload(browserSession);
  installProxyExtensionApi(chromeExtensions, browserSession);
  extensionPopupNavigation = installExtensionPopupNavigation(chromeExtensions, createTab);
  browserSession.extensions.on("extension-loaded", refreshExtensions);
  browserSession.extensions.on("extension-unloaded", refreshExtensions);
  await installChromeWebStore({
    session: browserSession,
    extensionsPath: webStoreExtensionsPath(),
    autoUpdate: true,
    loadExtensions: true,
    allowUnpackedExtensions: false,
    minimumManifestVersion: 3,
    beforeInstall: confirmWebStoreInstall,
  });
  await restoreExtensions();
  refreshExtensions();
}

async function handleCommand(_event, { type, payload }) {
  const tab = tabs.get(activeTabId);
  switch (type) {
    case "new-tab": return createTab();
    case "close-tab": return closeTab(payload?.id);
    case "activate-tab": return activateTab(payload?.id);
    case "navigate": return tab?.view.webContents.loadURL(normalizeInput(payload?.value));
    case "back": if (tab?.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack(); break;
    case "forward": if (tab?.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward(); break;
    case "reload": tab?.view.webContents.reload(); break;
    case "stop": tab?.view.webContents.stop(); break;
    case "home": return tab?.view.webContents.loadURL(newTabUrl());
    case "load-extension": return chooseExtension();
    case "remove-extension": return removeExtension(payload?.id);
    case "toggle-extension-pin": return toggleExtensionPin(payload?.id);
    case "open-web-store": return tab?.view.webContents.loadURL("https://chromewebstore.google.com/");
    case "open-external": return shell.openExternal(payload?.url);
    case "open-downloads": return shell.openPath(app.getPath("downloads"));
    case "clear-history": history = []; sendState(); break;
    default: throw new Error(`Unknown browser command: ${type}`);
  }
  syncTab(tab);
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 860,
    minHeight: 600,
    title: "Aster",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 17, y: 18 },
    backgroundColor: "#F4F7F5",
    vibrancy: "under-window",
    visualEffectState: "active",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(rendererUrl);
  mainWindow.on("resize", updateViewBounds);
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const tab = tabs.get(activeTabId);
    if (tab) handleShortcut(tab, event, input);
  });
  mainWindow.on("closed", () => {
    for (const tab of tabs.values()) tab.view.webContents.close();
    tabs.clear();
    mainWindow = null;
  });
  mainWindow.webContents.on("did-finish-load", () => {
    if (!tabs.size) createTab();
    sendState();
  });
}

app.whenReady().then(async () => {
  await initializeExtensionSupport();
  createWindow();
  startUpdateChecks();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("browser:get-state", () => snapshot());
ipcMain.handle("browser:command", handleCommand);
ipcMain.on("browser:overlay", (_event, open) => setOverlay(open));
