import { createRoot } from "react-dom/client";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Github, Mail, Play } from "lucide-react";

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

const shortcuts = [
  { name: "Gmail", url: "https://mail.google.com/", icon: <Mail size={21} strokeWidth={1.6} /> },
  { name: "YouTube", url: "https://www.youtube.com/", icon: <Play size={20} fill="currentColor" strokeWidth={1} /> },
  { name: "Wikipedia", url: "https://www.wikipedia.org/", icon: "W" },
  { name: "GitHub", url: "https://github.com/", icon: <Github size={22} strokeWidth={1.6} /> },
];

function Shortcuts() {
  const reduced = useReducedMotion();
  return shortcuts.map(({ name, url, icon }) => (
    <motion.a className="shortcut" key={name} href={url} initial={false}
      whileHover={reduced ? undefined : { y: -3 }} whileTap={reduced ? undefined : { scale: .96 }} transition={spring}>
      <span className={`shortcut-icon ${name.toLowerCase()}`} aria-hidden="true">{icon}</span>
      <span>{name}</span>
    </motion.a>
  ));
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
