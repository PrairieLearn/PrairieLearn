#!/usr/bin/env node

// usage:
// $ tsx gen-jsonschema.mts [check]

import fs from 'fs';
import path from 'path';

import * as prettier from 'prettier';
import { z } from 'zod';

import { ConfigSchema as GraderHostConfigSchema } from '../apps/grader-host/src/lib/config.js';
import {
  ConfigSchema as EnvSpecificPrairieLearnConfigSchema,
  STANDARD_COURSE_DIRS,
} from '../apps/prairielearn/src/lib/config.js';
import { ajvSchemas } from '../apps/prairielearn/src/schemas/jsonSchemas.js';
import { ConfigSchema as WorkspaceHostConfigSchema } from '../apps/workspace-host/src/lib/config.js';

// Zod 4's `z.toJSONSchema` only emits `additionalProperties: false` for strict
// objects, but the runtime config schema is a plain (non-strict) `z.object` that
// silently strips unknown keys. The *published* config schemas should still flag
// unknown/misspelled keys for editors validating against them, so we close plain
// objects here (records keep their own `additionalProperties`) without making the
// runtime schema strict.
const closeObjectsForDocs = (node: unknown): void => {
  if (Array.isArray(node)) {
    node.forEach(closeObjectsForDocs);
  } else if (node !== null && typeof node === 'object') {
    const obj = node as Record<string, any>;
    if (obj.type === 'object' && obj.properties && obj.additionalProperties === undefined) {
      obj.additionalProperties = false;
    }
    Object.values(obj).forEach(closeObjectsForDocs);
  }
};

const configToJsonSchema = (schema: z.ZodType) => {
  const jsonSchema = z.toJSONSchema(schema, {
    target: 'draft-07',
    io: 'input',
    unrepresentable: 'any',
  });
  closeObjectsForDocs(jsonSchema);
  return jsonSchema;
};

// Serialize the raw Zod 4 output and format it with the repo's prettier config so
// the result is identical to the committed files (no separate prettier pass needed).
const formatSchema = async (filePath: string, schema: unknown) => {
  const config = await prettier.resolveConfig(filePath);
  return prettier.format(JSON.stringify(schema, null, 2), { ...config, filepath: filePath });
};

// determine if we are checking or writing
const check = process.argv[2] === 'check';

console.log(check ? 'Checking schemas...' : 'Writing schemas...');
const schemaDir = path.resolve(import.meta.dirname, '../apps/prairielearn/src/schemas/schemas');

// The original config schema has defaults that depend on the environment.
// We remove those from the JSON Schema so we can accurately check if it has has changed.
const PrairieLearnConfigSchema = z.object({
  ...EnvSpecificPrairieLearnConfigSchema.shape,
  courseDirs: EnvSpecificPrairieLearnConfigSchema.shape.courseDirs.default(STANDARD_COURSE_DIRS),
});

const UnifiedConfigJsonSchema = configToJsonSchema(
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
    configToJsonSchema(PrairieLearnConfigSchema),
  [path.resolve(import.meta.dirname, '../docs/assets/config-workspace-host.schema.json')]:
    configToJsonSchema(WorkspaceHostConfigSchema),
  [path.resolve(import.meta.dirname, '../docs/assets/config-grader-host.schema.json')]:
    configToJsonSchema(GraderHostConfigSchema),
};

const targets: [filePath: string, schema: unknown][] = [
  ...Object.entries(ajvSchemas).map(([name, schema]): [string, unknown] => [
    `${schemaDir}/${name}.json`,
    schema,
  ]),
  ...Object.entries(configSchemas),
];

if (check) {
  for (const [filePath, schema] of targets) {
    try {
      const file = fs.readFileSync(filePath, 'utf8');
      if (file !== (await formatSchema(filePath, schema))) {
        console.error(
          `Mismatch in ${path.basename(filePath)} (Do you need to run \`make update-jsonschema\`?)`,
        );
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error reading schema file ${filePath}:`, error);
      process.exit(1);
    }
  }
} else {
  for (const [filePath, schema] of targets) {
    fs.writeFileSync(filePath, await formatSchema(filePath, schema));
  }
}
