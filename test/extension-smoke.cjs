const { app, session } = require("electron");
const path = require("node:path");
const os = require("node:os");

app.setPath("userData", path.join(os.tmpdir(), `aster-extension-smoke-${process.pid}`));

app.whenReady().then(async () => {
  try {
    const extensionPath = path.join(__dirname, "extension");
    const extension = await session.defaultSession.extensions.loadExtension(extensionPath, { allowFileAccess: true });
    console.log(`EXTENSION_SMOKE_OK ${extension.name} ${extension.version}`);
    app.exit(0);
  } catch (error) {
    console.error("EXTENSION_SMOKE_FAILED", error);
    app.exit(1);
  }
});
