chrome.webRequest.onAuthRequired.addListener(
  (_details, callback) => callback({ authCredentials: { username: "aster-user", password: "aster-pass" } }),
  { urls: ["<all_urls>"] },
  ["asyncBlocking"],
);

chrome.proxy.settings.set({
  value: {
    mode: "fixed_servers",
    rules: { singleProxy: { scheme: "http", host: "127.0.0.1", port: 65534 } },
  },
  scope: "regular",
});
