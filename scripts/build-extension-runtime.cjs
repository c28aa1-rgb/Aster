const fs = require("node:fs");
const path = require("node:path");

const sourcePath = require.resolve("electron-chrome-extensions/preload");
const outputPath = path.join(__dirname, "../electron/extension-runtime/dist/chrome-extension-api.preload.js");
const marker = "        privacy: {";
const electronContextMarker = `      disconnectNative
    };`;
const chromeSettingMarker = "      class ChromeSetting {";
const browserNamespaceMarker = "      delete globalThis.electron;";
const permissionRequestMarker = 'request: invokeExtension2("permissions.request"),';
const webRequestMarker = `              ...base,
              onHeadersReceived: new ExtensionEvent("webRequest.onHeadersReceived")`;
const proxyApi = `        proxy: {
          factory: (base) => ({
            ...base,
            settings: {
              get: invokeExtension2("proxy.settings.get"),
              set: invokeExtension2("proxy.settings.set"),
              clear: invokeExtension2("proxy.settings.clear"),
              onChange: new ExtensionEvent("proxy.settings.onChange")
            },
            onProxyError: new ExtensionEvent("proxy.onProxyError")
          })
        },
`;
const proxyAuthBridge = `      addProxyAuthListener: (extensionId, callback) => {
        const channel = \`aster-proxy-auth-\${extensionId}\`;
        const handler = async (_event, requestId, details) => {
          let finished = false;
          const respond = (result = {}) => {
            if (finished) return;
            finished = true;
            import_electron2.ipcRenderer.send("aster-proxy-auth-response", requestId, result || {});
          };
          try {
            const result = callback(details, respond);
            if (result && typeof result.then === "function") {
              const awaited = await result;
              if (awaited !== undefined) respond(awaited);
            } else if (result !== undefined) {
              respond(result);
            }
          } catch {
            respond({ cancel: true });
          }
        };
        callback.__asterProxyAuthHandler = handler;
        import_electron2.ipcRenderer.on(channel, handler);
        import_electron2.ipcRenderer.send("aster-proxy-auth-observe", extensionId, true);
      },
      removeProxyAuthListener: (extensionId, callback) => {
        const handler = callback.__asterProxyAuthHandler;
        if (handler) import_electron2.ipcRenderer.removeListener(\`aster-proxy-auth-\${extensionId}\`, handler);
        import_electron2.ipcRenderer.send("aster-proxy-auth-observe", extensionId, false);
      }
`;
const proxyAuthEvent = `      class ProxyAuthEvent {
        constructor() {
          this.listeners = [];
        }
        addListener(callback) {
          if (this.listeners.includes(callback)) return;
          this.listeners.push(callback);
          electron.addProxyAuthListener(extensionId, callback);
        }
        removeListener(callback) {
          this.listeners = this.listeners.filter((listener) => listener !== callback);
          electron.removeProxyAuthListener(extensionId, callback);
        }
        hasListener(callback) {
          return this.listeners.includes(callback);
        }
        hasListeners() {
          return this.listeners.length > 0;
        }
      }
`;
const permissionRequestApi = `request: (...args) => {
                const callback = typeof args[args.length - 1] === "function" ? args[args.length - 1] : null;
                const originalClose = window.close;
                let closeRequested = false;
                window.close = () => { closeRequested = true; };
                const restore = (granted) => {
                  window.close = originalClose;
                  if (closeRequested && !granted) originalClose.call(window);
                  return granted;
                };
                const request = invokeExtension2("permissions.request");
                if (callback) {
                  args[args.length - 1] = (granted) => { restore(granted); callback(granted); };
                  return request(...args);
                }
                return request(...args).then(restore, (error) => {
                  window.close = originalClose;
                  if (closeRequested) originalClose.call(window);
                  throw error;
                });
              },`;

const source = fs.readFileSync(sourcePath, "utf8");
if (![marker, electronContextMarker, chromeSettingMarker, webRequestMarker, browserNamespaceMarker, permissionRequestMarker].every((value) => source.includes(value))) {
  throw new Error("Unable to locate the extension API insertion point");
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const patched = source
  .replace(marker, `${proxyApi}${marker}`)
  .replace(electronContextMarker, `      disconnectNative,\n${proxyAuthBridge}    };`)
  .replace(chromeSettingMarker, `${proxyAuthEvent}${chromeSettingMarker}`)
  .replace(permissionRequestMarker, permissionRequestApi)
  // Electron exposes a partial native `browser` namespace. Webextension-polyfill
  // trusts it and skips its own wrappers, so bridge the supported namespaces too.
  .replace(browserNamespaceMarker, `      if (globalThis.browser?.runtime?.id) {\n        globalThis.browser = { ...globalThis.browser, ...chrome };\n      }\n${browserNamespaceMarker}`)
  .replace(webRequestMarker, `${webRequestMarker},\n              onAuthRequired: new ProxyAuthEvent()`);
fs.writeFileSync(outputPath, patched);
console.log(`Built ${path.relative(process.cwd(), outputPath)}`);
