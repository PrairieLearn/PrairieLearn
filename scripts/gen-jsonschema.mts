#!/usr/bin/env node

// usage:
// $ tsx gen-jsonschema.mts [check]

import fs from 'fs';
import path from 'path';

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { ConfigSchema as GraderHostConfigSchema } from '../apps/grader-host/src/lib/config.js';
import {
  ConfigSchema as EnvSpecificPrairieLearnConfigSchema,
  STANDARD_COURSE_DIRS,
} from '../apps/prairielearn/src/lib/config.js';
import { ajvSchemas } from '../apps/prairielearn/src/schemas/jsonSchemas.js';
import { ConfigSchema as WorkspaceHostConfigSchema } from '../apps/workspace-host/src/lib/config.js';

// determine if we are checking or writing
const check = process.argv[2] === 'check';

const orderedStringify = (schema: any) => {
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
    'ZoneQuestionBlockJsonSchema',
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
          .reduce<Record<string, any>>((acc, key) => {
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

// The original config schema has defaults that depend on the environment.
// We remove those from the JSON Schema so we can accurately check if it has has changed.
const PrairieLearnConfigSchema = z.object({
  ...EnvSpecificPrairieLearnConfigSchema.shape,
  courseDirs: EnvSpecificPrairieLearnConfigSchema.shape.courseDirs.default(STANDARD_COURSE_DIRS),
});

const UnifiedConfigJsonSchema = zodToJsonSchema(
  z.object({
    ...GraderHostConfigSchema.shape,
    ...WorkspaceHostConfigSchema.shape,
    // We want PrairieLearn config to be the last one, so it overrides any
    // conflicting properties from the other two schemas.
    ...PrairieLearnConfigSchema.shape,
  }),
);

const configSchemas = {
  [path.resolve(import.meta.dirname, '../docs/assets/config-unified.schema.json')]:
    UnifiedConfigJsonSchema,
  [path.resolve(import.meta.dirname, '../docs/assets/config-prairielearn.schema.json')]:
    zodToJsonSchema(PrairieLearnConfigSchema),
  [path.resolve(import.meta.dirname, '../docs/assets/config-workspace-host.schema.json')]:
    zodToJsonSchema(WorkspaceHostConfigSchema),
  [path.resolve(import.meta.dirname, '../docs/assets/config-grader-host.schema.json')]:
    zodToJsonSchema(GraderHostConfigSchema),
};

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
  // docs/assets/config-*.schema.json
  for (const [filePath, schema] of Object.entries(configSchemas)) {
    try {
      const file = orderedStringify(JSON.parse(fs.readFileSync(filePath, 'utf8')));
      if (file !== orderedStringify(schema)) {
        console.error(`Mismatch in ${filePath} (Do you need to run \`make update-jsonschema\`?)`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error reading config path ${filePath}:`, error);
      process.exit(1);
    }
  }
} else {
  for (const [name, schema] of Object.entries(ajvSchemas)) {
    // These schemas still need to be prettified, so we won't format them at all
    // However, we want to preserve the order of the keys, so we'll use the replacer function

    fs.writeFileSync(`${schemaDir}/${name}.json`, orderedStringify(schema));
  }

  for (const [filePath, schema] of Object.entries(configSchemas)) {
    fs.writeFileSync(filePath, orderedStringify(schema));
  }
}
