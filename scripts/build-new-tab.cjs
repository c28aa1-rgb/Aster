const path = require("node:path");
const { buildSync } = require("esbuild");

buildSync({
  entryPoints: [path.join(__dirname, "../src/new-tab.jsx")],
  outfile: path.join(__dirname, "../public/new-tab.js"),
  bundle: true,
  minify: true,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  target: "chrome140",
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "inline",
});
console.log("Built public/new-tab.js");
