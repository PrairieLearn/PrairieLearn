import fs from 'node:fs/promises';
import path from 'path';

import { assert, describe, test } from 'vitest';

import { APP_ROOT_PATH } from '../lib/paths.js';
import { NODE_MODULES_PATHS } from '../middlewares/staticNodeModules.js';

const ELEMENTS_PATH = path.resolve(APP_ROOT_PATH, 'elements');

export async function nodeModulesFileExists(assetPath: string): Promise<boolean> {
  for (const p of NODE_MODULES_PATHS) {
    const resolvedPath = path.resolve(p, assetPath);
    if (
      await fs.access(resolvedPath).then(
        () => true,
        () => false,
      )
    ) {
      return true;
    }
  }
  return false;
}

describe('Element dependencies', () => {
  test('All dependencies in info.json files exist in node_modules', async () => {
    const elementDirs = await fs.readdir(ELEMENTS_PATH, { withFileTypes: true });

    for (const dir of elementDirs) {
      const infoJsonPath = path.join(ELEMENTS_PATH, dir.name, 'info.json');
      const infoJsonContent = await fs.readFile(infoJsonPath, 'utf-8');
      const info = JSON.parse(infoJsonContent);

      const dependencies = [
        ...(info.dependencies?.nodeModulesScripts || []),
        ...(info.dependencies?.nodeModulesStyles || []),
        ...Object.values(info.dynamicDependencies?.nodeModulesScripts || {}),
      ];

      for (const dependency of dependencies) {
        const exists = await nodeModulesFileExists(dependency);
        assert.isTrue(
          exists,
          `Dependency "${dependency}" in element "${dir.name}" does not exist in node_modules`,
        );
      }
    }
  });
});
