'use strict';
// Deterministic sample file used by tests and the README demo.
const EPOCH_FILETIME_MS = 11644473600000, COCOA = 978307200;
module.exports = function make() {
  const b = new Uint8Array(2048), dv = new DataView(b.buffer);
  b.set([0x53, 0x41, 0x56, 0x45], 0); dv.setUint32(4, 3, true); dv.setUint32(8, 1717243200, true);
  const name = 'Aria the Bold'; b[16] = name.length; for (let i = 0; i < name.length; i++) b[17 + i] = name.charCodeAt(i);
  dv.setFloat32(64, 37.7749, true); dv.setFloat32(68, -122.4194, true); dv.setInt32(72, 48210, true);
  dv.setBigUint64(96, 1717243200000n, true);
  dv.setBigUint64(104, (1717243200000n + BigInt(EPOCH_FILETIME_MS)) * 10000n, true);
  dv.setFloat64(112, 1717243200 - COCOA, true);
  const msg = 'last_checkpoint=forest_gate'; dv.setUint16(160, msg.length, true); for (let i = 0; i < msg.length; i++) b[162 + i] = msg.charCodeAt(i);
  let x = 12345; for (let i = 1024; i < 2048; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; b[i] = (x >> 8) & 255; }
  return b;
};
if (require.main === module) require('fs').writeFileSync(process.argv[2] || 'samples/demo.sav', module.exports());
