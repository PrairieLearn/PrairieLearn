import type { RequestHandler } from 'express';
import expressStaticGzip from 'express-static-gzip';
import esbuild, { Metafile } from 'esbuild';
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

type AssetsManifest = Record<string, string>;

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

let cachedManifest: AssetsManifest | null = null;
function readManifest(): AssetsManifest {
  assertConfigured();

  if (!cachedManifest) {
    const manifestPath = path.join(options.buildDirectory, 'manifest.json');
    cachedManifest = fs.readJSONSync(manifestPath) as AssetsManifest;
  }

  return cachedManifest;
}

function compiledPath(type: 'scripts' | 'styles', sourceFile: string): string {
  assertConfigured();
  const sourceFilePath = `${type}/${sourceFile}`;

  if (options.dev) {
    return options.publicPath + sourceFilePath;
  }

  const manifest = readManifest();
  const assetPath = manifest[sourceFilePath];
  if (!assetPath) {
    throw new Error(`Unknown ${type} asset: ${sourceFile}`);
  }

  return options.publicPath + type + '/' + assetPath;
}

export function compiledScriptPath(sourceFile: string): string {
  return compiledPath('scripts', sourceFile);
}

export function compiledStylesPath(sourceFile: string): string {
  return compiledPath('styles', sourceFile);
}

export function compiledScriptTag(sourceFile: string): HtmlSafeString {
  return html`<script src="${compiledScriptPath(sourceFile)}"></script>`;
}

export function compiledStylesTag(sourceFile: string): HtmlSafeString {
  return html`<link rel="stylesheet" href="${compiledStylesPath(sourceFile)}" />`;
}

async function buildScripts(sourceDirectory: string, buildDirectory: string) {
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

  return buildResult.metafile;
}

async function buildStyles(sourceDirectory: string, buildDirectory: string) {
  const stylesSourceRoot = path.resolve(sourceDirectory, 'styles');
  const stylesBuildRoot = path.resolve(buildDirectory, 'styles');
  await fs.ensureDir(stylesBuildRoot);

  const files = await globby(path.join(stylesSourceRoot, '*.css'));
  const buildResult = await esbuild.build({
    entryPoints: files,
    sourcemap: 'linked',
    bundle: true,
    minify: true,
    entryNames: '[name]-[hash]',
    outdir: stylesBuildRoot,
    metafile: true,
  });

  return buildResult.metafile;
}

function makeManifest(type: 'scripts' | 'styles', metafile: Metafile): Record<string, string> {
  const manifest: Record<string, string> = {};
  Object.entries(metafile.outputs).forEach(([outputPath, meta]) => {
    if (!meta.entryPoint) return;

    const entryPath = path.join(type, path.basename(meta.entryPoint));
    const assetPath = path.join(type, path.basename(outputPath));
    manifest[entryPath] = assetPath;
  });
  return manifest;
}

export async function build(
  sourceDirectory: string,
  buildDirectory: string
): Promise<AssetsManifest> {
  // Remove existing assets to ensure that no stale assets are left behind.
  await fs.remove(buildDirectory);

  const [scriptsMetafile, stylesMetafile] = await Promise.all([
    buildScripts(sourceDirectory, buildDirectory),
    buildStyles(sourceDirectory, buildDirectory),
  ]);

  const manifest: AssetsManifest = {
    ...makeManifest('scripts', scriptsMetafile),
    ...makeManifest('styles', stylesMetafile),
  };

  const manifestPath = path.join(buildDirectory, 'manifest.json');
  await fs.writeJSON(manifestPath, manifest);

  return manifest;
}
