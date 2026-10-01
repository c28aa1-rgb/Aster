import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  CircleArrowDown,
  CheckCircle2,
  Download,
  ExternalLink,
  History,
  Home,
  LoaderCircle,
  Settings,
  Moon,
  Pin,
  PinOff,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const emptyState = { activeTabId: null, tabs: [], extensions: [], history: [], update: { checking: false, available: false } };
const previewState = {
  activeTabId: "1",
  tabs: [{ id: "1", title: "New tab", url: "", favicon: "", loading: false, canGoBack: false, canGoForward: false }],
  extensions: [],
  history: [],
};
const bridge = window.aster || {
  getState: async () => previewState,
  command: async () => null,
  setOverlay: () => {},
  onState: () => () => {},
  checkForUpdates: async () => null,
  downloadUpdate: async () => null,
  openDownloadedUpdate: async () => null,
  onFocusAddress: () => () => {},
  onDismissOverlay: () => () => {},
};
const spring = { type: "spring", stiffness: 520, damping: 40, mass: 0.7 };

function IconButton({ label, disabled, active, children, onClick }) {
  return (
    <motion.button
      className={`icon-button${active ? " is-active" : ""}`}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.91 }}
      transition={spring}
    >
      {children}
    </motion.button>
  );
}

function Tab({ tab, active, onActivate, onClose, reduceMotion }) {
  return (
    <motion.div
      layout
      className={`tab${active ? " is-active" : ""}`}
      onClick={onActivate}
      initial={reduceMotion ? false : { opacity: 0, x: -12, maxWidth: 0, minWidth: 0, paddingLeft: 0, paddingRight: 0 }}
      animate={{ opacity: 1, x: 0, maxWidth: 228, minWidth: 132, paddingLeft: 12, paddingRight: 8 }}
      exit={reduceMotion ? { opacity: 0, maxWidth: 0, minWidth: 0, transition: { duration: 0.01 } } : { opacity: 0, x: -8, maxWidth: 0, minWidth: 0, paddingLeft: 0, paddingRight: 0, borderWidth: 0 }}
      transition={reduceMotion ? { duration: 0.01 } : { layout: spring, maxWidth: { duration: 0.22, ease: [0.2, 0, 0, 1] }, opacity: { duration: 0.15 }, x: { duration: 0.22, ease: [0.2, 0, 0, 1] } }}
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
    >
      {active && <motion.span className="tab-light" layoutId="active-tab" transition={spring} />}
      <span className="favicon-shell">
        {tab.loading ? (
          <LoaderCircle className="spin" size={14} />
        ) : tab.favicon ? (
          <img src={tab.favicon} alt="" />
        ) : (
          <Sparkles size={13} />
        )}
      </span>
      <span className="tab-title">{tab.title}</span>
      <button
        className="tab-close"
        type="button"
        aria-label={`Close ${tab.title}`}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <X size={13} />
      </button>
    </motion.div>
  );
}

function PinnedExtensionAction({ extension, tabId }) {
  const hostRef = useRef(null);

  useEffect(() => {
    let disposed = false;
    let actionNode;
    const handleActionUpdate = () => actionNode?.update?.();
    const mountAction = async () => {
      if (!hostRef.current || !window.browserAction || !customElements.get("browser-action")) return;
      window.browserAction.addObserver("_self");
      window.browserAction.addEventListener("update", handleActionUpdate);
      await window.browserAction.getState("_self");
      if (disposed || !hostRef.current) return;
      actionNode = document.createElement("button", { is: "browser-action" });
      actionNode.id = extension.id;
      actionNode.className = "pinned-action-button";
      actionNode.title = extension.name;
      actionNode.setAttribute("aria-label", extension.name);
      actionNode.setAttribute("tab", String(tabId ?? -1));
      actionNode.setAttribute("alignment", "bottom left");
      hostRef.current.appendChild(actionNode);
    };
    mountAction().catch(console.error);
    return () => {
      disposed = true;
      window.browserAction?.removeEventListener("update", handleActionUpdate);
      window.browserAction?.removeObserver("_self");
      actionNode?.remove();
    };
  }, [extension.id, extension.name, tabId]);

  return <span className="pinned-action-host" ref={hostRef} />;
}

