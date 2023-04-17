import fs from 'node:fs/promises';
import path from 'node:path';
import { ConfigLoader, makeFileConfigSource } from '@prairielearn/config';

import { ConfigSchema } from '../lib/config-new.js';

// The first argument should be a path containing JSON files.
const dir = process.argv[2];

// Read all JSON files in the directory.
const files = await fs.readdir(dir);

// File out any non-JSON files.
const jsonFiles = files.filter((file) => file.endsWith('.json'));

// For each JSON file, attempt to load it as a config file.
for (const file of jsonFiles) {
  const filePath = path.join(dir, file);
  const loader = new ConfigLoader(ConfigSchema);
  await loader.loadAndValidate([makeFileConfigSource(filePath)]);
}
