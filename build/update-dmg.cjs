const { build } = require("../package.json");

module.exports = {
  ...build,
  extends: null,
  mac: { ...build.mac, target: ["dmg"], artifactName: "Aster-Update-${version}-${arch}.${ext}" },
  dmg: {
    background: "build/update-dmg-background.png",
    title: "Aster Update",
    window: { width: 600, height: 400 },
    contents: [{ x: 300, y: 240, type: "file" }],
  },
};
