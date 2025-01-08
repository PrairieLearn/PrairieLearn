import fs from 'node:fs/promises';

import { globby } from 'globby';

import { run } from '@prairielearn/run';

import { AssessmentSchema } from './schemas/index.js';

const files = await globby([
  '/Users/nathan/Downloads/us-prod-assessments/**/*.json',
  '/Users/nathan/Downloads/ca-assessments/**/*.json',
]);

let parseFailures = 0;
let validationFailures = 0;

for (const file of files) {
  const contents = await fs.readFile(file, 'utf8');
  const data = run(() => {
    try {
      return JSON.parse(contents);
    } catch (err) {
      console.error(`Error parsing ${file}: ${err.message}`);
      parseFailures += 1;
      return null;
    }
  });

  if (!data) continue;

  const result = AssessmentSchema.safeParse(data);
  if (!result.success) {
    console.error(`Error validating ${file}`);
    console.error(result.error.issues);
    validationFailures += 1;
  }
}

console.log(`Read ${files.length} files.`);
console.log(`Failed to parse ${parseFailures} files.`);
console.log(`Failed to validate ${validationFailures} files.`);
