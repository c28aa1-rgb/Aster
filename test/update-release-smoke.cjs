const assert = require("node:assert/strict");
const { compareVersions, findAvailableRelease } = require("../electron/update-release.cjs");

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
console.log("UPDATE_RELEASE_SELECTION_OK");
