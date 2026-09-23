chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  document.getElementById("status").textContent = tab?.title || "Active tab ready";
  document.documentElement.dataset.tabApi = "ok";
});

document.getElementById("control").addEventListener("click", () => {
  document.getElementById("control").textContent = "Control works";
});

document.getElementById("open-tab").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://example.invalid/from-tabs-create" });
});

document.getElementById("open-window").addEventListener("click", () => {
  window.open("https://example.invalid/from-window-open", "_blank");
});
