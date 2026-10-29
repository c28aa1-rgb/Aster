const assert = require("node:assert/strict");
const { parseExtensionPolicy } = require("../electron/extension-policy.cjs");

assert.equal(parseExtensionPolicy('{"disableExtensions":true}'), true);
assert.equal(parseExtensionPolicy('{"disableExtensions":false}'), false);
assert.throws(() => parseExtensionPolicy("{}"), /must set disableExtensions/);
console.log("EXTENSION_POLICY_VALIDATION_OK");
