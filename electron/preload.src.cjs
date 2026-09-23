const { contextBridge, ipcRenderer } = require("electron");
const { injectBrowserAction } = require("electron-chrome-extensions/browser-action");

injectBrowserAction();

contextBridge.exposeInMainWorld("aster", {
  getState: () => ipcRenderer.invoke("browser:get-state"),
  command: (type, payload) => ipcRenderer.invoke("browser:command", { type, payload }),
  setOverlay: (open) => ipcRenderer.send("browser:overlay", Boolean(open)),
  onState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("browser:state", handler);
    return () => ipcRenderer.removeListener("browser:state", handler);
  },
  onFocusAddress: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("browser:focus-address", handler);
    return () => ipcRenderer.removeListener("browser:focus-address", handler);
  },
  onDismissOverlay: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("browser:dismiss-overlay", handler);
    return () => ipcRenderer.removeListener("browser:dismiss-overlay", handler);
  },
});
