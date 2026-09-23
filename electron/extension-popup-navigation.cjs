function isExternalPopupNavigation(currentUrl, nextUrl) {
  try {
    const current = new URL(currentUrl);
    const next = new URL(nextUrl, currentUrl);
    return current.protocol === "chrome-extension:" && next.origin !== current.origin;
  } catch {
    return false;
  }
}

function installExtensionPopupNavigation(extensionApis, openTab) {
  let activePopup = null;

  const closePopup = () => {
    const popup = activePopup;
    activePopup = null;
    if (!popup) return;
    setImmediate(() => {
      if (!popup.isDestroyed()) popup.destroy();
    });
  };

  const openFromPopup = (popup, url) => {
    if (!url || url === "about:blank") return;
    openTab(url);
    if (activePopup === popup) closePopup();
  };

  const handlePopup = (popup) => {
    activePopup = popup;
    const popupWindow = popup.browserWindow;
    const popupContents = popupWindow?.webContents;
    if (!popupWindow || !popupContents) return;

    popupContents.setWindowOpenHandler(({ url }) => {
      openFromPopup(popup, url);
      return { action: "deny" };
    });

    popupContents.on("will-navigate", (event, url) => {
      if (!isExternalPopupNavigation(popupContents.getURL(), url)) return;
      event.preventDefault();
      openFromPopup(popup, url);
    });

    popupWindow.once("closed", () => {
      if (activePopup === popup) activePopup = null;
    });
  };

  extensionApis.on("browser-action-popup-created", handlePopup);

  return {
    closePopup,
    dispose() {
      extensionApis.off("browser-action-popup-created", handlePopup);
      closePopup();
    },
  };
}

module.exports = { installExtensionPopupNavigation, isExternalPopupNavigation };
