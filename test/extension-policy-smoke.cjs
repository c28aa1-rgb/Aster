const assert = require("node:assert/strict");
const { parseExtensionPolicy } = require("../electron/extension-policy.cjs");

assert.deepEqual(parseExtensionPolicy('{"disableExtensions":true}'), { disableExtensions: true, minimumVersion: null });
assert.deepEqual(parseExtensionPolicy('{"disableExtensions":false,"minimumVersion":"0.5.0"}'), { disableExtensions: false, minimumVersion: "0.5.0" });
assert.throws(() => parseExtensionPolicy("{}"), /must set disableExtensions/);
assert.throws(() => parseExtensionPolicy('{"disableExtensions":false,"minimumVersion":"latest"}'), /semantic version/);
console.log("EXTENSION_POLICY_VALIDATION_OK");
