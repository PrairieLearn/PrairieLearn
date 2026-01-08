import * as path from 'node:path';

import fs from 'fs-extra';

import { REPOSITORY_ROOT_PATH } from '../paths.js';

const PYTHON_VERSION = 'python3.10';
/**
 * Finds a Python executable by searching through the provided venv search paths.
 * Falls back to system Python if no venv is found.
 *
 * @param pythonVenvSearchPaths - Array of paths to search for Python venvs
 * @returns The path to a Python executable, or PYTHON_VERSION if using system Python
 */
export async function getPythonPath(pythonVenvSearchPaths: string[]): Promise<string> {
  for (const p of pythonVenvSearchPaths) {
    const venvPython = path.resolve(REPOSITORY_ROOT_PATH, path.join(p, 'bin', PYTHON_VERSION));
    if (await fs.pathExists(venvPython)) return venvPython;
  }

  // Assume we're using the system Python.
  return PYTHON_VERSION;
}

/**
 * Checks if Python is available and accessible. Throws an error if Python cannot be found.
 *
 * @param pythonVenvSearchPaths - Array of paths to search for Python venvs
 */
export async function ensurePythonIsAvailable(pythonVenvSearchPaths: string[]): Promise<void> {
  const pythonPath = await getPythonPath(pythonVenvSearchPaths);

  // If we're using a venv, the path was already verified to exist by getPythonPath
  if (pythonPath !== PYTHON_VERSION) {
    return;
  }

  // If we're using system Python, verify it actually exists
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  try {
    await execFileAsync(PYTHON_VERSION, ['--version']);
  } catch {
    throw new Error(
      `${PYTHON_VERSION} not found. Please install '${PYTHON_VERSION}' or set up a virtual environment. ` +
        'See https://prairielearn.readthedocs.io/en/latest/installingLocal/ for instructions.',
    );
  }
}
