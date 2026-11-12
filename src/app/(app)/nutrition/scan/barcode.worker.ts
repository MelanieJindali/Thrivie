// Reads barcodes off the main thread, so the camera view and buttons stay responsive.
// Uses the browser's own reader when it has one; otherwise a WebAssembly reader served by Thrivie.
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
type Detected = { rawValue: string; format: string };
type Detector = { detect: (source: ImageBitmapSource) => Promise<Detected[]> };
let detector: Promise<Detector> | null = null;

function getDetector(): Promise<Detector> {
  detector ??= (async () => {
    const Native = (globalThis as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
    if (Native) {
      try {
        const supported = await Native.getSupportedFormats();
        if (FORMATS.every((f) => supported.includes(f))) return new Native({ formats: FORMATS });
      } catch { /* fall back */ }
    }
    const mod = await import("barcode-detector/ponyfill");
    mod.prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `${self.location.origin}/vendor/zxing/zxing_reader.wasm` : prefix + path) } });
    return new mod.BarcodeDetector({ formats: FORMATS as never }) as unknown as Detector;
  })();
  return detector;
}

self.onmessage = async (e: MessageEvent<{ id: number; bitmap: ImageBitmap }>) => {
  const { id, bitmap } = e.data;
  try {
    const found = await (await getDetector()).detect(bitmap);
    self.postMessage({ id, hits: found.map((d) => ({ rawValue: d.rawValue, format: d.format })) });
  } catch {
    detector = null;
    self.postMessage({ id, hits: [], failed: true });
  } finally {
    bitmap.close();
  }
};
