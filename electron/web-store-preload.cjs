const path = require("node:path");

function installPatchedWebStorePreload(browserSession) {
  browserSession.unregisterPreloadScript("electron-chrome-web-store");
  browserSession.registerPreloadScript({
    id: "electron-chrome-web-store",
    type: "frame",
    filePath: path.join(__dirname, "web-store.preload.js"),
  });
}

module.exports = { installPatchedWebStorePreload };
