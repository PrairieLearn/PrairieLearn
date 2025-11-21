import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'path';

import esbuild, { type Metafile } from 'esbuild';
import expressStaticGzip from 'express-static-gzip';
import fs from 'fs-extra';
import { globby } from 'globby';

import { type HtmlSafeString, html } from '@prairielearn/html';

const DEFAULT_OPTIONS = {
  dev: process.env.NODE_ENV !== 'production',
  sourceDirectory: './assets',
  buildDirectory: './public/build',
  publicPath: '/build/',
};

export type AssetsManifest = Record<
  string,
  {
    assetPath: string;
    preloads: string[];
  }
>;

export interface CompiledAssetsOptions {
  /**
   * Whether the app is running in dev mode. If dev mode is enabled, then
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

let esbuildContext: esbuild.BuildContext | null = null;
let esbuildServer: esbuild.ServeResult | null = null;

let splitEsbuildContext: esbuild.BuildContext | null = null;
let splitEsbuildServer: esbuild.ServeResult | null = null;

let relativeSourcePaths: string[] | null = null;

export async function init(newOptions: Partial<CompiledAssetsOptions>): Promise<void> {
  options = {
    ...DEFAULT_OPTIONS,
    ...newOptions,
  };

  if (!options.publicPath.endsWith('/')) {
    options.publicPath += '/';
  }

  if (options.dev) {
    // Use esbuild's asset server in development.
    //
    // Note that esbuild doesn't support globs, so the server will not pick up
    // new entrypoints that are added while the server is running.
    const sourceGlob = path.join(options.sourceDirectory, '*', '*.{js,ts,jsx,tsx,css}');
    const sourcePaths = await globby(sourceGlob);

    // Save the result of globbing for the source paths so that we can later
    // check if a given filename exists.
    relativeSourcePaths = sourcePaths.map((p) => path.relative(options.sourceDirectory, p));

    esbuildContext = await esbuild.context({
      entryPoints: sourcePaths,
      target: 'es2017',
      format: 'iife',
      sourcemap: 'inline',
      bundle: true,
      write: false,
      loader: {
        '.woff': 'file',
        '.woff2': 'file',
      },
      outbase: options.sourceDirectory,
      outdir: options.buildDirectory,
      entryNames: '[dir]/[name]',
      define: {
        'process.env.NODE_ENV': '"development"',
      },
    });
    esbuildServer = await esbuildContext.serve({ host: '0.0.0.0' });

    const splitSourceGlob = path.join(
      options.sourceDirectory,
      'scripts',
      'esm-bundles',
      '**',
      '*.{js,ts,jsx,tsx}',
    );
    const splitSourcePaths = await globby(splitSourceGlob);

    relativeSourcePaths.push(
      ...splitSourcePaths.map((p) => path.relative(options.sourceDirectory, p)),
    );

    splitEsbuildContext = await esbuild.context({
      entryPoints: splitSourcePaths,
      target: 'es2017',
      format: 'esm',
      sourcemap: 'inline',
      bundle: true,
      splitting: true,
      write: false,
      outbase: options.sourceDirectory,
      outdir: options.buildDirectory,
      entryNames: '[dir]/[name]',
      define: {
        'process.env.NODE_ENV': '"development"',
      },
    });
    splitEsbuildServer = await splitEsbuildContext.serve({ host: '0.0.0.0' });
  }
}

/**
 * Shuts down the development assets compiler if it is running.
 */
export async function close() {
  esbuildContext?.dispose();
  splitEsbuildContext?.dispose();
}

export function assertConfigured(): void {
  if (!options) {
    throw new Error('@prairielearn/compiled-assets was not configured');
  }
}

export function handler() {
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
        // 404 immediately if the file is not found.
        fallthrough: false,
        maxAge: '31557600',
        immutable: true,
      },
    });
  }

  if (!esbuildServer || !splitEsbuildServer) {
    throw new Error('esbuild server not initialized');
  }

  const { port } = esbuildServer;
  const { port: splitPort } = splitEsbuildServer;

  // We're running in dev mode, so we need to boot up esbuild to start building
  // and watching our assets.
  return function (req: IncomingMessage, res: ServerResponse) {
    const isSplitBundle =
      req.url?.startsWith('/scripts/esm-bundles') ||
      // Chunked assets must be served by the split server.
      req.url?.startsWith('/chunk-');

    // esbuild will reject requests that come from hosts other than the host on
    // which the esbuild dev server is listening:
    // https://github.com/evanw/esbuild/commit/de85afd65edec9ebc44a11e245fd9e9a2e99760d
    // https://github.com/evanw/esbuild/releases/tag/v0.25.0
    // We work around this by modifying the request headers to make it look like
    // the request is coming from localhost, which esbuild won't reject.
    const headers = structuredClone(req.headers);
    headers.host = 'localhost';
    delete headers['x-forwarded-for'];
    delete headers['x-forwarded-host'];
    delete headers['x-forwarded-proto'];
    delete headers['referer'];

    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port: isSplitBundle ? splitPort : port,
        path: req.url,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      },
    );
    req.pipe(proxyReq, { end: true });
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

