#!/usr/bin/env node
import fs from 'fs-extra';
import prettyBytes from 'pretty-bytes';
import path from 'path';
import { promisify } from 'util';
import zlib from 'zlib';
import { program } from 'commander';

import { build } from './index.js';

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

program.command('build <source> <destination>').action(async (source, destination) => {
  const metafile = await build(source, destination);

  // Write gzip and brotli versions of the output files. Record size information
  // so we can show it to the user.
  const compressedSizes: Record<string, Record<string, number>> = {};
  await Promise.all(
    Object.keys(metafile.outputs).map(async (outputPath) => {
      const contents = await fs.readFile(outputPath);
      const gzipCompressed = await gzip(contents);
      const brotliCompressed = await brotli(contents);
      await fs.writeFile(`${outputPath}.gz`, gzipCompressed);
      await fs.writeFile(`${outputPath}.br`, brotliCompressed);
      compressedSizes[outputPath] = {
        gzip: gzipCompressed.length,
        brotli: brotliCompressed.length,
      };
    })
  );

  // Format the output into an object that we can pass to `console.table`.
  const results: Record<string, any> = {};
  Object.entries(metafile.outputs).forEach(([outputPath, meta]) => {
    if (!meta.entryPoint) return;
    results[path.basename(meta.entryPoint)] = {
      'Output file': path.basename(outputPath),
      Size: prettyBytes(meta.bytes),
      'Size (gzip)': prettyBytes(compressedSizes[outputPath].gzip),
      'Size (brotli)': prettyBytes(compressedSizes[outputPath].brotli),
    };
  });
  console.table(results);
});

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
