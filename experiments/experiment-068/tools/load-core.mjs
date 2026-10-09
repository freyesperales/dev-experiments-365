// Loads the exact <script id="core"> block from index.html into a VM, so tests and the CLI run the shipped code.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export function loadCore() {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const m = /<script id="core">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('core script block not found in index.html');
  const ctx = vm.createContext({ TextDecoder, Blob, Response, DecompressionStream, Uint8Array, Math, Number, String, Object, Array, Error, isFinite, parseFloat, console });
  vm.runInContext(m[1], ctx);
  return ctx.Spoolslip;
}
