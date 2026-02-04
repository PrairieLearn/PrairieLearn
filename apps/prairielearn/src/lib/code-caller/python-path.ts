import * as path from 'node:path';

import fs from 'fs-extra';

import { REPOSITORY_ROOT_PATH } from '../paths.js';

const PYTHON_VERSION = 'python3.13';
const PYTHON_VENV_SEARCH_PATHS = ['.venv'];

/**
 * Finds a Python executable in a virtual environment. Throws an error if no venv is found.
 *
 * @returns The path to a Python executable
 */
export async function getPythonPath(): Promise<string> {
  for (const p of PYTHON_VENV_SEARCH_PATHS) {
    const venvPython = path.resolve(REPOSITORY_ROOT_PATH, path.join(p, 'bin', PYTHON_VERSION));
    if (await fs.pathExists(venvPython)) return venvPython;
  }

  throw new Error(
    `Python venv not found. Please set up a virtual environment with ${PYTHON_VERSION}. ` +
      'See https://docs.prairielearn.com/installingLocal/ for instructions.',
  );
}
