const fs = require("node:fs");
const path = require("node:path");

const sourcePath = require.resolve("electron-chrome-web-store/preload");
const outputPath = path.join(__dirname, "../electron/web-store.preload.js");
let source = fs.readFileSync(sourcePath, "utf8");

const replacements = [
  [
    "    const management = {",
    "    const managementListeners = { installed: new Map(), uninstalled: new Map() };\n    const management = {",
  ],
  [
    '          import_electron.ipcRenderer.on("chrome.management.onInstalled", callback);',
    '          if (!managementListeners.installed.has(callback)) {\n            const listener = (_event, extension) => callback(extension);\n            managementListeners.installed.set(callback, listener);\n            import_electron.ipcRenderer.on("chrome.management.onInstalled", listener);\n          }',
  ],
  [
    '          import_electron.ipcRenderer.removeListener("chrome.management.onInstalled", callback);',
    '          const listener = managementListeners.installed.get(callback);\n          if (listener) {\n            import_electron.ipcRenderer.removeListener("chrome.management.onInstalled", listener);\n            managementListeners.installed.delete(callback);\n          }',
  ],
  [
    '          import_electron.ipcRenderer.on("chrome.management.onUninstalled", callback);',
    '          if (!managementListeners.uninstalled.has(callback)) {\n            const listener = (_event, id) => callback(id);\n            managementListeners.uninstalled.set(callback, listener);\n            import_electron.ipcRenderer.on("chrome.management.onUninstalled", listener);\n          }',
  ],
  [
    '          import_electron.ipcRenderer.removeListener("chrome.management.onUninstalled", callback);',
    '          const listener = managementListeners.uninstalled.get(callback);\n          if (listener) {\n            import_electron.ipcRenderer.removeListener("chrome.management.onUninstalled", listener);\n            managementListeners.uninstalled.delete(callback);\n          }',
  ],
];

for (const [original, replacement] of replacements) {
  if (!source.includes(original)) throw new Error(`Web Store preload changed; cannot apply Aster event fix: ${original}`);
  source = source.replace(original, replacement);
}

fs.writeFileSync(outputPath, source);
console.log(`Built ${path.relative(process.cwd(), outputPath)}`);