function compiledPath(type: 'scripts' | 'stylesheets', sourceFile: string): string {
  assertConfigured();
  const sourceFilePath = `${type}/${sourceFile}`;

  if (options.dev) {
    // To ensure that errors that would be raised in production are also raised
    // in development, we'll check for the existence of the asset file on disk.
    // This mirrors the production check of the file in the manifest: if a file
    // exists on disk, it should be in the manifest.
    if (!relativeSourcePaths?.find((p) => p === sourceFilePath)) {
      throw new Error(`Unknown ${type} asset: ${sourceFile}`);
    }

    return options.publicPath + sourceFilePath.replace(/\.(js|ts)x?$/, '.js');
  }

  const manifest = readManifest();
  const asset = manifest[sourceFilePath];
  if (!asset) {
    throw new Error(`Unknown ${type} asset: ${sourceFile}`);
  }

  return options.publicPath + asset.assetPath;
}

export function compiledScriptPath(sourceFile: string): string {
  return compiledPath('scripts', sourceFile);
}

export function compiledStylesheetPath(sourceFile: string): string {
  return compiledPath('stylesheets', sourceFile);
}

export function compiledScriptTag(sourceFile: string): HtmlSafeString {
  // Creates a script tag for an IIFE bundle.
  return html`<script src="${compiledScriptPath(sourceFile)}"></script>`;
}

export function compiledStylesheetTag(sourceFile: string): HtmlSafeString {
  return html`<link rel="stylesheet" href="${compiledStylesheetPath(sourceFile)}" />`;
}

export function compiledScriptModuleTag(sourceFile: string): HtmlSafeString {
  // Creates a module script tag for an ESM bundle.
  return html`<script type="module" src="${compiledScriptPath(sourceFile)}"></script>`;
}

export function compiledScriptPreloadPaths(sourceFile: string): string[] {
  assertConfigured();

  // In dev mode, we don't have a manifest, so we can't preload anything.
  if (options.dev) return [];

  const manifest = readManifest();
  const asset = manifest[`scripts/${sourceFile}`];
  if (!asset) {
    throw new Error(`Unknown script asset: ${sourceFile}`);
  }

  return asset.preloads.map((preload) => options.publicPath + preload);
}

async function buildAssets(sourceDirectory: string, buildDirectory: string): Promise<Metafile> {
  await fs.ensureDir(buildDirectory);

  const scriptFiles = await globby(path.join(sourceDirectory, 'scripts', '*.{js,jsx,ts,tsx}'));
  const styleFiles = await globby(path.join(sourceDirectory, 'stylesheets', '*.css'));
  const files = [...scriptFiles, ...styleFiles];
  const buildResult = await esbuild.build({
    entryPoints: files,
    target: 'es2017',
    format: 'iife',
    sourcemap: 'linked',
    bundle: true,
    minify: true,
    loader: {
      '.woff': 'file',
      '.woff2': 'file',
    },
    entryNames: '[dir]/[name]-[hash]',
    outbase: sourceDirectory,
    outdir: buildDirectory,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    metafile: true, // Write metadata about the build
  });

  // For now, we only build ESM bundles for scripts that are split into chunks (i.e. Preact components)
  // Using 'type=module' in the script tag for ESM means that it is loaded after all 'classic' scripts,
  // which causes issues with bootstrap-table. See https://github.com/PrairieLearn/PrairieLearn/pull/12180.
  const scriptBundleFiles = await globby(
    path.join(sourceDirectory, 'scripts', 'esm-bundles', '**/*.{js,jsx,ts,tsx}'),
  );
  const esmBundleBuildResult = await esbuild.build({
    entryPoints: scriptBundleFiles,
    target: 'es2017',
    format: 'esm',
    sourcemap: 'linked',
    bundle: true,
    splitting: true,
    minify: true,
    entryNames: '[dir]/[name]-[hash]',
    outbase: sourceDirectory,
    outdir: buildDirectory,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    metafile: true,
  });

  // Merge the resulting metafiles.
  const metafile: Metafile = {
    inputs: { ...buildResult.metafile.inputs, ...esmBundleBuildResult.metafile.inputs },
    outputs: { ...buildResult.metafile.outputs, ...esmBundleBuildResult.metafile.outputs },
  };

  return metafile;
}

function makeManifest(
  metafile: Metafile,
  sourceDirectory: string,
  buildDirectory: string,
): AssetsManifest {
  const manifest: AssetsManifest = {};

  Object.entries(metafile.outputs).forEach(([outputPath, meta]) => {
    if (!meta.entryPoint) return;

    // Compute all the necessary preloads for each entrypoint. This includes
    // any code-split chunks, as well as any files that are dynamically imported.
    const preloads = new Set<string>();

    // Recursively walk the `imports` dependency tree
    const visit = (entry: (typeof meta)['imports'][number]) => {
      if (!['import-statement', 'dynamic-import'].includes(entry.kind)) return;
      const preloadPath = path.relative(buildDirectory, entry.path);
      if (preloads.has(preloadPath)) return;
      preloads.add(preloadPath);
      for (const imp of metafile.inputs[entry.path]?.imports ?? []) {
        visit(imp);
      }
    };

    for (const imp of meta.imports) {
      visit(imp);
    }

    const entryPath = path.relative(sourceDirectory, meta.entryPoint);
    const assetPath = path.relative(buildDirectory, outputPath);
    manifest[entryPath] = {
      assetPath,
      preloads: [...preloads],
    };
  });

  return manifest;
}

export async function build(
  sourceDirectory: string,
  buildDirectory: string,
): Promise<AssetsManifest> {
  // Remove existing assets to ensure that no stale assets are left behind.
  await fs.remove(buildDirectory);

  const metafile = await buildAssets(sourceDirectory, buildDirectory);
  const manifest = makeManifest(metafile, sourceDirectory, buildDirectory);
  const manifestPath = path.join(buildDirectory, 'manifest.json');
  await fs.writeJSON(manifestPath, manifest);

  return manifest;
}
