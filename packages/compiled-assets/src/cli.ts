#!/usr/bin/env node
import path from 'path';
import { promisify } from 'util';
import zlib from 'zlib';

import { program } from 'commander';
import fs from 'fs-extra';
import prettyBytes from 'pretty-bytes';

import { type AssetsManifest, build } from './index.js';

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

type CompressedSizes = Record<string, Record<string, number>>;

async function writeCompressedAssets(
  destination: string,
  manifest: AssetsManifest,
): Promise<CompressedSizes> {
  const compressedSizes: CompressedSizes = {};
  await Promise.all(
    Object.values(manifest).map(async (asset) => {
      const destinationFilePath = path.resolve(destination, asset.assetPath);
      const contents = await fs.readFile(destinationFilePath);
      const gzipCompressed = await gzip(contents);
      const brotliCompressed = await brotli(contents);
      await fs.writeFile(`${destinationFilePath}.gz`, gzipCompressed);
      await fs.writeFile(`${destinationFilePath}.br`, brotliCompressed);
      compressedSizes[asset.assetPath] = {
        raw: contents.length,
        gzip: gzipCompressed.length,
        brotli: brotliCompressed.length,
      };
    }),
  );
  return compressedSizes;
}

program.command('build <source> <destination>').action(async (source, destination) => {
  const manifest = await build(source, destination);

  // Write gzip and brotli versions of the output files. Record size information
  // so we can show it to the user.
  const compressedSizes = await writeCompressedAssets(destination, manifest);

  // Format the output into an object that we can pass to `console.table`.
  const results: Record<string, any> = {};
  Object.entries(manifest).forEach(([entryPoint, asset]) => {
    const sizes = compressedSizes[asset.assetPath];
    results[entryPoint] = {
      'Output file': asset.assetPath,
      Size: prettyBytes(sizes.raw),
      'Size (gzip)': prettyBytes(sizes.gzip),
      'Size (brotli)': prettyBytes(sizes.brotli),
    };
  });
  console.table(results);
});

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
