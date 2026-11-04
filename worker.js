// axmlllm-web analysis worker.
//
// Runs Pyodide + the axmlllm wheel (unmodified axmlllm Python over the real AOSP
// libandroidfw, built as an emscripten side module) off the main thread — APK
// parsing and table loads are synchronous inside wasm.
//
// Protocol (postMessage):
//   main → worker: { id, type: "init", build: window.__AXMLLLM_BUILD }
//                  { id, type: "open", name: string, bytes: Uint8Array }
//                  { id, type: "tool", name: string, args: object }
//   worker → main: { id, ok: true,  result?: any }
//                  { id, ok: false, error: string }
//                  { type: "progress", text: string }   (unsolicited, during init)
//
// Python results cross the boundary as JSON text — no PyProxy ever leaves this file.

let py = null;
let initPromise = null;

const PY_SETUP = `
import json, os
import axmlllm
from axmlllm import tools
from axmlllm import format as _fmt
from axmlllm.manifest import Manifest

_m = None

def _open(path, is_apk):
    global _m
    if is_apk:
        _m = Manifest.from_apk(path)
    else:
        with open(path, "rb") as f:
            _m = Manifest.from_axml(f.read())
    return json.dumps({
        "version": axmlllm.__version__,
        "tools": tools.TOOL_DEFINITIONS,
    })

# The whole sparse tree for the page's own views: the same axmlllm.format.sparse_tree that
# get_manifest_tree returns, without that tool's LLM response budget (past ~128 KB the tool
# answers one level at a time, with no root, which left the tree and labels empty).
def _tree():
    if _m is None:
        return json.dumps({"error": "no APK loaded"})
    return json.dumps(_fmt.sparse_tree(_m), default=str)

# Class names as the device builds them (axmlllm's ParsingUtils.buildClassName replay):
# ".Main" and "Main" get the manifest package prepended. Left as declared without a package.
def _class_names(names_json):
    from axmlllm.manifest.dispatch import _class_name
    pkg = _m.package if _m is not None else None
    return json.dumps([_class_name(pkg, n) if pkg and isinstance(n, str) and n else n
                       for n in json.loads(names_json)])

# list_components for the page, with every <application> element ahead of the components and
# target_activity on each <activity-alias>: the class the
# alias launches, read as the device reads it (by ResID, then buildClassName). An alias's own
# name is only the component name launchers see; it names no class.
def _components(limit):
    from axmlllm.manifest.dispatch import _class_name
    from axmlllm.manifest.model import _COMPONENT_TAGS
    from axmlllm.manifest.reads import non_resource_string
    from axmlllm.manifest.styleables import ATTR
    out = tools.execute("list_components", {"limit": limit}, _m)
    if _m is None or out.get("error"):
        return json.dumps(out, default=str)
    elems = [e for e in _m.iter() if e.tag in _COMPONENT_TAGS][out.get("offset", 0):]
    for item, e in zip(out.get("items", []), elems):
        if e.tag != "activity-alias" or item.get("tag") != e.tag or item.get("line") != e.line:
            continue
        raw = non_resource_string(e, ATTR["targetActivity"])
        item["target_activity"] = _class_name(_m.package, raw) if raw and _m.package else raw
    # every <application> element first, with what the device does with it (the dispatch's
    # "application" effect), as list_components reports its own elements
    if out.get("offset", 0) == 0:
        apps = [_m._entry(e, {"application"}) for e in _m.iter() if e.tag == "application"]
        out["items"] = apps + out.get("items", [])
        out["total"] = out.get("total", 0) + len(apps)
    return json.dumps(out, default=str)

def _tool(name, args_json):
    if _m is None:
        return json.dumps({"error": "no APK loaded"})
    return json.dumps(tools.execute(name, json.loads(args_json), _m), default=str)
`;

function progress(text) { self.postMessage({ type: "progress", text }); }

async function init(build) {
  const base = `https://cdn.jsdelivr.net/pyodide/v${build.pyodide}/full/`;
  progress(`loading Pyodide ${build.pyodide}…`);
  importScripts(base + "pyodide.js");
  py = await self.loadPyodide({ indexURL: base });
  progress("loading micropip…");
  await py.loadPackage("micropip");
  progress(`loading ${build.wheel}…`);
  // Fetch ourselves so the ?v= cache-bust doesn't leak into the wheel filename
  // micropip parses; install from the in-memory FS.
  const resp = await fetch(`${build.wheel}?v=${build.axmlllm}`);
  if (!resp.ok) throw new Error(`wheel fetch failed: HTTP ${resp.status}`);
  py.FS.writeFile(`/tmp/${build.wheel}`, new Uint8Array(await resp.arrayBuffer()));
  await py.pyimport("micropip").install(`emfs:/tmp/${build.wheel}`);
  progress("importing axmlllm…");
  py.runPython(PY_SETUP);
  return { pyodide: py.version };
}

function open(name, bytes) {
  // A manifest-only upload (binary AndroidManifest.xml) is not a zip.
  const isApk = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const dir = "/work";
  try { py.FS.mkdirTree(dir); } catch (_) { /* exists */ }
  for (const f of py.FS.readdir(dir)) if (f !== "." && f !== "..") py.FS.unlink(`${dir}/${f}`);
  const path = `${dir}/input${isApk ? ".apk" : ".xml"}`;
  py.FS.writeFile(path, bytes);
  const out = JSON.parse(py.globals.get("_open")(path, isApk));
  out.isApk = isApk;
  out.name = name;
  return out;
}

function tool(name, args) {
  return JSON.parse(py.globals.get("_tool")(name, JSON.stringify(args || {})));
}

self.onmessage = async (e) => {
  const { id, type } = e.data;
  try {
    let result;
    if (type === "init") {
      initPromise ??= init(e.data.build);
      result = await initPromise;
    } else {
      await initPromise;
      if (type === "open") result = open(e.data.name, e.data.bytes);
      else if (type === "tool") result = tool(e.data.name, e.data.args);
      else if (type === "tree") result = JSON.parse(py.globals.get("_tree")());
      else if (type === "components") result = JSON.parse(py.globals.get("_components")(e.data.limit));
      else if (type === "classnames") result = JSON.parse(py.globals.get("_class_names")(JSON.stringify(e.data.names)));
      else throw new Error(`unknown message type: ${type}`);
    }
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
