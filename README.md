# axmlllm-web

In-browser demo of **axmlllm** — an Android binary-XML (AXML) / AndroidManifest +
`resources.arsc` analyzer built on the real AOSP libandroidfw.

Drop an APK (or a binary `AndroidManifest.xml`) on the page: it is parsed locally in a
Web Worker by axmlllm's Python package running under [Pyodide](https://pyodide.org),
with the native core (AOSP `ResXMLTree` / `LoadedArsc` / `AssetManager2`) compiled to
WebAssembly. Nothing is uploaded.

## Views

- **Overview** — package summary, labels, manifest anomalies (click a path to jump into
  the tree), permissions, components.
  - **Labels** — every `android:label` (matched by ResID `0x01010001`), each with its value
    in every configuration that defines it (`resource_config_variants`); the summary card
    shows the app label and flags one that differs by locale. No locale matching is done in
    the page — what a given device locale selects is axmlllm issue #20.
- **Manifest tree** — the parsed element tree with resource IDs, raw value types, and
  click-to-resolve `@0x7f…` references.
- **Resources** — paged resource-table listing and string search.
- **Tool console** — every axmlllm tool, with forms generated from its own tool schema.

Every list has a **⧉ copy** button (tab-separated tables, labels, anomalies as JSON, the
manifest as XML or JSON, tool output), and each card, row, label value, anomaly and tree
element has its own on hover.

## Embedding

The [Android LLM Suite](https://github.com/mobile-threat-hunter/android-llm) console embeds
this page in an iframe and reads it. What it may rely on (checked by `e2e/run.mjs`):

- globals `engineReady`, `session.name`, `last.tree` (whole sparse tree), `last.comps`
  (Components rows), and `loadFile(file)`
- `#comps` / `#perms`: the name is the first cell (`td.mono` when it names something), columns
  are found by header text (`tag`, `target_activity`, …), and the counts `#comp-count` /
  `#perm-count` sit in the section `<h2>`
- `#comps` rows carry `data-kind` (`application`, `activity`, `activity-alias`, `service`,
  `receiver`, `provider`) and `data-class`, the class the device instantiates (an alias's
  `target_activity`); a `tr.grp` header row starts each kind, so re-sorting rows inside each
  kind keeps the grouping

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
