// Node smoke test: load Pyodide + the shipped wheel and run worker.js's own Python
// (PY_SETUP is extracted from worker.js, so the page's code path is what's tested)
// against axmlllm's fixture APKs.
//
//   node wasm-build/smoke.mjs [apk ...]
//
// Pyodide comes from the local cross-build env (same version the page pins on the CDN).
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const FIXTURES = "/home/nyahumi/Project/axmlllm/tests/fixtures";

const html = readFileSync(join(ROOT, "index.html"), "utf8");
const pin = html.match(/window\.__AXMLLLM_BUILD = (\{[^\n]*\});/);
if (!pin) throw new Error("build pin not found in index.html");
const build = Function(`return ${pin[1]}`)();

const worker = readFileSync(join(ROOT, "worker.js"), "utf8");
const PY_SETUP = worker.match(/const PY_SETUP = `([\s\S]*?)`;/)[1];

const distDir = execFileSync(join(HERE, ".venv/bin/pyodide"), ["config", "get", "dist_dir"],
  { encoding: "utf8" }).trim();
const { loadPyodide } = await import(join(distDir, "pyodide.mjs"));
const py = await loadPyodide({ indexURL: distDir + "/" });
if (py.version !== build.pyodide) throw new Error(`local Pyodide ${py.version} != pin ${build.pyodide}`);
await py.loadPackage("micropip");
py.FS.writeFile(`/tmp/${build.wheel}`, readFileSync(join(ROOT, build.wheel)));
await py.pyimport("micropip").install(`emfs:/tmp/${build.wheel}`);
py.runPython(PY_SETUP);

const apks = process.argv.slice(2);
if (!apks.length) for (const f of readdirSync(FIXTURES)) if (f.endsWith(".apk")) apks.push(join(FIXTURES, f));

let failed = 0;
for (const apk of apks) {
  py.FS.writeFile("/tmp/in.apk", readFileSync(apk));
  const opened = JSON.parse(py.globals.get("_open")("/tmp/in.apk", true));
  const call = (name, args = {}) => JSON.parse(py.globals.get("_tool")(name, JSON.stringify(args)));
  const row = [basename(apk)];
  for (const name of ["analyze_manifest", "list_permissions", "list_components",
                      "manifest_anomalies", "get_manifest_tree", "list_resources"]) {
    const out = call(name);
    const err = out.error && !/resource table|no table|not loaded/i.test(out.error) ? out.error : null;
    if (err) { failed++; row.push(`${name}=ERROR(${err})`); }
    else row.push(`${name}=${JSON.stringify(out).length}B`);
  }
  // the page's own whole-tree call (worker _tree) must always carry the root
  const tree = JSON.parse(py.globals.get("_tree")());
  if (tree.parse_status === "ok" && !tree.root) { failed++; row.push("_tree=NO ROOT"); }
  else row.push(`_tree=${JSON.stringify(tree).length}B`);
  console.log(row.join("  "), `tools=${opened.tools.length}`);
}
console.log(failed ? `FAIL: ${failed} tool error(s)` : `ok: ${apks.length} APK(s), axmlllm ${build.axmlllm}`);
process.exit(failed ? 1 : 0);
