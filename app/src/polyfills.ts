// Some wallet modules expect Node's Buffer in the browser.
import { Buffer } from "buffer";
(globalThis as any).Buffer ??= Buffer;
(globalThis as any).process ??= { env: {}, browser: true, version: "", nextTick: (f: () => void) => queueMicrotask(f) };
