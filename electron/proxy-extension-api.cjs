function formatProxyServer(server) {
  if (!server?.host) return "";
  const scheme = server.scheme && server.scheme !== "http" ? `${server.scheme}://` : "";
  const port = Number.isInteger(server.port) ? `:${server.port}` : "";
  return `${scheme}${server.host}${port}`;
}

function buildProxyRules(rules = {}) {
  if (rules.singleProxy) return formatProxyServer(rules.singleProxy);
  const entries = [
    ["http", rules.proxyForHttp],
    ["https", rules.proxyForHttps],
    ["ftp", rules.proxyForFtp],
    ["socks", rules.fallbackProxy],
  ];
  return entries
    .filter(([, server]) => server?.host)
    .map(([scheme, server]) => `${scheme}=${formatProxyServer(server)}`)
    .join(";");
}

function toElectronProxyConfig(value = {}) {
  switch (value.mode) {
    case "direct": return { mode: "direct" };
    case "system": return { mode: "system" };
    case "auto_detect": return { mode: "auto_detect" };
    case "pac_script": {
      const pacScript = value.pacScript?.url || (value.pacScript?.data
        ? `data:application/x-ns-proxy-autoconfig;base64,${Buffer.from(value.pacScript.data).toString("base64")}`
        : "");
      if (!pacScript) throw new Error("A PAC URL or PAC script body is required");
      return { mode: "pac_script", pacScript };
    }
    case "fixed_servers": {
      const proxyRules = buildProxyRules(value.rules);
      if (!proxyRules) throw new Error("At least one proxy server is required");
      return {
        mode: "fixed_servers",
        proxyRules,
        proxyBypassRules: Array.isArray(value.rules?.bypassList) ? value.rules.bypassList.join(",") : "",
      };
    }
    default:
      throw new Error(`Unsupported proxy mode: ${value.mode || "unknown"}`);
  }
}

