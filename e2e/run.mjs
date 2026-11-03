// End-to-end check of the page in headless Chrome over CDP: open <url>, evaluate probe.js
// inside it for each APK, print what the page showed, and fail on a broken flow.
// Works the same against a local static server and the deployed GitHub Pages site.
//
//   node e2e/run.mjs <url> <apk> [apk ...]       # needs node >= 22 (global WebSocket)
//
//   python3 -m http.server 8000 &
//   node e2e/run.mjs http://localhost:8000/ /home/nyahumi/Project/axmlllm/tests/fixtures/*.apk
//   node e2e/run.mjs https://mobile-threat-hunter.github.io/axmlllm-web/ <apk>
//
// Never add --virtual-time-budget to the Chrome flags: worker calls then silently never resolve.
import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

const [, , url, ...apks] = process.argv;
if (!url || !apks.length) {
  console.error("usage: node e2e/run.mjs <url> <apk> [apk ...]");
  process.exit(2);
}
if (typeof WebSocket === "undefined") {
  console.error(`node ${process.version} has no global WebSocket — use node >= 22`);
  process.exit(2);
}

const PROBE = readFileSync(new URL("./probe.js", import.meta.url), "utf8");
const port = 9333;
const profile = mkdtempSync(join(tmpdir(), "axmlllm-e2e-"));
const chrome = spawn("google-chrome", ["--headless=new", "--disable-gpu", "--no-first-run",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 50 && !targets; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); }
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const waiting = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); waiting.get(m.id)?.(m); };
const send = (method, params = {}) =>
  new Promise((r) => { const id = ++seq; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout: 240000 })).result;

let failed = 0;
for (const apk of apks) {
  // A fresh page per APK: each run measures engine load + one file, like a real visit.
  await send("Page.navigate", { url });
  for (let i = 0; i < 100; i++) {
    if ((await evaluate("typeof engineReady")).result?.value === "boolean") break;
    await sleep(100);
  }
  const b64 = readFileSync(apk).toString("base64");
  const res = await evaluate(PROBE.replace('"__APK_B64__"', () => `"${b64}"`));
  const r = res.result?.value ? JSON.parse(res.result.value) : { error: JSON.stringify(res) };
  const problems = [];
  if (r.error) problems.push(r.error);
  if (!/^engine ready/.test(r.engine || "")) problems.push(`engine: ${r.engine}`);
  if (!r.cards?.includes("PARSE_STATUS=ok")) problems.push("parse_status not ok");
  if (r.cards?.includes("PARSE_STATUS=ok") && !r.treeNodes) problems.push("manifest tree empty");
  if (r.labelAttrsInTree !== r.labelUses) problems.push(`labels list ${r.labelUses} != label attributes in tree ${r.labelAttrsInTree}`);
  if (r.unmappedPaths?.length) problems.push(`anomaly paths not in tree: ${r.unmappedPaths.join(", ")}`);
  if (!r.toolOptions) problems.push("tool console empty");
  if (!r.toolOut?.startsWith("//")) problems.push("tool console did not run");
  const badCopy = Object.entries(r.copy || {}).filter(([, ok]) => !ok).map(([k]) => k);
  if (!r.copy) problems.push("copy buttons not checked");
  else if (badCopy.length) problems.push(`copy buttons wrong: ${badCopy.join(", ")}`);
  failed += problems.length ? 1 : 0;
  const { resolved, toolOut, ...shown } = r;
  console.log(`${problems.length ? "FAIL" : "ok  "} ${basename(apk)} ${JSON.stringify(shown)}`);
  for (const p of problems) console.log(`     ${p}`);
}

ws.close();
chrome.kill();
await sleep(300);
rmSync(profile, { recursive: true, force: true });
console.log(failed ? `${failed}/${apks.length} failed` : `all ${apks.length} passed — ${url}`);
process.exit(failed ? 1 : 0);
