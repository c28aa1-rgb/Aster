function parseExtensionPolicy(body) {
  const policy = JSON.parse(body);
  if (typeof policy?.disableExtensions !== "boolean") {
    throw new Error("Extension policy must set disableExtensions to a boolean.");
  }
  return policy.disableExtensions;
}

module.exports = { parseExtensionPolicy };
