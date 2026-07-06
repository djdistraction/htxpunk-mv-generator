# Vendored: essentia.js 0.1.3

`essentia-wasm.umd.js` and `essentia.js-core.umd.js` are copied verbatim from
`node_modules/essentia.js/dist/` after `npm install essentia.js@0.1.3` in a
scratch directory — they are **not** an npm dependency of this app and are
not imported by any bundled code. They're loaded directly as static assets
via `importScripts()` in `essentia-worker.js`, a classic (non-module) Web
Worker.

## Why static files instead of an npm import

These UMD builds only work as plain global scripts, not through a bundler:

- Bundling them through webpack/Turbopack trips over Emscripten's Node-only
  `require('fs')`/`require('path')` branches in the glue code.
- Their last line is a bare `exports.EssentiaWASM = Module` with no
  environment guard. Under Node's CJS loader this silently no-ops (Node's
  `exports` and `module.exports` diverge earlier in the file, so nothing
  breaks); loaded as a real browser/worker script, `exports` doesn't exist
  at all and it throws `ReferenceError: exports is not defined`. Verified
  with a real headless-Chromium Worker — see `essentia-worker.js`'s
  `var exports = {}` shim, which works around it.

The `.umd.js` variant (not `.es.js` or `.web.js`) was chosen because it
inlines the WASM binary as base64 — no separate `.wasm` fetch, no
`locateFile()` path resolution to get wrong.

## Upgrading

Repeat the `npm install essentia.js@<version>` scratch-install, re-copy the
two dist files and `LICENSE`, and re-verify against a real Worker (an
`exports.EssentiaWASM = Module`-shaped export or the `ReferenceError` above
could change between releases).

## License

essentia.js is AGPL-3.0 (`LICENSE` in this folder) — the AGPL's network-use
clause is broader than typical copyleft and may apply to how this app is
distributed/hosted. Worth a deliberate look before a commercial or hosted
(non-local) release.
