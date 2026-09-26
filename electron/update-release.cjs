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

module.exports = { compareVersions, findAvailableRelease };
