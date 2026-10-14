const { app, BrowserWindow, WebContentsView, dialog, ipcMain, nativeTheme, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { findAvailableRelease, parseAtomReleases, finishUpdateDownload, openDownloadedUpdate } = require("./update-release.cjs");
const { normalizeInput: normalizeNavigationInput } = require("./navigation-input.cjs");
const { installChromeWebStore, uninstallExtension } = require("electron-chrome-web-store");
const { ElectronChromeExtensions } = require("electron-chrome-extensions");
const { installExtensionPopupNavigation } = require("./extension-popup-navigation.cjs");
const { installProxyExtensionApi } = require("./proxy-extension-api.cjs");
const { installPatchedExtensionPreload } = require("./extension-runtime.cjs");

const CHROME_HEIGHT = 148;
const tabs = new Map();
const downloadItems = new Map();
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
let bookmarks = [];
let downloads = [];
let remoteSuggestionsEnabled = true;
let restoringSession = false;
let nextDownloadId = 1;
let theme = "light";

function setTheme(value) {
  if (value !== "light" && value !== "dark") throw new Error("Invalid theme");
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(path.join(app.getPath("userData"), "appearance.json"), JSON.stringify({ theme: value }));
  theme = value;
  nativeTheme.themeSource = theme;
  mainWindow?.setBackgroundColor(theme === "dark" ? "#14232b" : "#F4F7F5");
  sendState();
}

function restoreTheme() {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "appearance.json"), "utf8"));
    if (saved.theme === "dark") theme = "dark";
  } catch { /* First launch uses the light theme. */ }
  nativeTheme.themeSource = theme;
}
let availableUpdate;
let lastUpdateCheck = 0;
let updateState = { checking: false, available: false, downloadStatus: "idle", downloadedPath: "", progress: 0, error: "" };

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

function savedHistoryPath() {
  return path.join(app.getPath("userData"), "history.json");
}

function savedBookmarksPath() { return path.join(app.getPath("userData"), "bookmarks.json"); }
function savedSessionPath() { return path.join(app.getPath("userData"), "session.json"); }
function savedSettingsPath() { return path.join(app.getPath("userData"), "settings.json"); }
function savedDownloadsPath() { return path.join(app.getPath("userData"), "downloads.json"); }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function saveHistory() {
  writeJson(savedHistoryPath(), history);
}

function saveBookmarks() { writeJson(savedBookmarksPath(), bookmarks); }
function saveSettings() { writeJson(savedSettingsPath(), { remoteSuggestionsEnabled }); }
function saveDownloads() { writeJson(savedDownloadsPath(), downloads.slice(0, 40)); }

function saveSession() {
  if (restoringSession || !tabs.size) return;
  const ids = [...tabs.keys()];
  writeJson(savedSessionPath(), {
    activeIndex: Math.max(0, ids.indexOf(activeTabId)),
    tabs: ids.map((id) => {
      const tab = tabs.get(id);
      return { url: tab.view.webContents.getURL() || tab.url };
    }),
  });
}

function restoreBrowserData() {
  const savedHistory = readJson(savedHistoryPath(), []);
  history = Array.isArray(savedHistory) ? savedHistory.filter((item) => typeof item?.url === "string").slice(0, 200) : [];
  const savedBookmarks = readJson(savedBookmarksPath(), []);
  bookmarks = Array.isArray(savedBookmarks) ? savedBookmarks.filter((item) => typeof item?.url === "string").slice(0, 200) : [];
  const settings = readJson(savedSettingsPath(), {});
  remoteSuggestionsEnabled = settings.remoteSuggestionsEnabled !== false;
  const savedDownloads = readJson(savedDownloadsPath(), []);
  downloads = Array.isArray(savedDownloads) ? savedDownloads.filter((item) => typeof item?.id === "string").map((item) =>
    item.state === "downloading" || item.state === "paused" ? { ...item, state: "interrupted" } : item,
  ).slice(0, 40) : [];
  nextDownloadId = Math.max(0, ...downloads.map((item) => Number(item.id) || 0)) + 1;
}

function restoreSession() {
  const saved = readJson(savedSessionPath(), null);
  const urls = Array.isArray(saved?.tabs) ? saved.tabs.map((tab) => tab?.url).filter((url) => typeof url === "string" && url) : [];
  if (!urls.length) { createTab(); return; }
  restoringSession = true;
  try {
    const ids = urls.map((url) => createTab(url));
    activateTab(ids[Math.min(saved.activeIndex || 0, ids.length - 1)]);
  } finally {
    restoringSession = false;
    saveSession();
  }
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
  return normalizeNavigationInput(value, newTabUrl());
}

