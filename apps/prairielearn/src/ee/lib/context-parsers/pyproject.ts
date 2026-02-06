import fs from 'node:fs/promises';
import path from 'node:path';

import { parse } from 'smol-toml';
import { z } from 'zod';

import { REPOSITORY_ROOT_PATH } from '../../../lib/paths.js';

const PyProjectTomlSchema = z.object({
  project: z.object({
    dependencies: z.array(z.string()),
  }),
});

let cachedPythonLibraries: string[] | null = null;

export async function getPythonLibraries(): Promise<string[]> {
  if (cachedPythonLibraries !== null) return cachedPythonLibraries;

  const data = await fs.readFile(path.join(REPOSITORY_ROOT_PATH, 'pyproject.toml'), {
    encoding: 'utf-8',
  });

  const dependencies = PyProjectTomlSchema.parse(parse(data)).project.dependencies;

  // This is sort of an artificial dependency. It doesn't exist in `pyproject.toml`
  // and isn't installed from PyPi, but it is available at runtime in PrairieLearn.
  // We'll include it here so that the LLM doesn't get confused by example questions
  // that import it.
  dependencies.push('prairielearn');

  cachedPythonLibraries = dependencies;
  return cachedPythonLibraries;
}
