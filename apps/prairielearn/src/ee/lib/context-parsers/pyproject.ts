import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { REPOSITORY_ROOT_PATH } from '../../../lib/paths.js';

const PyProjectTomlSchema = z.object({
  project: z.object({
    dependencies: z.array(z.string()),
  }),
});

export async function getPythonLibraries(): Promise<string[]> {
  const data = await fs.readFile(path.join(REPOSITORY_ROOT_PATH, 'pyproject.toml'), {
    encoding: 'utf-8',
  });

  const { parse } = await import('smol-toml');
  return PyProjectTomlSchema.parse(parse(data)).project.dependencies;
}
