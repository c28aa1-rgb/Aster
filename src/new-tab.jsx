import { createRoot } from "react-dom/client";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Github, Mail, Play } from "lucide-react";
import { useState } from "react";

const spring = { type: "spring", stiffness: 440, damping: 32, mass: .5 };

function SearchControl() {
  const reduced = useReducedMotion();
  return (
    <motion.button className="search-submit" type="submit" aria-label="Search" initial={false}
      whileHover={reduced ? undefined : "hover"} whileTap={reduced ? undefined : { scale: .94 }} transition={spring}>
      <motion.span variants={{ hover: { x: 2 } }} transition={spring} style={{ display: "flex" }}>
        <ArrowRight size={22} strokeWidth={1.7} aria-hidden="true" />
      </motion.span>
    </motion.button>
  );
}

const defaultShortcuts = [
  { name: "Gmail", url: "https://mail.google.com/" },
  { name: "YouTube", url: "https://www.youtube.com/" },
  { name: "Wikipedia", url: "https://www.wikipedia.org/" },
  { name: "GitHub", url: "https://github.com/" },
];

function loadShortcuts() {
  try {
    const saved = JSON.parse(localStorage.getItem("aster-shortcuts") || "null");
    if (Array.isArray(saved) && saved.every((item) => item && typeof item.name === "string" && typeof item.url === "string")) return saved;
  } catch { /* Use defaults when storage is unavailable. */ }
  return defaultShortcuts;
}

function ShortcutIcon({ name }) {
  const key = name.toLowerCase();
  if (key === "gmail") return <Mail size={21} strokeWidth={1.6} />;
  if (key === "youtube") return <Play size={20} fill="currentColor" strokeWidth={1} />;
  if (key === "github") return <Github size={22} strokeWidth={1.6} />;
  return name.trim().slice(0, 1).toUpperCase() || "•";
}

function Shortcuts() {
  const reduced = useReducedMotion();
  const [shortcuts, setShortcuts] = useState(loadShortcuts);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shortcuts);
  const save = (next) => {
    const cleaned = next.map(({ name, url }) => ({ name: name.trim(), url: url.trim() })).filter((item) => item.name && item.url);
    setShortcuts(cleaned);
    localStorage.setItem("aster-shortcuts", JSON.stringify(cleaned));
  };
  const beginEditing = () => { setDraft(shortcuts.map((item) => ({ ...item }))); setEditing(true); };
  const finishEditing = () => { save(draft); setEditing(false); };
  return <>
    <div className="shortcut-list">
      {shortcuts.map(({ name, url }) => (
        <motion.a className={`shortcut shortcut-icon-${name.toLowerCase()}`} key={`${name}-${url}`} href={editing ? undefined : url} initial={false}
          whileHover={reduced || editing ? undefined : { y: -3 }} whileTap={reduced || editing ? undefined : { scale: .96 }} transition={spring}
          onClick={(event) => { if (editing) event.preventDefault(); }}>
          <span className="shortcut-icon" aria-hidden="true"><ShortcutIcon name={name} /></span>
          <span>{name}</span>
        </motion.a>
      ))}
    </div>
    <button className="customize-shortcuts" type="button" onClick={editing ? finishEditing : beginEditing}>{editing ? "Done" : "Customize"}</button>
    {editing && <motion.div className="shortcut-editor" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
      <div className="shortcut-editor-heading"><strong>Customize shortcuts</strong><span>Edit the label and web address.</span></div>
      {draft.map((item, index) => <div className="shortcut-edit-row" key={index}>
        <input aria-label={`Shortcut ${index + 1} name`} value={item.name} placeholder="Name" onChange={(event) => setDraft(draft.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry))} />
        <input aria-label={`Shortcut ${index + 1} URL`} value={item.url} placeholder="https://example.com" onChange={(event) => setDraft(draft.map((entry, i) => i === index ? { ...entry, url: event.target.value } : entry))} />
        <button type="button" aria-label={`Remove ${item.name || "shortcut"}`} onClick={() => setDraft(draft.filter((_, i) => i !== index))}>×</button>
      </div>)}
      <button className="add-shortcut" type="button" onClick={() => setDraft([...draft, { name: "", url: "" }])}>+ Add shortcut</button>
    </motion.div>}
  </>;
}

// The input and native GET form are never replaced: search works before JS loads.
createRoot(document.getElementById("search-control")).render(<SearchControl />);
createRoot(document.getElementById("shortcuts")).render(<Shortcuts />);

function updateClock() {
  const now = new Date();
  const date = document.getElementById("date");
  const clock = document.getElementById("clock");
  date.dateTime = now.toISOString();
  date.textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now);
  clock.dateTime = now.toISOString();
  clock.textContent = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(now);
}
updateClock();
setInterval(() => { if (!document.hidden) updateClock(); }, 60_000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) updateClock(); });
