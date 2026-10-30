# axmlllm-web

In-browser demo of **axmlllm** — an Android binary-XML (AXML) / AndroidManifest +
`resources.arsc` analyzer built on the real AOSP libandroidfw.

Drop an APK (or a binary `AndroidManifest.xml`) on the page: it is parsed locally in a
Web Worker by axmlllm's Python package running under [Pyodide](https://pyodide.org),
with the native core (AOSP `ResXMLTree` / `LoadedArsc` / `AssetManager2`) compiled to
WebAssembly. Nothing is uploaded.

## Views

- **Overview** — package summary, manifest anomalies (click a path to jump into the
  tree), permissions, components.
- **Manifest tree** — the parsed element tree with resource IDs, raw value types, and
  click-to-resolve `@0x7f…` references.
- **Resources** — paged resource-table listing and string search.
- **Tool console** — every axmlllm tool, with forms generated from its own tool schema.

## Run locally

Any static server works (single-threaded, no COOP/COEP needed):

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Build

See [`wasm-build/README.md`](wasm-build/README.md).

## Test

```sh
node wasm-build/smoke.mjs                              # wheel + worker Python, in node
node e2e/run.mjs <page-url> <apk> [apk ...]            # page in headless Chrome (node >= 22)
```

`e2e/run.mjs` drives the page over the Chrome DevTools Protocol, so the same command
checks a local `python3 -m http.server` and the deployed GitHub Pages site.
