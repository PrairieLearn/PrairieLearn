import type { RequestHandler } from 'express';
import expressStaticGzip from 'express-static-gzip';
import esbuild from 'esbuild';
import path from 'path';
import globby from 'globby';
import fs from 'fs-extra';
import { html, HtmlSafeString } from '@prairielearn/html';

const DEFAULT_OPTIONS = {
  dev: process.env.NODE_ENV !== 'production',
  sourceDirectory: './assets',
  buildDirectory: './public/build',
  publicPath: '/build/',
};

export interface CompiledAssetsOptions {
  /**
   * Whether the app is running in dev mode. If dev modde is enabled, then
   * assets will be built on the fly as they're requested. Otherwise, assets
   * should have been pre-compiled to the `buildDirectory` directory.
   */
  dev?: boolean;
  /** Root directory of assets. */
  sourceDirectory?: string;
  /** Directory where the built assets will be output to. */
  buildDirectory?: string;
  /** The path that assets will be served from, e.g. `/build/`. */
  publicPath?: string;
}

let options: Required<CompiledAssetsOptions> = { ...DEFAULT_OPTIONS };

export function init(newOptions: Partial<CompiledAssetsOptions>): void {
  options = {
    ...DEFAULT_OPTIONS,
    ...newOptions,
  };
  if (!options.publicPath.endsWith('/')) {
    options.publicPath += '/';
  }
}

export function assertConfigured(): void {
  if (!options) {
    throw new Error('@prairielearn/compiled-assets was not configured');
  }
}

export function handler(): RequestHandler {
  assertConfigured();

  if (!options?.dev) {
    // We're running in production: serve all assets from the build directory.
    // Set headers to cache for as long as possible, since the assets will
    // include content hashes in their filenames.
    return expressStaticGzip(options?.buildDirectory, {
      enableBrotli: true,
      // Prefer Brotli if the client supports it.
      orderPreference: ['br'],
      serveStatic: {
        maxAge: '31557600',
        immutable: true,
      },
    });
  }

  // We're running in dev mode, so we need to boot up ESBuild to start building
  // and watching our assets.
  return function (req, res) {
    // Strip leading slash from `req.url`.
    let assetPath = req.url;
    if (assetPath.startsWith('/')) {
      assetPath = assetPath.slice(1);
    }

    const resolvedSourceDirectory = path.resolve(options?.sourceDirectory);
    const resolvedAssetPath = path.resolve(resolvedSourceDirectory, assetPath);

    if (!resolvedAssetPath.startsWith(resolvedSourceDirectory)) {
      // Probably path traversal.
      res.status(404).send('Not found');
      return;
    }

    // esbuild should be fast enough that we can just build everything on the
    // fly as it's requested! This is probably just for prototyping though. We
    // should use some kind of caching to ensure that local dev stays fast.
    esbuild
      .build({
        entryPoints: [resolvedAssetPath],
        target: 'es6',
        format: 'iife',
        sourcemap: 'inline',
        bundle: true,
        write: false,
      })
      .then(
        (buildResult) => {
          res
            .setHeader('Content-Type', 'application/javascript; charset=UTF-8')
            .status(200)
            .send(buildResult.outputFiles[0].text);
        },
        (buildError: Error) => {
          res.status(500).send(buildError.message);
        }
      );
  };
}

let cachedScriptsManifest: Record<string, string> | null = null;
function readScriptsManifest(): Record<string, string> {
  assertConfigured();

  if (!cachedScriptsManifest) {
    const manifestPath = path.join(options.buildDirectory, 'scripts', 'manifest.json');
    cachedScriptsManifest = fs.readJSONSync(manifestPath) as Record<string, string>;
  }

  return cachedScriptsManifest;
}

export function compiledScriptPath(sourceFile: string): string {
  assertConfigured();

  if (options.dev) {
    return options.publicPath + 'scripts/' + sourceFile;
  }

  const scriptsManifest = readScriptsManifest();
  const scriptPath = scriptsManifest[sourceFile];
  if (!scriptPath) {
    throw new Error(`Unknown script: ${sourceFile}`);
  }

  return options.publicPath + 'scripts/' + scriptPath;
}

export function compiledScriptTag(sourceFile: string): HtmlSafeString {
  return html`<script src="${compiledScriptPath(sourceFile)}"></script>`;
}

export async function build(
  sourceDirectory: string,
  buildDirectory: string
): Promise<esbuild.Metafile> {
  // Remove existing assets to ensure that no stale assets are left behind.
  await fs.remove(buildDirectory);

  const scriptsSourceRoot = path.resolve(sourceDirectory, 'scripts');
  const scriptsBuildRoot = path.resolve(buildDirectory, 'scripts');
  await fs.ensureDir(scriptsBuildRoot);

  const files = await globby(path.join(scriptsSourceRoot, '*.{js,jsx,ts,tsx}'));
  const buildResult = await esbuild.build({
    entryPoints: files,
    target: 'es6',
    format: 'iife',
    sourcemap: 'linked',
    bundle: true,
    minify: true,
    entryNames: '[name]-[hash]',
    outdir: scriptsBuildRoot,
    metafile: true,
  });

  // Write asset manifest so that we can map from "input" names to built names
  // at runtime.
  const { metafile } = buildResult;
  const manifest: Record<string, string> = {};
  Object.entries(metafile.outputs).forEach(([outputPath, meta]) => {
    if (!meta.entryPoint) return;

    const entryPath = path.basename(meta.entryPoint);
    const assetPath = path.basename(outputPath);

    manifest[entryPath] = assetPath;
  });
  const manifestPath = path.join(scriptsBuildRoot, 'manifest.json');
  await fs.writeJSON(manifestPath, manifest);

  return metafile;
}