function ExtensionsPanel({ extensions, onBrowseStore, onLoad, onRemove, onTogglePin, error, loading }) {
  return (
    <div className="panel-content">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Chromium extensions</p>
          <h1>Make Aster yours.</h1>
          <p>Install from the Chrome Web Store, or load a local unpacked extension.</p>
          <small className="panel-hint">Pin an extension here to place its controls in the toolbar.</small>
        </div>
        <div className="extension-actions">
          <motion.button className="secondary-button" type="button" onClick={onLoad} whileTap={{ scale: 0.97 }}>
            {loading ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
            Load unpacked
          </motion.button>
          <motion.button className="primary-button" type="button" onClick={onBrowseStore} whileTap={{ scale: 0.97 }}>
            <Store size={17} /> Chrome Web Store
          </motion.button>
        </div>
      </div>

      {error && (
        <motion.div className="error-callout" initial={{ x: -8, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
          <CircleAlert size={18} /> {error}
        </motion.div>
      )}

      <div className="extension-list">
        {extensions.length ? extensions.map((extension) => (
          <motion.article className="extension-row" layout key={extension.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="extension-mark"><Puzzle size={19} /></div>
            <div className="extension-copy">
              <strong>{extension.name}</strong>
              <span>Version {extension.version} · {extension.source === "store" ? "Chrome Web Store" : "Local folder"}</span>
              <small>{extension.path}</small>
            </div>
            <div className="extension-row-actions">
              <span className="loaded-pill"><Check size={13} /> Loaded</span>
              {extension.hasAction ? (
                <button
                  className={`text-button pin-button${extension.pinned ? " is-pinned" : ""}`}
                  type="button"
                  aria-pressed={extension.pinned}
                  onClick={() => onTogglePin(extension.id)}
                >
                  {extension.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                  {extension.pinned ? "Unpin" : "Pin"}
                </button>
              ) : (
                <span className="no-action-label">No toolbar control</span>
              )}
              <button className="text-button danger" type="button" onClick={() => onRemove(extension.id)}>Remove</button>
            </div>
          </motion.article>
        )) : (
          <div className="empty-state">
            <div className="empty-orbit"><Puzzle size={25} /></div>
            <h2>No extensions loaded</h2>
            <p>Browse the Chrome Web Store or choose a folder containing <code>manifest.json</code>.</p>
          </div>
        )}
      </div>

      <div className="support-note">
        <ShieldCheck size={18} />
        <p>Web Store extensions update automatically. All extensions load into Aster’s persistent Chromium session.</p>
      </div>
    </div>
  );
}

function HistoryPanel({ items, onOpen, onClear }) {
  const format = (timestamp) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(timestamp);
  return (
    <div className="panel-content history-content">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Recent paths</p>
          <h1>History</h1>
          <p>Your latest destinations in this session.</p>
        </div>
        {items.length > 0 && <button className="text-button" type="button" onClick={onClear}>Clear history</button>}
      </div>
      <div className="history-list">
        {items.length ? items.map((item) => (
          <button key={`${item.url}-${item.visitedAt}`} type="button" className="history-row" onClick={() => onOpen(item.url)}>
            <span className="history-time">{format(item.visitedAt)}</span>
            <span><strong>{item.title}</strong><small>{item.url}</small></span>
            <ExternalLink size={15} />
          </button>
        )) : (
          <div className="empty-state"><div className="empty-orbit"><History size={25} /></div><h2>Nothing here yet</h2><p>Pages you visit will appear here.</p></div>
        )}
      </div>
    </div>
  );
}

function UpdatePanel({ update, onCheck, onDownload, onOpen }) {
  const downloaded = update.downloadStatus === "downloaded";
  const downloading = update.downloadStatus === "downloading";
  return (
    <div className="panel-content update-content">
      <div className="panel-heading">
        <div>
          <div className="update-title-row"><span className="update-hero-icon"><CircleArrowDown size={22} /></span><p className="panel-kicker">Aster release</p></div>
          <h1>Update available</h1>
          <p>Aster {update.version} is ready. Download it when you’re ready to install.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onCheck} disabled={update.checking}>
          <RefreshCw className={update.checking ? "spin" : ""} size={16} />
          {update.checking ? "Checking…" : "Check again"}
        </button>
      </div>
      {update.error && <div className="error-callout"><CircleAlert size={18} /> {update.error}</div>}
      <section className="release-notes">
        <p className="panel-kicker">What changed</p>
        <pre>{update.notes || "No release notes were provided."}</pre>
      </section>
      <div className="update-download">
        <button className="primary-button" type="button" disabled={update.checking || downloading || (downloaded && !update.error)} onClick={onDownload}>
          {downloaded ? <CheckCircle2 size={17} /> : <CircleArrowDown size={17} />}
          {downloaded ? update.error ? "Download again" : "Download complete" : downloading ? `Downloading ${update.progress || 0}%` : "Download update"}
        </button>
        {downloaded && <button className="secondary-button" type="button" onClick={onOpen}><ExternalLink size={17} />Open downloaded update</button>}
        {downloading && <div className="update-progress-wrap"><div className="update-progress-label"><span>Downloading Aster {update.version}</span><strong>{update.progress || 0}%</strong></div><progress max="100" value={update.progress || 0} aria-label="Download progress" /></div>}
        {downloaded && <div className="download-complete"><CheckCircle2 size={16} /><span>Ready in your Downloads folder</span></div>}
        <p>
          {downloaded
            ? `${update.assetName} is ready. Open the downloaded update, then replace Aster to finish installing.`
            : "Save the update to Downloads, then open it and replace Aster to finish installing."}
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(emptyState);
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const [panel, setPanel] = useState(null);
  const [extensionError, setExtensionError] = useState("");
  const [loadingExtension, setLoadingExtension] = useState(false);
  const addressRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const activeTab = useMemo(() => state.tabs.find((tab) => tab.id === state.activeTabId), [state]);
  const pinnedExtensions = useMemo(
    () => state.extensions.filter((extension) => extension.pinned && extension.hasAction),
    [state.extensions],
  );
  const focusAddress = () => {
    requestAnimationFrame(() => {
      addressRef.current?.focus();
      addressRef.current?.select();
    });
  };

  useEffect(() => {
    bridge.getState().then(setState);
    const offState = bridge.onState(setState);
    const offFocus = bridge.onFocusAddress(() => {
      setPanel(null);
      focusAddress();
    });
    const offDismissOverlay = bridge.onDismissOverlay(() => setPanel(null));
    return () => { offState(); offFocus(); offDismissOverlay(); };
  }, []);

  useEffect(() => {
    if (!editing) setAddress(activeTab?.url || "");
  }, [activeTab?.url, editing]);

  useEffect(() => {
    if (!panel && activeTab && !activeTab.url) focusAddress();
  }, [activeTab?.id, panel]);

  useEffect(() => {
    bridge.setOverlay(Boolean(panel));
  }, [panel]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme || "light";
  }, [state.theme]);

  const command = (type, payload) => bridge.command(type, payload);
  const openPanel = (name) => setPanel((current) => current === name ? null : name);
  const navigate = (value = address) => {
    setEditing(false);
    setPanel(null);
    command("navigate", { value });
  };

  const loadExtension = async () => {
    setExtensionError("");
    setLoadingExtension(true);
    try {
      await command("load-extension");
    } catch (error) {
      setExtensionError(error.message || "The extension could not be loaded.");
    } finally {
      setLoadingExtension(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="browser-chrome">
        <div className="tab-strip" role="tablist" aria-label="Open tabs">
          <div className="traffic-light-space" />
          <div className="tabs-scroll">
            <AnimatePresence initial={false}>
              {state.tabs.map((tab) => (
                <Tab
                  key={tab.id}
                  tab={tab}
                  active={tab.id === state.activeTabId}
                  reduceMotion={reduceMotion}
                  onActivate={() => command("activate-tab", { id: tab.id })}
                  onClose={() => command("close-tab", { id: tab.id })}
                />
              ))}
            </AnimatePresence>
          </div>
          <IconButton label="New tab" onClick={() => command("new-tab")}><Plus size={16} /></IconButton>
          <div className="window-drag" />
        </div>

        <div className="toolbar">
          <div className="nav-cluster">
            <IconButton label="Back" disabled={!activeTab?.canGoBack} onClick={() => command("back")}><ArrowLeft size={17} /></IconButton>
            <IconButton label="Forward" disabled={!activeTab?.canGoForward} onClick={() => command("forward")}><ArrowRight size={17} /></IconButton>
            <IconButton label={activeTab?.loading ? "Stop" : "Reload"} onClick={() => command(activeTab?.loading ? "stop" : "reload")}>
              {activeTab?.loading ? <X size={16} /> : <RefreshCw size={16} />}
            </IconButton>
            <IconButton label="New tab home" onClick={() => command("home")}><Home size={16} /></IconButton>
          </div>

          <form className={`address-field${editing ? " is-editing" : ""}`} onSubmit={(event) => { event.preventDefault(); navigate(); }}>
            <Search className="address-search" size={16} />
            <input
              ref={addressRef}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              onFocus={() => setEditing(true)}
              onBlur={() => setEditing(false)}
              placeholder="Search or enter an address"
              aria-label="Search or enter an address"
              spellCheck={false}
            />
            {activeTab?.url?.startsWith("https://") && <span className="secure-mark"><ShieldCheck size={14} /> Secure</span>}
          </form>

          <div className="action-cluster">
            {pinnedExtensions.length > 0 && (
              <div className="pinned-actions" aria-label="Pinned extensions">
                {pinnedExtensions.map((extension) => (
                  <PinnedExtensionAction
                    key={extension.id}
                    extension={extension}
                    tabId={activeTab?.webContentsId}
                  />
                ))}
              </div>
            )}
            <IconButton label="Open downloads folder" onClick={() => command("open-downloads")}><Download size={16} /></IconButton>
            {state.update?.available && (
              <IconButton label={`Update available: Aster ${state.update.version}`} active={panel === "update"} onClick={() => openPanel("update")}>
                <CircleArrowDown size={17} /><span className="update-dot" />
              </IconButton>
            )}
            <IconButton label="History" active={panel === "history"} onClick={() => openPanel("history")}><History size={16} /></IconButton>
            <IconButton label="Extensions" active={panel === "extensions"} onClick={() => openPanel("extensions")}>
              <Puzzle size={16} />
              {state.extensions.length > 0 && <span className="extension-count">{state.extensions.length}</span>}
            </IconButton>
            <IconButton label="Settings" active={panel === "settings"} onClick={() => openPanel("settings")}><Settings size={18} /></IconButton>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {panel && (
          <motion.main
            className="panel-layer"
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.998 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.36, ease: [0.4, 0, 0.2, 1] }}
          >
            <button className="panel-close" type="button" aria-label="Close panel" onClick={() => setPanel(null)}><X size={18} /></button>
            {panel === "update" ? (
              <UpdatePanel
                update={state.update || {}}
                onCheck={() => bridge.checkForUpdates().catch(console.error)}
                onDownload={() => bridge.downloadUpdate().catch((error) => console.error("Update download failed:", error))}
                onOpen={() => bridge.openDownloadedUpdate().catch((error) => console.error("Opening update failed:", error))}
              />
            ) : panel === "extensions" ? (
              <ExtensionsPanel
                extensions={state.extensions}
                onBrowseStore={() => {
                  setPanel(null);
                  command("open-web-store");
                }}
                onLoad={loadExtension}
                onRemove={(id) => command("remove-extension", { id })}
                onTogglePin={(id) => command("toggle-extension-pin", { id })}
                error={extensionError}
                loading={loadingExtension}
              />
            ) : panel === "history" ? (
              <HistoryPanel
                items={state.history}
                onOpen={(url) => navigate(url)}
                onClear={() => command("clear-history")}
              />
            ) : (
              <div className="panel-content about-content">
                <p className="panel-kicker">Make Aster yours</p>
                <h1>Settings</h1>
                <div className="appearance-setting">
                  <Moon size={21} aria-hidden="true" />
                  <div><strong id="dark-mode-label">Dark mode</strong><p>A softer glow for late-night browsing.</p></div>
                  <button className="theme-switch" type="button" role="switch" aria-checked={state.theme === "dark"} aria-labelledby="dark-mode-label"
                    onClick={() => command("set-theme", { theme: state.theme === "dark" ? "light" : "dark" }).catch(console.error)}>
                    <span />
                  </button>
                </div>
                <button className="secondary-button about-update-check" type="button" onClick={() => bridge.checkForUpdates().catch(console.error)} disabled={state.update?.checking}>
                  <RefreshCw className={state.update?.checking ? "spin" : ""} size={16} />
                  {state.update?.checking ? "Checking for updates…" : state.update?.available ? `Aster ${state.update.version} is available` : "Check for updates"}
                </button>
                {state.update?.error && <p className="update-check-error">{state.update.error}</p>}
                <p className="about-lede">Built on Chromium with a compact macOS shell, native tab isolation, and persistent unpacked extensions.</p>
                <div className="about-grid">
                  <div><ShieldCheck size={19} /><strong>Chromium core</strong><span>Modern site compatibility and sandboxed web contents.</span></div>
                  <div><Puzzle size={19} /><strong>Extension ready</strong><span>Pin extension actions, open their popups, and use them against the active tab.</span></div>
                  <div><Sparkles size={19} /><strong>Designed for focus</strong><span>Purposeful motion, quiet controls, and generous space.</span></div>
                </div>
              </div>
            )}
          </motion.main>
        )}
      </AnimatePresence>
    </div>
  );
}
