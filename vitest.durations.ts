import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Reporter, TestModule, TestSpecification } from 'vitest/node';

// Per-file durations from a previous run, used to balance CI shards. CI saves
// this file from runs on master and restores it before running tests; see
// `.github/workflows/test.yml`.
const DURATIONS_PATH = '.vitest/durations.json';

const repoRoot = dirname(fileURLToPath(import.meta.url));

function durationKey(projectName: string, moduleId: string) {
  return `${projectName}|${relative(repoRoot, moduleId)}`;
}

export function specDurationKey(spec: TestSpecification) {
  return durationKey(spec.project.name, spec.moduleId);
}

export function loadDurations(): Map<string, number> | null {
  const path = `${repoRoot}/${DURATIONS_PATH}`;
  if (!existsSync(path)) return null;
  return new Map(Object.entries(JSON.parse(readFileSync(path, 'utf8')) as Record<string, number>));
}

/**
 * Writes the duration of every test file to `outputPath`. Enabled by setting
 * `VITEST_DURATIONS_OUTPUT` (see `vitest.shared.ts`).
 */
export class DurationsReporter implements Reporter {
  constructor(private outputPath: string) {}

  onTestRunEnd(testModules: readonly TestModule[]) {
    const durations: Record<string, number> = {};
    for (const testModule of testModules) {
      durations[durationKey(testModule.project.name, testModule.moduleId)] = Math.round(
        testModule.diagnostic().duration,
      );
    }
    writeFileSync(this.outputPath, JSON.stringify(durations, null, 2));
  }
}
