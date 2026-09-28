const assert = require("node:assert/strict");
const { compareVersions, findAvailableRelease, parseAtomReleases } = require("../electron/update-release.cjs");

assert.equal(compareVersions("0.4.10", "0.4.9"), 1);
assert.equal(compareVersions("v0.4.3", "0.4.3"), 0);

const releases = [
  { tag_name: "v0.4.9", draft: true, assets: [{ name: "Aster-0.4.9-arm64.dmg" }] },
  { tag_name: "v0.5.0-beta.1", prerelease: true, assets: [{ name: "Aster-0.5.0-beta.1-arm64.dmg" }] },
  { tag_name: "v0.4.4", assets: [{ name: "Aster-0.4.4-x64.dmg" }] },
  { tag_name: "v0.4.3", assets: [{ name: "Aster-0.4.3-arm64.dmg" }] },
  { tag_name: "v0.4.5", assets: [{ name: "Aster-0.4.5-arm64.dmg" }] },
];

assert.equal(findAvailableRelease(releases, "0.4.3", "arm64")?.version, "0.4.5");
assert.equal(findAvailableRelease(releases, "0.4.3", "x64")?.version, "0.4.4");
assert.equal(findAvailableRelease(releases, "0.4.5", "arm64"), undefined);
const atom = '<entry><link href="https://github.com/c28aa1-rgb/Aster/releases/tag/v0.4.5"/><title>Aster 0.4.5</title><content type="html">&lt;h2&gt;Aster 0.4.5&lt;/h2&gt; &lt;li&gt;Dark mode&lt;/li&gt;</content></entry>';
const atomRelease = parseAtomReleases(atom, "arm64")[0];
assert.equal(atomRelease.tag_name, "v0.4.5");
assert.equal(atomRelease.assets[0].browser_download_url, "https://github.com/c28aa1-rgb/Aster/releases/download/v0.4.5/Aster-0.4.5-arm64.dmg");
assert.match(atomRelease.body, /Dark mode/);
console.log("UPDATE_RELEASE_SELECTION_OK");
