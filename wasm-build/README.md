# wasm-build

Builds the axmlllm Pyodide wheel the page loads: axmlllm's Python package verbatim plus
`_axml_core` (the pybind11 binding over real AOSP libandroidfw) cross-compiled as an
emscripten side module.

## Layout

- `AXMLLLM_REF` — the pinned axmlllm commit.
- `patches/axmlllm-wasm.patch` — the wasm delta applied on top of it (CMake emscripten
  branches, musl LFS64 guards, liblog stderr logger, `resource`-less `_host.py`).
- `build.sh` — detached worktree at the pin → apply patch → `pyodide build` → copy the
  wheel to the repo root → rewrite the build pin in `index.html`.
- `smoke.mjs` — node smoke test: local Pyodide + the shipped wheel + worker.js's own
  Python against axmlllm's fixture APKs (or APK paths given as arguments).

## Setup (once)

```sh
python3.13 -m venv .venv && .venv/bin/pip install pyodide-build
.venv/bin/pyodide xbuildenv install 0.29.5
~/emsdk/emsdk install 4.0.9 && ~/emsdk/emsdk activate 4.0.9   # = `pyodide config get emscripten_version`
```

`build.sh` refuses to run unless the active `emcc` matches Pyodide's required version.

## Build + verify

```sh
wasm-build/build.sh                 # or AXMLLLM_REF=<sha> wasm-build/build.sh
node wasm-build/smoke.mjs           # fixtures; pass APK paths to test others
```

Single-threaded (no pthreads): the page needs no COOP/COEP and runs on GitHub Pages.
Exceptions are native wasm EH (`-fwasm-exceptions`), matching Pyodide — not
`-fexceptions`, which is ABI-incompatible with it.

## Updating axmlllm

Write the new commit to `AXMLLLM_REF`, rebuild, run the smoke test. If the patch no
longer applies, rebase it in `.work/axmlllm-<sha>` and regenerate with
`git -C .work/axmlllm-<sha> diff --cached > patches/axmlllm-wasm.patch`.
