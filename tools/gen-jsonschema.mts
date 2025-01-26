// usage:
// $ tsx gen-jsonschema.mts [check]

import fs from 'fs';
import path from 'path';

import { ajvSchemas } from '../apps/prairielearn/src/schemas/jsonSchemas.js';

// determine if we are checking or writing
const check = process.argv[2] === 'check';

console.log(check ? 'Checking schemas...' : 'Writing schemas...');
const schemaDir = path.resolve(import.meta.dirname, '../apps/prairielearn/src/schemas/schemas');
if (check) {
  for (const [name, schema] of Object.entries(ajvSchemas)) {
    const file = JSON.stringify(JSON.parse(fs.readFileSync(`${schemaDir}/${name}.json`, 'utf8')));
    if (file !== JSON.stringify(schema)) {
      console.error(`Mismatch in ${name} (Do you need to run \`tsx tools/gen-jsonschema.mts\`?)`);
      process.exit(1);
    }
  }
} else {
  for (const [name, schema] of Object.entries(ajvSchemas)) {
    // These schemas still need to be prettified, so we won't format them at all
    fs.writeFileSync(`${schemaDir}/${name}.json`, JSON.stringify(schema));
  }
}
