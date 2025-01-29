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
    // However, we want to preserve the order of the keys, so we'll use the replacer function
    const headKeys = [
      '$schema',
      'title',
      'description',
      'type',
      'additionalProperties',
      'required',
      'comment',
    ];

    const tailKeys = ['definitions'];
    // Thanks chatgpt!
    const schemaString = JSON.stringify(schema, (key, value) => {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return Object.keys(value)
          .sort((a, b) => {
            if (headKeys.includes(a) && headKeys.includes(b)) {
              return headKeys.indexOf(a) - headKeys.indexOf(b);
            }
            if (tailKeys.includes(a) && tailKeys.includes(b)) {
              return tailKeys.indexOf(a) - tailKeys.indexOf(b);
            }
            if (headKeys.includes(a)) {
              return -1;
            }
            if (headKeys.includes(b)) {
              return 1;
            }
            if (tailKeys.includes(a)) {
              return 1;
            }
            if (tailKeys.includes(b)) {
              return -1;
            }
            return 0;
          })
          .reduce((acc, key) => {
            acc[key] = value[key];
            return acc;
          }, {});
      }
      return value;
    });
    fs.writeFileSync(`${schemaDir}/${name}.json`, schemaString);
  }
}
