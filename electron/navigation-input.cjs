const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function normalizeInput(value, newTabUrl) {
  const input = String(value || "").trim();
  if (!input) return newTabUrl;
  if (/^(https?|file|chrome-extension):\/\//i.test(input)) return input;
  if (path.isAbsolute(input) && /\.html?$/i.test(input) && fs.existsSync(input)) return pathToFileURL(input).href;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(input)) return `http://${input}`;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(input)) return `https://${input}`;
  return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
}

module.exports = { normalizeInput };
