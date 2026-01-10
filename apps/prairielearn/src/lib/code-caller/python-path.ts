import * as path from 'node:path';

import fs from 'fs-extra';

import { REPOSITORY_ROOT_PATH } from '../paths.js';

const PYTHON_VERSION = 'python3.13';

/**
 * Finds a Python executable by searching through the provided venv search paths.
 * Throws an error if no venv is found.
 *
 * @param pythonVenvSearchPaths - Array of paths to search for Python venvs
 * @returns The path to a Python executable
 */
export async function getPythonPath(pythonVenvSearchPaths: string[]): Promise<string> {
  for (const p of pythonVenvSearchPaths) {
    const venvPython = path.resolve(REPOSITORY_ROOT_PATH, path.join(p, 'bin', PYTHON_VERSION));
    if (await fs.pathExists(venvPython)) return venvPython;
  }

  throw new Error(
    `Python venv not found. Please set up a virtual environment with ${PYTHON_VERSION}. ` +
      'See https://prairielearn.readthedocs.io/en/latest/installingLocal/ for instructions.',
  );
}
