// Vendored from essentia.js@0.1.3 (github.com/MTG/essentia.js, AGPL-3.0) —
// see LICENSE in this folder. Files copied verbatim from the npm package's
// dist/{essentia-wasm.umd.js,essentia.js-core.umd.js}, self-contained builds
// (WASM binary inlined as base64, no separate .wasm fetch).
//
// Loaded here via importScripts rather than a bundler import: verified these
// exact UMD builds throw "ReferenceError: exports is not defined" when run
// as a plain browser/worker script, because their last line is a bare
// `exports.EssentiaWASM = Module` with no environment guard (it only works
// under Node's CJS loader, where `exports` already exists as a global). The
// `var exports = {}` shim below satisfies that reference; the Emscripten
// glue's own `var Module = ...` becomes a real global in this worker's
// scope regardless, which is what we actually read.
var exports = {};

self.onmessage = function (ev) {
  try {
    importScripts('essentia-wasm.umd.js', 'essentia.js-core.umd.js');
    var EssentiaWASM = exports.EssentiaWASM || Module;
    var essentia = new Essentia(EssentiaWASM);

    var signal = ev.data.signal; // mono Float32Array, already resampled to 44100Hz by the caller
    var vec = essentia.arrayToVector(signal);

    var rhythm = essentia.RhythmExtractor2013(vec);
    var beatGrid = Array.from(essentia.vectorToArray(rhythm.ticks));
    var bpm = rhythm.bpm;

    var key = essentia.KeyExtractor(vec);
    var musicalKey = key.scale ? (key.key + ' ' + key.scale) : key.key;

    essentia.delete();

    self.postMessage({
      ok: true,
      bpm: Math.round(bpm * 10) / 10,
      confidence: rhythm.confidence,
      beatGrid: beatGrid,
      musicalKey: musicalKey,
      keyStrength: key.strength,
    });
  } catch (e) {
    self.postMessage({ ok: false, error: String((e && e.stack) || e) });
  }
};
