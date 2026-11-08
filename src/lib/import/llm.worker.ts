// Web Worker that hosts the on-device language model (WebLLM), so the UI never
// freezes. It only ever receives short note snippets from this device.
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
