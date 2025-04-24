// usage:
// $ tsx gen-jsonschema.mts [check]

import fs from 'fs';
import path from 'path';

import { ajvSchemas } from '../apps/prairielearn/src/schemas/jsonSchemas.js';

// determine if we are checking or writing
const check = process.argv[2] === 'check';

const orderedStringify = (schema) => {
  // TODO: this is a hack to get the schemas to be in a consistent order
  // Remove in a future PR
  const headKeys = [
    '$schema',
    'title',
    'description',
    'type',
    'additionalProperties',
    'required',
    'comment',
    // infoAssessment to improve diff
    'GroupRoleJsonSchema',
    'AssessmentAccessRuleJsonSchema',
    'ZoneAssessmentJsonSchema',
    'ZoneQuestionJsonSchema',
    'QuestionAlternativeJsonSchema',
    'PointsJsonSchema',
    'PointsSingleJsonSchema',
    'PointsListJsonSchema',
    'QuestionIdJsonSchema',
    'ForceMaxPointsJsonSchema',
    'AdvanceScorePercJsonSchema',
  ];

  const tailKeys = ['definitions'];

  return JSON.stringify(
    schema,
    (key, value) => {
      if (key === 'additionalProperties' && value === true) return undefined;

      let localHeadKeys = headKeys;
      if (key === 'properties') {
        localHeadKeys = headKeys.filter((k) => !['title', 'type', 'description'].includes(k));
      }

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return Object.keys(value)
          .filter((k) => {
            return !(k === 'additionalProperties' && value[k] === true);
          })
          .sort((a, b) => {
            if (localHeadKeys.includes(a) && localHeadKeys.includes(b)) {
              return localHeadKeys.indexOf(a) - localHeadKeys.indexOf(b);
            }
            if (tailKeys.includes(a) && tailKeys.includes(b)) {
              return tailKeys.indexOf(a) - tailKeys.indexOf(b);
            }
            if (localHeadKeys.includes(a)) {
              return -1;
            }
            if (localHeadKeys.includes(b)) {
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
    },
    2,
  );
};

console.log(check ? 'Checking schemas...' : 'Writing schemas...');
const schemaDir = path.resolve(import.meta.dirname, '../apps/prairielearn/src/schemas/schemas');
if (check) {
  for (const [name, schema] of Object.entries(ajvSchemas)) {
    // Compare abstract contents are the same since prettier formatting may be different
    try {
      const file = orderedStringify(
        JSON.parse(fs.readFileSync(`${schemaDir}/${name}.json`, 'utf8')),
      );
      if (file !== orderedStringify(schema)) {
        console.error(`Mismatch in ${name} (Do you need to run \`make update-jsonschema\`?)`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error reading schema file ${name}.json:`, error);
      process.exit(1);
    }
  }
} else {
  for (const [name, schema] of Object.entries(ajvSchemas)) {
    // These schemas still need to be prettified, so we won't format them at all
    // However, we want to preserve the order of the keys, so we'll use the replacer function

    fs.writeFileSync(`${schemaDir}/${name}.json`, orderedStringify(schema));
  }
}
