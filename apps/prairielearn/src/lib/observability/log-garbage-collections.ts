import { PerformanceObserver } from 'node:perf_hooks';

export function init() {
  const obs = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      console.log(`GC: ${entry.duration}ms`, entry);
    }
  });
  obs.observe({ entryTypes: ['gc'] });
}
