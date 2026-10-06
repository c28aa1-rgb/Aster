const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { normalizeInput } = require("../electron/navigation-input.cjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aster-html-navigation-"));
try {
  const htmlPath = path.join(dir, "extension help.html");
  fs.writeFileSync(htmlPath, "<!doctype html><title>Help</title>");
  assert.equal(normalizeInput(htmlPath, "file:///new-tab.html"), pathToFileURL(htmlPath).href);
  assert.equal(normalizeInput("chrome-extension://abcdefghijklmnop/options.html", "file:///new-tab.html"), "chrome-extension://abcdefghijklmnop/options.html");
  assert.equal(normalizeInput("search words", "file:///new-tab.html"), "https://www.google.com/search?q=search%20words");
  assert.equal(normalizeInput("", "file:///new-tab.html"), "file:///new-tab.html");
  console.log("NAVIGATION_INPUT_SMOKE_OK");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
