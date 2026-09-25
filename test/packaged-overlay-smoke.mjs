import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const port = 9300 + (process.pid % 500);
const profilePath = path.join(os.tmpdir(), `aster-overlay-smoke-${process.pid}`);
const executable = path.resolve(`artifacts/mac-${process.arch}/Aster.app/Contents/MacOS/Aster`);
const child = spawn(executable, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profilePath}`,
], { stdio: ["ignore", "pipe", "pipe"] });

let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, message, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await check();
      if (result) return result;
    } catch {
      // The remote debugger may not be listening yet.
    }
    await delay(75);
  }
  throw new Error(message);
}

function createCdpClient(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return {
    ready,
    close: () => socket.close(),
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

let client;
try {
  const target = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await response.json();
    return targets.find((item) => item.type === "page" && item.title === "Aster");
  }, "Could not find the packaged Aster renderer");
  client = createCdpClient(target.webSocketDebuggerUrl);
  await client.ready;

  await waitFor(
    () => evaluate(client, `Boolean(document.querySelector('[aria-label="Extensions"]'))`),
    "Aster toolbar did not render",
  );
  await evaluate(client, `document.querySelector('[aria-label="Extensions"]').click()`);
  await waitFor(
    () => evaluate(client, `Boolean(document.querySelector('.panel-layer'))`),
    "Extensions panel did not open",
  );
  await evaluate(client, `document.querySelector('[aria-label="New tab"]').click()`);
  const plusResult = await waitFor(async () => {
    const state = await evaluate(client, `({ tabs: document.querySelectorAll('[role="tab"]').length, panel: Boolean(document.querySelector('.panel-layer')), focused: document.activeElement?.getAttribute('aria-label') })`);
    return state.tabs === 2 && !state.panel && state.focused === "Search or enter an address" ? state : null;
  }, "The + button did not focus the omnibox on the new tab");

  await evaluate(client, `document.querySelector('[aria-label="Extensions"]').click()`);
  await waitFor(
    () => evaluate(client, `Boolean(document.querySelector('.panel-layer'))`),
    "Extensions panel did not reopen",
  );
  await evaluate(client, `document.querySelectorAll('[role="tab"]')[0].click()`);
  const tabSwitchResult = await waitFor(async () => {
    const state = await evaluate(client, `({ tabs: document.querySelectorAll('[role="tab"]').length, panel: Boolean(document.querySelector('.panel-layer')), firstSelected: document.querySelectorAll('[role="tab"]')[0]?.getAttribute('aria-selected') })`);
    return state.tabs === 2 && !state.panel && state.firstSelected === "true" ? state : null;
  }, "Switching tabs left the Extensions panel open");

  await evaluate(client, `document.querySelectorAll('.tab-close')[1].click()`);
  await waitFor(
    () => evaluate(client, `document.querySelectorAll('[role="tab"]').length === 1`),
    "Closing a tab did not leave one tab",
  );
  await evaluate(client, `document.querySelector('.tab-close').click()`);
  const lastTabResult = await waitFor(async () => {
    const state = await evaluate(client, `({ tabs: document.querySelectorAll('[role="tab"]').length, title: document.querySelector('.tab-title')?.textContent, focused: document.activeElement?.getAttribute('aria-label') })`);
    return state.tabs === 1 && state.title === "New tab" && state.focused === "Search or enter an address" ? state : null;
  }, "Closing the last tab did not open and focus a replacement tab");

  console.log(`OVERLAY_SMOKE_OK ${JSON.stringify({ plusResult, tabSwitchResult, lastTabResult })}`);
} catch (error) {
  console.error("OVERLAY_SMOKE_FAILED", error, output);
  process.exitCode = 1;
} finally {
  client?.close();
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  fs.rmSync(profilePath, { recursive: true, force: true });
}
