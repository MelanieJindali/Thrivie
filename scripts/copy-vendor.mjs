// Copies the scanner's engine files (barcode reader, text reader and its English data) from
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
];
let copied = 0;
for (const [from, to] of FILES) {
  if (!existsSync(from)) { console.warn(`copy-vendor: missing ${from}`); continue; }
  mkdirSync(to.slice(0, to.lastIndexOf("/")), { recursive: true });
  cpSync(from, to);
  copied++;
}
console.log(`copy-vendor: ${copied}/${FILES.length} engine files in public/vendor`);
