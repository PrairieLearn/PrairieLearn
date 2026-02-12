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

interface AssetSizes {
  raw: number;
  gzip: number;
  brotli: number;
}

type CompressedSizes = Record<string, AssetSizes>;

/**
 * Collects all unique asset paths from the manifest, including entry points and their preloads.
 */
function getAllAssetPaths(manifest: AssetsManifest): Set<string> {
  const allPaths = new Set<string>();
  for (const asset of Object.values(manifest)) {
    allPaths.add(asset.assetPath);
    for (const preload of asset.preloads) {
      allPaths.add(preload);
    }
  }
  return allPaths;
}

/**
 * Writes gzip and brotli compressed versions of the assets in the specified directory.
 * It reads each asset file, compresses it using gzip and brotli algorithms, and writes the compressed files
 * with appropriate extensions (.gz and .br) in the same directory.
 *
 * @param destination Directory where the compressed assets will be written.
 * @param manifest The assets manifest containing information about the assets.
 * @returns A promise that resolves to an object containing the sizes of the original, gzip, and brotli compressed assets.
 */
async function writeCompressedAssets(
  destination: string,
  manifest: AssetsManifest,
): Promise<CompressedSizes> {
  const compressedSizes: CompressedSizes = {};
  const allAssetPaths = getAllAssetPaths(manifest);

  await Promise.all(
    [...allAssetPaths].map(async (assetPath) => {
      const destinationFilePath = path.resolve(destination, assetPath);
      const contents = await fs.readFile(destinationFilePath);
      const gzipCompressed = await gzip(contents);
      const brotliCompressed = await brotli(contents);
      await fs.writeFile(`${destinationFilePath}.gz`, gzipCompressed);
      await fs.writeFile(`${destinationFilePath}.br`, brotliCompressed);
      compressedSizes[assetPath] = {
        raw: contents.length,
        gzip: gzipCompressed.length,
        brotli: brotliCompressed.length,
      };
    }),
  );
  return compressedSizes;
}

/**
 * Calculates the total size of an entry point including all its preloaded chunks.
 */
function calculateTotalSizes(
  asset: AssetsManifest[string],
  compressedSizes: CompressedSizes,
): AssetSizes {
  const entrySizes = compressedSizes[asset.assetPath];
  const total: AssetSizes = {
    raw: entrySizes.raw,
    gzip: entrySizes.gzip,
    brotli: entrySizes.brotli,
  };

  for (const preload of asset.preloads) {
    const preloadSizes = compressedSizes[preload];
    if (preloadSizes) {
      total.raw += preloadSizes.raw;
      total.gzip += preloadSizes.gzip;
      total.brotli += preloadSizes.brotli;
    }
  }

  return total;
}

program.command('build <source> <destination>').action(async (source, destination) => {
  const manifest = await build(source, destination);

  // Write gzip and brotli versions of the output files. Record size information
  // so we can show it to the user.
  const compressedSizes = await writeCompressedAssets(destination, manifest);

  // Format the output into an object that we can pass to `console.table`.
  const results: Record<string, any> = {};
  const sizesJson: Record<string, AssetSizes> = {};
  Object.entries(manifest).forEach(([entryPoint, asset]) => {
    const totalSizes = calculateTotalSizes(asset, compressedSizes);

    results[entryPoint] = {
      'Output file': asset.assetPath,
      Size: prettyBytes(totalSizes.raw),
      'Size (gzip)': prettyBytes(totalSizes.gzip),
      'Size (brotli)': prettyBytes(totalSizes.brotli),
    };

    sizesJson[entryPoint] = totalSizes;
  });
  console.table(results);

  // Write the result for processing by other tools (e.g. our bundle size reporting action).
  await fs.writeJSON(path.resolve(destination, 'sizes.json'), sizesJson, { spaces: 2 });
});

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
