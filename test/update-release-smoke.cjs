const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { compareVersions, findAvailableRelease, parseAtomReleases, finishUpdateDownload, openDownloadedUpdate } = require("../electron/update-release.cjs");

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

async function checkDownloadedUpdate() {
  const downloads = await fs.mkdtemp(path.join(os.tmpdir(), "aster-update-"));
  try {
    const downloadedPath = path.join(downloads, "Aster-0.4.5-arm64.dmg");
    const downloading = { version: "0.4.5", downloadStatus: "downloading", downloadedPath: "", progress: 50, error: "" };
    const downloaded = finishUpdateDownload(downloading, "completed", downloadedPath);
    assert.equal(downloaded.downloadStatus, "downloaded");
    assert.equal(downloaded.downloadedPath, downloadedPath);
    assert.equal(downloaded.progress, 100);
    assert.equal(downloading.downloadedPath, "");
    const interrupted = finishUpdateDownload(downloaded, "interrupted", downloadedPath);
    assert.equal(interrupted.downloadStatus, "idle");
    assert.equal(interrupted.downloadedPath, "");
    assert.equal(interrupted.error, "Download interrupted.");

    let opened = [];
    const openPath = async (file) => { opened.push(file); return ""; };
    await assert.rejects(openDownloadedUpdate(downloaded, downloads, "arm64", openPath), /missing/);
    await fs.writeFile(downloadedPath, "test disk image");
    for (const invalid of [
      downloading,
      { ...downloaded, downloadedPath: "" },
      { ...downloaded, downloadedPath: path.join(os.tmpdir(), "other.dmg") },
      { ...downloaded, downloadedPath: path.join(downloads, "installer.app") },
    ]) {
      await assert.rejects(openDownloadedUpdate(invalid, downloads, "arm64", openPath), /No downloaded update/);
    }
    await assert.rejects(openDownloadedUpdate(downloaded, downloads, "x64", openPath), /No downloaded update/);
    assert.deepEqual(opened, []);
    assert.equal(await openDownloadedUpdate(downloaded, downloads, "arm64", openPath), true);
    assert.deepEqual(opened, [downloadedPath]);
    await assert.rejects(openDownloadedUpdate(downloaded, downloads, "arm64", async () => "Launch failed"), /Launch failed/);
    await assert.rejects(openDownloadedUpdate(downloaded, downloads, "arm64", async () => { throw new Error("Shell failed"); }), /Shell failed/);

    await fs.unlink(downloadedPath);
    const target = path.join(downloads, "other.dmg");
    await fs.writeFile(target, "other disk image");
    await fs.symlink(target, downloadedPath);
    opened = [];
    await assert.rejects(openDownloadedUpdate(downloaded, downloads, "arm64", openPath), /missing/);
    await fs.unlink(downloadedPath);
    await fs.mkdir(downloadedPath);
    await assert.rejects(openDownloadedUpdate(downloaded, downloads, "arm64", openPath), /missing/);
    assert.deepEqual(opened, []);
    console.log("DOWNLOADED_UPDATE_OPEN_OK");
  } finally {
    await fs.rm(downloads, { recursive: true, force: true });
  }
}

checkDownloadedUpdate().catch((error) => { console.error(error); process.exitCode = 1; });
