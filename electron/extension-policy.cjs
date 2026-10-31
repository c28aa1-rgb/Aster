function parseExtensionPolicy(body) {
  const policy = JSON.parse(body);
  if (typeof policy?.disableExtensions !== "boolean") {
    throw new Error("Extension policy must set disableExtensions to a boolean.");
  }
  if (policy.minimumVersion != null && !/^\d+\.\d+\.\d+$/.test(policy.minimumVersion)) {
    throw new Error("Extension policy minimumVersion must be a semantic version or null.");
  }
  return { disableExtensions: policy.disableExtensions, minimumVersion: policy.minimumVersion || null };
}

module.exports = { parseExtensionPolicy };
