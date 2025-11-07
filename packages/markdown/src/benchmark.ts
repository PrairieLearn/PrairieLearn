import { setTimeout as sleep } from 'node:timers/promises';

import { sanitizeHtml } from './sanitize.js';

const html = '<p>Hello</p>';

for (let i = 1; ; i += 1) {
  sanitizeHtml(html);
  if (i % 1000 === 0) {
    const memUsage = process.memoryUsage();
    const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
    // eslint-disable-next-line no-console
    console.log(`${i} calls | Heap: ${heapUsedMB}/${heapTotalMB} MB`);

    // Yield to the event loop to allow `jsdom` to clean up its resources.
    await sleep(0);
  }
}
