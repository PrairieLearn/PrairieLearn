import { describe, expect, it } from 'vitest';

import { CloneProgress } from './clone-progress.js';

describe('CloneProgress', () => {
  it('times each phase until the next one starts, across split chunks', () => {
    const progress = new CloneProgress(1000);
    progress.push("Cloning into '/workspace/session/course'...\n", 1000);
    progress.push('remote: Enumerating objects: 2917, done.        \n', 3000);
    progress.push('remote: Counting objects:  50% (1/2)        \r', 3500);
    progress.push('remote: Counting objects: 100% (2/2), done.        \n', 4000);
    progress.push('Receiving objects:  10% (292/2917)\rReceiving obj', 5000);
    progress.push('ects: 100% (2917/2917), 150.20 MiB | 4.00 MiB/s, done.\n', 30_000);
    progress.push('Resolving deltas: 100% (10/10), done.\n', 36_000);
    progress.push('Updating files:  40% (800/2000)\r', 40_000);

    expect(progress.phases(45_000)).toEqual([
      { phase: 'connecting', startMs: 0, durationMs: 2000, progress: null, lastProgressMs: null },
      {
        phase: 'server_enumerating',
        startMs: 2000,
        durationMs: 500,
        progress: 'remote: Enumerating objects: 2917, done.',
        lastProgressMs: 2000,
      },
      {
        phase: 'server_counting',
        startMs: 2500,
        durationMs: 1500,
        progress: 'remote: Counting objects: 100% (2/2), done.',
        lastProgressMs: 3000,
      },
      {
        phase: 'receiving',
        startMs: 4000,
        durationMs: 31_000,
        progress: 'Receiving objects: 100% (2917/2917), 150.20 MiB | 4.00 MiB/s, done.',
        lastProgressMs: 29_000,
      },
      {
        phase: 'resolving_deltas',
        startMs: 35_000,
        durationMs: 4000,
        progress: 'Resolving deltas: 100% (10/10), done.',
        lastProgressMs: 35_000,
      },
      {
        phase: 'checkout',
        startMs: 39_000,
        durationMs: 5000,
        progress: 'Updating files:  40% (800/2000)',
        lastProgressMs: 39_000,
      },
    ]);
  });

  it('keeps non-progress output for clone errors', () => {
    const progress = new CloneProgress(0);
    progress.push('Receiving objects:  10% (1/10)\r', 10);
    progress.push('fatal: Remote branch missing not found in upstream origin\n', 20);

    expect(progress.errorOutput).toBe('fatal: Remote branch missing not found in upstream origin');
    expect(progress.phases(30)).toEqual([
      { phase: 'connecting', startMs: 0, durationMs: 10, progress: null, lastProgressMs: null },
      {
        phase: 'receiving',
        startMs: 10,
        durationMs: 20,
        progress: 'Receiving objects:  10% (1/10)',
        lastProgressMs: 10,
      },
    ]);
  });
});
