const path = require("node:path");

function installPatchedExtensionPreload(browserSession) {
  const preloadPath = path.join(__dirname, "extension-runtime/dist/chrome-extension-api.preload.js");
  for (const id of ["crx-mv2-preload", "crx-mv3-preload"]) {
    try {
      browserSession.unregisterPreloadScript(id);
    } catch {
      // The upstream preload may not have registered yet on older Electron releases.
    }
  }
  browserSession.registerPreloadScript({ id: "crx-mv2-preload", type: "frame", filePath: preloadPath });
  browserSession.registerPreloadScript({ id: "crx-mv3-preload", type: "service-worker", filePath: preloadPath });
}

module.exports = { installPatchedExtensionPreload };