function emitUpdateState() {
  sendState();
}

async function releaseAssetExists(release) {
  if (!release?.asset?.browser_download_url) return false;
  try {
    const response = await fetch(release.asset.browser_download_url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Aster-Browser" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function checkForUpdates() {
  if (updateState.checking || updateState.downloadStatus === "downloading") return updateState;
  lastUpdateCheck = Date.now();
  updateState = { ...updateState, checking: true, error: "" };
  emitUpdateState();
  try {
    // GitHub's public Atom feed avoids the unauthenticated API's 60-request limit.
    const feedResponse = await fetch("https://github.com/c28aa1-rgb/Aster/releases.atom", {
      headers: { Accept: "application/atom+xml", "User-Agent": "Aster-Browser" },
    });
    if (!feedResponse.ok) throw new Error(`GitHub returned ${feedResponse.status}`);
    const feed = await feedResponse.text();
    availableUpdate = findAvailableRelease(parseAtomReleases(feed, process.arch), app.getVersion(), process.arch);
    if (availableUpdate && !(await releaseAssetExists(availableUpdate))) availableUpdate = undefined;
    if (!availableUpdate) {
      const response = await fetch("https://api.github.com/repos/c28aa1-rgb/Aster/releases?per_page=30", {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "Aster-Browser" },
      });
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      availableUpdate = findAvailableRelease(await response.json(), app.getVersion(), process.arch);
      if (availableUpdate && !(await releaseAssetExists(availableUpdate))) availableUpdate = undefined;
    }
    updateState = availableUpdate
      ? {
        checking: false,
        available: true,
        version: availableUpdate.version,
        notes: availableUpdate.body || "No release notes were provided.",
        assetName: availableUpdate.asset.name,
        downloadStatus: availableUpdate.version === updateState.version ? updateState.downloadStatus : "idle",
        downloadedPath: availableUpdate.version === updateState.version ? updateState.downloadedPath : "",
        progress: availableUpdate.version === updateState.version ? updateState.progress : 0,
        error: "",
      }
      : { checking: false, available: false, downloadStatus: "idle", downloadedPath: "", progress: 0, error: "" };
  } catch (error) {
    updateState = { ...updateState, checking: false, error: error.message || "Could not check for updates." };
    console.warn("Aster update check failed:", error.message);
  }
  emitUpdateState();
  return updateState;
}

function startUpdateChecks() {
  session.defaultSession.on("will-download", (event, item) => {
    const isUpdateDownload = availableUpdate && updateState.downloadStatus === "downloading"
      && item.getURLChain().includes(availableUpdate.asset.browser_download_url);
    if (isUpdateDownload) {
      const filename = `Aster-Update-${availableUpdate.version}-${process.arch}.dmg`;
      item.setSavePath(path.join(app.getPath("downloads"), filename));
      updateState = { ...updateState, downloadStatus: "downloading", downloadedPath: "", progress: 0, error: "" };
      emitUpdateState();
    }
    const download = addDownload(item);
    sendState();
    item.on("updated", () => {
      updateDownload(download.id, item);
      if (isUpdateDownload) {
        const total = item.getTotalBytes();
        updateState = { ...updateState, progress: total > 0 ? Math.min(100, Math.round((item.getReceivedBytes() / total) * 100)) : 0 };
        emitUpdateState();
      }
    });
    item.once("done", async (_downloadEvent, state) => {
      updateDownload(download.id, item, state === "completed" ? "completed" : state === "cancelled" ? "cancelled" : "interrupted");
      if (isUpdateDownload) {
        updateState = finishUpdateDownload(updateState, state, item.getSavePath());
        emitUpdateState();
        if (state === "completed") await openUpdateAndClose();
      }
    });
  });
  const initialCheck = setTimeout(() => checkForUpdates(), 5000);
  const periodicCheck = setInterval(() => checkForUpdates(), 15 * 60 * 1000);
  initialCheck.unref?.();
  periodicCheck.unref?.();
}

function downloadUpdate() {
  if (!availableUpdate || !mainWindow || mainWindow.isDestroyed()) {
    throw new Error("No update is available to download.");
  }
  if (updateState.checking || updateState.downloadStatus === "downloading") return false;
  const assetUrl = new URL(availableUpdate.asset.browser_download_url);
  if (assetUrl.hostname !== "github.com" || !availableUpdate.asset.name.endsWith(".dmg")) {
    throw new Error("The update download link is not valid.");
  }
  updateState = { ...updateState, downloadStatus: "downloading", downloadedPath: "", progress: 0, error: "" };
  emitUpdateState();
  mainWindow.webContents.downloadURL(assetUrl.href);
  return true;
}

function snapshot() {
  return {
    theme,
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
    bookmarks,
    remoteSuggestionsEnabled,
    downloads,
    update: updateState,
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
  const next = {
    url: wc.getURL(),
    title: wc.getTitle(),
    loading: wc.isLoading(),
    canGoBack: wc.navigationHistory.canGoBack(),
    canGoForward: wc.navigationHistory.canGoForward(),
  };
  if (Object.keys(next).every((key) => tab[key] === next[key])) return;
  Object.assign(tab, next);
  saveSession();
  sendState();
}

function recordHistory(tab) {
  if (!tab.url || isNewTab(tab.url) || tab.url.startsWith("devtools:")) return;
  history = [
    { title: tab.title || tab.url, url: tab.url, visitedAt: Date.now() },
    ...history.filter((item) => item.url !== tab.url),
  ].slice(0, 200);
  saveHistory();
  saveSession();
  sendState();
}

function toggleBookmark() {
  const tab = tabs.get(activeTabId);
  if (!tab || isNewTab(tab.url)) return;
  if (bookmarks.some((item) => item.url === tab.url)) bookmarks = bookmarks.filter((item) => item.url !== tab.url);
  else bookmarks = [{ url: tab.url, title: tab.title || tab.url }, ...bookmarks].slice(0, 200);
  saveBookmarks();
  sendState();
}

function removeBookmark(url) {
  bookmarks = bookmarks.filter((item) => item.url !== url);
  saveBookmarks();
  sendState();
}

async function clearBrowsingData() {
  const result = await dialog.showMessageBox(mainWindow, {
    type: "warning", buttons: ["Cancel", "Clear data"], defaultId: 0, cancelId: 0,
    title: "Clear browsing data", message: "Clear history, cookies, cache, and site data?",
    detail: "This signs you out of websites and removes locally stored site data. Downloads and bookmarks stay saved.",
  });
  if (result.response !== 1) return false;
  history = [];
  saveHistory();
  await session.defaultSession.clearStorageData({ storages: ["cookies", "localstorage", "indexdb", "serviceworkers", "cachestorage", "filesystem"] });
  await session.defaultSession.clearCache();
  sendState();
  return true;
}

function addDownload(item) {
  const id = String(nextDownloadId++);
  const entry = {
    id, filename: item.getFilename(), url: item.getURL(), path: item.getSavePath(),
    received: item.getReceivedBytes(), total: item.getTotalBytes(), state: "downloading", startedAt: Date.now(),
  };
  downloads = [entry, ...downloads].slice(0, 40);
  downloadItems.set(id, item);
  saveDownloads();
  return entry;
}

function updateDownload(id, item, state) {
  downloads = downloads.map((download) => download.id === id ? {
    ...download,
    filename: item.getFilename(), path: item.getSavePath(), received: item.getReceivedBytes(),
    total: item.getTotalBytes(), state: state || (item.isPaused() ? "paused" : "downloading"),
  } : download);
  if (state) downloadItems.delete(id);
  saveDownloads();
  sendState();
}

function handleShortcut(tab, event, input) {
  if (!input.meta && !input.control) return;
  const key = input.key.toLowerCase();
  if (key === "l") {
    event.preventDefault();
    mainWindow.webContents.focus();
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
    mainWindow.webContents.focus();
    mainWindow.webContents.send("browser:focus-address");
    view.webContents.once("did-finish-load", () => {
      if (activeTabId === id && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.focus();
      }
    });
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
  saveSession();
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
  saveSession();
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

const pendingPermissionPrompts = new Map();

async function requestExtensionPermissions(extension, permissions) {
  const requested = [
    ...(Array.isArray(permissions.permissions) ? permissions.permissions : []),
    ...(Array.isArray(permissions.origins) ? permissions.origins : []),
  ];
  const promptKey = `${extension.id}:${JSON.stringify([...requested].sort())}`;
  if (pendingPermissionPrompts.has(promptKey)) return pendingPermissionPrompts.get(promptKey);
  const prompt = dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: ["Allow", "Deny"],
    defaultId: 0,
    cancelId: 1,
    message: `Allow “${extension.name}” additional access?`,
    detail: requested.length
      ? requested.slice(0, 12).map((permission) => `• ${permission}`).join("\n")
      : "The extension requested additional access.",
    noLink: true,
  }).then(result => result.response === 0).finally(() => pendingPermissionPrompts.delete(promptKey));
  pendingPermissionPrompts.set(promptKey, prompt);
  return prompt;
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
      const popupWindow = new BrowserWindow({
        width: Math.max(360, Math.min(Number(details.width) || 460, 1100)),
        height: Math.max(280, Math.min(Number(details.height) || 680, 900)),
        minWidth: 320,
        minHeight: 240,
        show: true,
        title: details.type === "popup" ? "Aster extension" : "Aster",
        backgroundColor: theme === "dark" ? "#14232b" : "#F4F7F5",
        webPreferences: {
          session: browserSession,
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
        },
      });
      chromeExtensions.addTab(popupWindow.webContents, popupWindow);
      popupWindow.webContents.setWindowOpenHandler(({ url }) => {
        createTab(url);
        return { action: "deny" };
      });
      popupWindow.once("closed", () => {
        try { chromeExtensions.removeTab(popupWindow.webContents); } catch { /* Window is already gone. */ }
      });
      await popupWindow.loadURL(requestedUrl || newTabUrl());
      popupWindow.show();
      popupWindow.focus();
      return popupWindow;
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
    case "set-theme": return setTheme(payload?.theme);
    case "new-tab": return createTab();
    case "close-tab": return closeTab(payload?.id);
    case "activate-tab": return activateTab(payload?.id);
    case "navigate": return tab?.view.webContents.loadURL(normalizeInput(payload?.value));
    case "back": if (tab?.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack(); break;
    case "forward": if (tab?.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward(); break;
    case "reload": tab?.view.webContents.reload(); break;
    case "stop": tab?.view.webContents.stop(); break;
    case "home": return tab?.view.webContents.loadURL(newTabUrl());
    case "toggle-bookmark": return toggleBookmark();
    case "remove-bookmark": return removeBookmark(payload?.url);
    case "open-bookmark": return tab?.view.webContents.loadURL(normalizeInput(payload?.url));
    case "load-extension": return chooseExtension();
    case "remove-extension": return removeExtension(payload?.id);
    case "toggle-extension-pin": return toggleExtensionPin(payload?.id);
    case "open-web-store": return tab?.view.webContents.loadURL("https://chromewebstore.google.com/");
    case "open-external": return shell.openExternal(payload?.url);
    case "open-downloads": return shell.openPath(app.getPath("downloads"));
    case "open-download": return shell.openPath(payload?.path || "");
    case "show-download": if (payload?.path) shell.showItemInFolder(payload.path); break;
    case "cancel-download": downloadItems.get(String(payload?.id))?.cancel(); break;
    case "remove-download": downloads = downloads.filter((item) => item.id !== String(payload?.id)); saveDownloads(); sendState(); break;
    case "clear-browsing-data": return clearBrowsingData();
    case "clear-history": history = []; saveHistory(); sendState(); break;
    default: throw new Error(`Unknown browser command: ${type}`);
  }
  syncTab(tab);
  return null;
}

async function suggestSearches(_event, input) {
  if (!remoteSuggestionsEnabled) return [];
  const query = typeof input === "string" ? input.trim().slice(0, 160) : "";
  if (query.length < 2) return [];
  try {
    const response = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(2500),
      headers: { "User-Agent": "Aster-Browser" },
    });
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result?.[1]) ? result[1].filter((item) => typeof item === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
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
    backgroundColor: theme === "dark" ? "#14232b" : "#F4F7F5",
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
  mainWindow.on("focus", () => {
    if (Date.now() - lastUpdateCheck >= 5 * 60 * 1000) checkForUpdates();
  });
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const tab = tabs.get(activeTabId);
    if (tab) handleShortcut(tab, event, input);
  });
  mainWindow.on("closed", () => {
    saveSession();
    for (const tab of tabs.values()) tab.view.webContents.close();
    tabs.clear();
    mainWindow = null;
  });
  mainWindow.webContents.on("did-finish-load", () => {
    if (!tabs.size) restoreSession();
    sendState();
  });
}

app.whenReady().then(async () => {
  restoreTheme();
  restoreBrowserData();
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

app.on("before-quit", saveSession);

ipcMain.handle("browser:get-state", () => snapshot());
ipcMain.handle("browser:suggest-searches", suggestSearches);
ipcMain.handle("browser:command", handleCommand);
ipcMain.handle("browser:check-updates", checkForUpdates);
ipcMain.handle("browser:download-update", downloadUpdate);
async function openUpdateAndClose() {
  try {
    return await openDownloadedUpdate(updateState, app.getPath("downloads"), process.arch, (file) => shell.openPath(file), () => app.exit(0));
  } catch (error) {
    updateState = { ...updateState, error: error.message };
    emitUpdateState();
    return false;
  }
}

ipcMain.handle("browser:open-downloaded-update", openUpdateAndClose);
ipcMain.on("browser:overlay", (_event, open) => setOverlay(open));