function installProxyExtensionApi(extensionApis, browserSession) {
  let activeConfig = { mode: "system" };
  let controllingExtensionId = null;
  let cachedProxyCredentials = null;
  const authObservers = new Set();
  const pendingAuth = new Map();
  const observedWorkers = new Set();
  const router = extensionApis.ctx.router;
  const handle = router.apiHandler();

  const resultFor = (extensionId) => ({
    value: activeConfig,
    levelOfControl: !controllingExtensionId
      ? "controllable_by_this_extension"
      : controllingExtensionId === extensionId
        ? "controlled_by_this_extension"
        : "controlled_by_other_extensions",
  });

  const apply = async (extensionId, value) => {
    debug("apply requested", extensionId, JSON.stringify(value));
    if (controllingExtensionId && controllingExtensionId !== extensionId) {
      throw new Error("The proxy is controlled by another extension");
    }
    await browserSession.setProxy(toElectronProxyConfig(value));
    debug("proxy applied", extensionId);
    await browserSession.closeAllConnections();
    debug("connections closed", extensionId);
    activeConfig = value;
    controllingExtensionId = extensionId;
    cachedProxyCredentials = null;
    router.broadcastEvent("proxy.settings.onChange", resultFor(extensionId));
    setTimeout(() => requestCredentials(extensionId), 500);
  };

  const clear = async (extensionId) => {
    if (controllingExtensionId && controllingExtensionId !== extensionId) return;
    await browserSession.setProxy({ mode: "system" });
    await browserSession.closeAllConnections();
    activeConfig = { mode: "system" };
    controllingExtensionId = null;
    cachedProxyCredentials = null;
    router.broadcastEvent("proxy.settings.onChange", resultFor(extensionId));
  };

  handle("proxy.settings.get", (event) => resultFor(event.extension.id), { permission: "proxy" });
  handle("proxy.settings.set", async (event, details = {}) => {
    debug("settings.set handler", event.extension.id);
    await apply(event.extension.id, details.value);
  }, { permission: "proxy" });
  handle("proxy.settings.clear", async (event) => {
    await clear(event.extension.id);
  }, { permission: "proxy" });

  browserSession.extensions.on("extension-unloaded", (_event, extension) => {
    if (extension.id === controllingExtensionId) clear(extension.id).catch(console.error);
  });

  const handleAuthObservation = (_event, extensionId, observing) => {
    debug("auth observation", extensionId, observing);
    if (observing) {
      authObservers.add(extensionId);
      setTimeout(() => requestCredentials(extensionId), 500);
    }
    else authObservers.delete(extensionId);
  };
  const handleAuthResponse = (_event, requestId, result) => {
    debug("auth response", requestId, Boolean(result?.authCredentials));
    const pending = pendingAuth.get(requestId);
    if (!pending) return;
    pendingAuth.delete(requestId);
    clearTimeout(pending.timeoutId);
    const credentials = result?.authCredentials;
    if (credentials) cachedProxyCredentials = credentials;
    if (!pending.callback) return;
    if (result?.cancel || !credentials) pending.callback();
    else pending.callback(credentials.username || "", credentials.password || "");
  };
  const observeWorker = ({ runningStatus, versionId }) => {
    if (runningStatus !== "starting") return;
    const worker = browserSession.serviceWorkers.getWorkerFromVersionID(versionId);
    debug("worker starting", versionId, worker?.scope);
    if (!worker?.scope?.startsWith("chrome-extension://") || observedWorkers.has(worker)) return;
    observedWorkers.add(worker);
    worker.ipc.on("aster-proxy-auth-observe", handleAuthObservation);
    worker.ipc.on("aster-proxy-auth-response", handleAuthResponse);
    debug("worker IPC attached", worker.scope);
  };
  const handleLogin = (event, webContents, details, authInfo, callback) => {
    const extensionId = controllingExtensionId;
    debug("login challenge", {
      isProxy: authInfo.isProxy,
      extensionId,
      observing: extensionId ? authObservers.has(extensionId) : false,
      cached: Boolean(cachedProxyCredentials),
      url: details?.url,
      webContentsId: webContents?.id,
    });
    if (!authInfo.isProxy || !extensionId || !authObservers.has(extensionId)) return;
    event.preventDefault();
    if (cachedProxyCredentials) {
      callback(cachedProxyCredentials.username || "", cachedProxyCredentials.password || "");
    } else {
      callback();
    }
  };
  function requestCredentials(extensionId) {
    debug("credential prefetch", extensionId, {
      observing: authObservers.has(extensionId),
      cached: Boolean(cachedProxyCredentials),
      pending: pendingAuth.size,
    });
    if (!extensionId || !authObservers.has(extensionId) || cachedProxyCredentials) return;
    if ([...pendingAuth.values()].some((pending) => !pending.callback)) return;
    const server = activeConfig.rules?.singleProxy;
    if (!server?.host) {
      debug("credential prefetch skipped: no single proxy");
      return;
    }
    const requestId = crypto.randomUUID();
    const timeoutId = setTimeout(() => {
      if (!pendingAuth.has(requestId)) return;
      pendingAuth.delete(requestId);
    }, 8000);
    pendingAuth.set(requestId, { callback: null, timeoutId });
    let worker = null;
    try {
      const runningEntry = Object.entries(browserSession.serviceWorkers.getAllRunning())
        .find(([, runningWorker]) => runningWorker.scope === `chrome-extension://${extensionId}/`);
      const versionId = runningEntry ? Number(runningEntry[0]) : NaN;
      worker = Number.isFinite(versionId)
        ? browserSession.serviceWorkers.getWorkerFromVersionID(versionId)
        : null;
    } catch (error) {
      debug("credential prefetch skipped: worker disappeared", error);
    }
    if (!worker) {
      debug("credential prefetch skipped: worker not running");
      clearTimeout(timeoutId);
      pendingAuth.delete(requestId);
      return;
    }
    try {
      debug("sending auth challenge", extensionId, requestId, worker.scope);
      worker.send(`aster-proxy-auth-${extensionId}`, requestId, {
        requestId,
        url: "https://example.com/",
        method: "GET",
        statusCode: 407,
        statusLine: "Proxy Authentication Required",
        isProxy: true,
        challenger: { host: server.host, port: server.port },
      });
      debug("auth challenge sent", extensionId, requestId);
    } catch (error) {
      clearTimeout(timeoutId);
      pendingAuth.delete(requestId);
      debug("auth challenge failed", error);
    }
  }

  ipcMain.on("aster-proxy-auth-observe", handleAuthObservation);
  ipcMain.on("aster-proxy-auth-response", handleAuthResponse);
  browserSession.serviceWorkers.on("running-status-changed", observeWorker);
  app.on("login", handleLogin);

  return {
    getState: () => ({
      activeConfig,
      controllingExtensionId,
      authObserverCount: authObservers.size,
      hasProxyCredentials: Boolean(cachedProxyCredentials),
    }),
    dispose() {
      ipcMain.off("aster-proxy-auth-observe", handleAuthObservation);
      ipcMain.off("aster-proxy-auth-response", handleAuthResponse);
      browserSession.serviceWorkers.off("running-status-changed", observeWorker);
      for (const worker of observedWorkers) {
        worker.ipc.off("aster-proxy-auth-observe", handleAuthObservation);
        worker.ipc.off("aster-proxy-auth-response", handleAuthResponse);
      }
      app.off("login", handleLogin);
      for (const pending of pendingAuth.values()) {
        clearTimeout(pending.timeoutId);
        pending.callback?.();
      }
      pendingAuth.clear();
    },
  };
}

module.exports = { buildProxyRules, installProxyExtensionApi, toElectronProxyConfig };
const { app, ipcMain } = require("electron");
const crypto = require("node:crypto");

const debug = (...args) => {
  if (process.env.ASTER_PROXY_DEBUG === "1") console.log("ASTER_PROXY", ...args);
};
