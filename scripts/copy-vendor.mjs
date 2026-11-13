// Copies engine files (barcode reader, text reader and its English data, on-device AI runtime) from
// node_modules into public/vendor, so they're served by Thrivie itself and nothing is fetched
// from a third-party CDN. Runs after install and before each build. public/vendor is not committed.
import { cpSync, existsSync, mkdirSync } from "node:fs";

const FILES = [
  ["node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", "public/vendor/zxing/zxing_reader.wasm"],
  ["node_modules/tesseract.js/dist/worker.min.js", "public/vendor/tesseract/worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "public/vendor/tesseract/tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "public/vendor/tesseract/tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "public/vendor/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "public/vendor/tesseract/lang/eng.traineddata.gz"],
  // On-device AI runtime (ONNX Runtime Web): the plain build for WebAssembly, the asyncify build for WebGPU.
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs", "public/vendor/ort/ort-wasm-simd-threaded.mjs"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "public/vendor/ort/ort-wasm-simd-threaded.wasm"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs", "public/vendor/ort/ort-wasm-simd-threaded.asyncify.mjs"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm", "public/vendor/ort/ort-wasm-simd-threaded.asyncify.wasm"],
];
let copied = 0;
for (const [from, to] of FILES) {
  if (!existsSync(from)) { console.warn(`copy-vendor: missing ${from}`); continue; }
  mkdirSync(to.slice(0, to.lastIndexOf("/")), { recursive: true });
  cpSync(from, to);
  copied++;
}
console.log(`copy-vendor: ${copied}/${FILES.length} engine files in public/vendor`);
