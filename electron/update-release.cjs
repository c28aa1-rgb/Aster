const fs = require("node:fs/promises");
const path = require("node:path");

function finishUpdateDownload(update, status, downloadedPath) {
  return status === "completed"
    ? { ...update, downloadStatus: "downloaded", downloadedPath, progress: 100, error: "" }
    : { ...update, downloadStatus: "idle", downloadedPath: "", error: `Download ${status}.` };
}

async function openDownloadedUpdate(update, downloadsDirectory, arch, openPath) {
  const expectedPath = path.join(downloadsDirectory, `Aster-${update.version}-${arch}.dmg`);
  if (update.downloadStatus !== "downloaded" || update.downloadedPath !== expectedPath) {
    throw new Error("No downloaded update is ready to open.");
  }
  const file = await fs.lstat(expectedPath).catch(() => null);
  if (!file?.isFile()) throw new Error("The downloaded update is missing. Download it again.");
  const error = await openPath(expectedPath);
  if (error) throw new Error(`Could not open the downloaded update: ${error}`);
  return true;
}

function compareVersions(left, right) {
  const parse = (version) => String(version).replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10));
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

function findAvailableRelease(releases, currentVersion, arch) {
  return releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => ({ ...release, version: String(release.tag_name || "").replace(/^v/i, "") }))
    .filter((release) => /^\d+\.\d+\.\d+$/.test(release.version) && compareVersions(release.version, currentVersion) > 0)
    .sort((left, right) => compareVersions(right.version, left.version))
    .map((release) => ({
      ...release,
      asset: release.assets?.find((asset) => asset.name === `Aster-${release.version}-${arch}.dmg`),
    }))
    .find((release) => release.asset);
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function parseAtomReleases(xml, arch) {
  return [...String(xml || "").matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => {
    const entry = match[1];
    const title = decodeXml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
    const tag = entry.match(/releases\/tag\/(v[^<"]+)/)?.[1] || title.match(/v?\d+\.\d+\.\d+/)?.[0];
    const version = String(tag || "").replace(/^v/i, "");
    const content = decodeXml(entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1])
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!/^\d+\.\d+\.\d+$/.test(version)) return null;
    return {
      tag_name: `v${version}`,
      draft: false,
      prerelease: false,
      body: content,
      assets: [{
        name: `Aster-${version}-${arch}.dmg`,
        browser_download_url: `https://github.com/c28aa1-rgb/Aster/releases/download/v${version}/Aster-${version}-${arch}.dmg`,
      }],
    };
  }).filter(Boolean);
}

module.exports = { compareVersions, findAvailableRelease, parseAtomReleases, finishUpdateDownload, openDownloadedUpdate };
