const { app, session } = require("electron");
const os = require("node:os");
const path = require("node:path");
const { ElectronChromeExtensions } = require("electron-chrome-extensions");
const { installPatchedExtensionPreload } = require("../electron/extension-runtime.cjs");
const { installProxyExtensionApi } = require("../electron/proxy-extension-api.cjs");

app.setPath("userData", path.join(os.tmpdir(), `aster-vpn-api-smoke-${process.pid}`));

const watchdog = setTimeout(() => {
  console.error("VPN_API_SMOKE_FAILED", new Error("Timed out waiting for the extension worker"));
  app.exit(1);
}, 15000);

function waitFor(check, message, ms = 5000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const result = check();
      if (result) resolve(result);
      else if (Date.now() - started >= ms) reject(new Error(message));
      else setTimeout(poll, 25);
    };
    poll();
  });
}

app.whenReady().then(async () => {
  try {
    const browserSession = session.defaultSession;
    const extensionApis = new ElectronChromeExtensions({ license: "GPL-3.0", session: browserSession });
    installPatchedExtensionPreload(browserSession);
    const proxyApi = installProxyExtensionApi(extensionApis, browserSession);
    const extension = await browserSession.extensions.loadExtension(path.join(__dirname, "vpn-fixture"));
    const workerStart = browserSession.serviceWorkers.startWorkerForScope(`chrome-extension://${extension.id}/`);
    workerStart?.catch(() => {});
    const state = await waitFor(() => {
      const current = proxyApi.getState();
      return current.authObserverCount === 1 && current.hasProxyCredentials ? current : null;
    }, "VPN proxy credentials were not bridged from the extension worker");
    const resolvedProxy = await browserSession.resolveProxy("https://example.com/");
    if (!resolvedProxy.includes("127.0.0.1:65534")) throw new Error(`Unexpected proxy route: ${resolvedProxy}`);
    console.log(`VPN_API_SMOKE_OK ${JSON.stringify({ ...state, resolvedProxy })}`);
    clearTimeout(watchdog);
    proxyApi.dispose();
    app.exit(0);
  } catch (error) {
    console.error("VPN_API_SMOKE_FAILED", error);
    clearTimeout(watchdog);
    app.exit(1);
  }
});
