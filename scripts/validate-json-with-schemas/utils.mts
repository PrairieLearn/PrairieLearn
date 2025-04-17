import fs from 'fs';
import fsPromise from 'node:fs/promises';
import path from 'node:path';
import zlib from 'zlib';

import { Ajv } from 'ajv';
import getStream from 'get-stream';
import tar from 'tar-stream';
import { type z } from 'zod';

const ajv = new Ajv({ allErrors: true });

export async function validateWithSchema(
  tarPath: string,
  zodSchema: z.ZodTypeAny,
  schemaName: string,
): Promise<void> {
  const oldJsonSchema = await fsPromise.readFile(
    path.resolve(import.meta.dirname, 'oldJsonSchemas', schemaName),
    'utf-8',
  );
  const newJsonSchema = await fsPromise.readFile(
    path.join(
      import.meta.dirname,
      '..',
      '..',
      'apps',
      'prairielearn',
      'src',
      'schemas',
      'schemas',
      schemaName,
    ),
    'utf-8',
  );

  const oldSchema = ajv.compile(JSON.parse(oldJsonSchema));
  const newSchema = ajv.compile(JSON.parse(newJsonSchema));

  const extract = tar.extract();
  const readStream = fs.createReadStream(tarPath).pipe(zlib.createGunzip());

  readStream.pipe(extract);

  let count = 0;
  const jsonErrorPaths: string[] = [];
  let jsonErrorCount = 0;
  let zodErrorCount = 0;

  for await (const entry of extract) {
    count += 1;
    const contents = await getStream(entry);
    let jsonContents: unknown;
    try {
      jsonContents = JSON.parse(contents);
    } catch (err) {
      console.error(`Error parsing ${entry.header.name}`, err);
      continue;
    }

    const oldParseResult = oldSchema(jsonContents);
    const newParseResult = newSchema(jsonContents);
    const zodParseResult = zodSchema.safeParse(jsonContents);

    if (oldParseResult !== newParseResult) {
      jsonErrorCount += 1;
      jsonErrorPaths.push(...(newSchema.errors?.map((e) => e.instancePath) ?? []));
      console.log('==========');
      console.log(`Error in entry ${entry.header.name} (old/new JSON schema mismatch):`);
      console.log(contents);
      console.log(JSON.stringify(oldSchema.errors, null, 2));
      console.log(JSON.stringify(newSchema.errors, null, 2));
      console.log('==========\n\n');
    }
    if (oldParseResult !== zodParseResult.success) {
      zodErrorCount += 1;
      console.log('==========');
      console.log(`Error in entry ${entry.header.name} (Zod parse mismatch):`);
      console.log(contents);
      console.log(JSON.stringify(zodParseResult.error?.format(), null, 2));
      console.log(JSON.stringify(oldParseResult, null, 2));
      console.log('==========\n\n');
    }
  }

  console.log(`Total entries: ${count}`);
  console.log(`Total JSON errors: ${jsonErrorCount}`);
  console.log(`Total Zod errors: ${zodErrorCount}\n\n`);

  if (jsonErrorCount > 0) {
    console.log('JSON errors found in the following paths:');
    jsonErrorPaths.forEach((path) => {
      console.log(path);
    });
  }
}
