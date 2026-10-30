#!/usr/bin/env bash
# Build the axmlllm Pyodide wheel from a pinned axmlllm commit + the wasm patch,
# copy it to the repo root, and rewrite the page's build pin to match.
#
#   wasm-build/build.sh            # build AXMLLLM_REF
#   AXMLLLM_REF=<sha> wasm-build/build.sh
#
# Env overrides: AXMLLLM_REPO, AOSP_ROOT, EMSDK.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
AXMLLLM_REPO="${AXMLLLM_REPO:-/home/nyahumi/Project/axmlllm}"
AOSP_ROOT="${AOSP_ROOT:-/home/nyahumi/Project/aosp}"
EMSDK="${EMSDK:-$HOME/emsdk}"
REF="${AXMLLLM_REF:-$(cat "$HERE/AXMLLLM_REF")}"
SHA="$(git -C "$AXMLLLM_REPO" rev-parse --verify "$REF^{commit}")"
SHORT="${SHA:0:7}"
PATCH="$HERE/patches/axmlllm-wasm.patch"
PYODIDE="$HERE/.venv/bin/pyodide"

# ── toolchain: emcc must be exactly the version this Pyodide was built with ──
[[ -x "$PYODIDE" ]] || { echo "missing $PYODIDE — see wasm-build/README.md (setup)" >&2; exit 1; }
WANT_EMCC="$("$PYODIDE" config get emscripten_version)"
# shellcheck disable=SC1091
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
HAVE_EMCC="$(emcc --version | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
if [[ "$HAVE_EMCC" != "$WANT_EMCC" ]]; then
  echo "emcc $HAVE_EMCC active, Pyodide needs $WANT_EMCC: $EMSDK/emsdk install $WANT_EMCC && $EMSDK/emsdk activate $WANT_EMCC" >&2
  exit 1
fi

# ── source tree: detached worktree at the pin + patch (never touches the main checkout) ──
WORK="$HERE/.work/axmlllm-$SHORT"
STAMP="$WORK/.axmlllm-web-patch.sha256"
PATCH_SUM="$(sha256sum "$PATCH" | cut -d' ' -f1)"
if [[ ! -f "$STAMP" || "$(cat "$STAMP")" != "$PATCH_SUM" ]]; then
  if [[ -d "$WORK" ]]; then git -C "$AXMLLLM_REPO" worktree remove --force "$WORK"; fi
  mkdir -p "$HERE/.work"
  git -C "$AXMLLLM_REPO" worktree add --detach "$WORK" "$SHA"
  git -C "$WORK" apply --index "$PATCH"
  echo "$PATCH_SUM" > "$STAMP"
fi

# ── build ──
rm -rf "$WORK/dist"
(cd "$WORK" && "$PYODIDE" build --outdir dist \
  -C "cmake.define.AOSP_ROOT=$AOSP_ROOT" \
  -C "cmake.define.AXML_BUILD_SMOKE=OFF")
WHEEL="$(cd "$WORK/dist" && ls axmlllm-*-pyemscripten_*_wasm32.whl)"

# ── publish into the page ──
rm -f "$ROOT"/axmlllm-*.whl
cp "$WORK/dist/$WHEEL" "$ROOT/"
PYODIDE_VERSION="$(basename "$(dirname "$(dirname "$("$PYODIDE" config get pyodide_root)")")")"
# The ONE pin (index.html) — worker.js, the wheel URL and the Pyodide CDN URL all derive from it.
python3 - "$ROOT/index.html" "$SHORT" "$WHEEL" "$PYODIDE_VERSION" <<'EOF'
import re, sys
path, sha, wheel, pyo = sys.argv[1:]
text = open(path, encoding="utf-8").read()
pin = f'window.__AXMLLLM_BUILD = {{ axmlllm: "{sha}", wheel: "{wheel}", pyodide: "{pyo}" }};'
new, n = re.subn(r"window\.__AXMLLLM_BUILD = \{[^\n]*\};", pin, text)
if n != 1:
    sys.exit(f"build pin: expected exactly one in {path}, found {n}")
open(path, "w", encoding="utf-8").write(new)
EOF
echo "built $WHEEL from axmlllm $SHORT (Pyodide $PYODIDE_VERSION) → $ROOT/$WHEEL"
