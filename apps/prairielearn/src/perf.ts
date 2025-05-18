import * as helperServer from './tests/helperServer.js';

for (let i = 0; i < 20; i++) {
  const a = performance.now();
  await helperServer.before()();
  const b = performance.now();
  console.log('[startup] took ' + (b - a) + ' ms.');
  const c = performance.now();
  await helperServer.after();
  const d = performance.now();
  console.log('[cleanup] took ' + (d - c) + ' ms.');
}