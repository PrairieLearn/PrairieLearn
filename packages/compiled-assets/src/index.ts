import { createHash } from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import { stripVTControlCharacters } from 'node:util';
import path from 'path';

import esbuild from 'esbuild';
import expressStaticGzip from 'express-static-gzip';
import fs from 'fs-extra';
import { globby } from 'globby';
import {
  type InputOptions,
  type OutputOptions,
  type RolldownOutput,
  type RolldownWatcher,
  rolldown,
  watch,
} from 'rolldown';

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

let splitWatcher: RolldownWatcher | null = null;
let splitOutputDirectory: string | null = null;
/** Settles once the split bundles reflect the latest source changes. */
let splitBuild: Promise<Error | null> = Promise.resolve(null);
let finishSplitBuild: ((error: Error | null) => void) | null = null;

function startSplitBuild() {
  if (!finishSplitBuild) splitBuild = new Promise((resolve) => (finishSplitBuild = resolve));
}

function endSplitBuild(error: Error | null) {
  finishSplitBuild?.(error);
  finishSplitBuild = null;
}

let relativeSourcePaths: string[] | null = null;

/**
 * Node built-in modules to mark as external.
 *
 * See https://github.com/tree-sitter/tree-sitter/pull/5546.
 */
const NODE_ONLY_EXTERNALS = ['fs/promises', 'module'];

/**
 * Options for the code-split ESM bundles. These are built with Rolldown rather
 * than esbuild: esbuild assigns modules to chunks by file reachability, so an
 * entry that imports one export from a package's index also loads every module
 * the index re-exports once another entry uses them. Rolldown links imports
 * through side-effect-free re-exports to the module that defines them.
 */
function splitBundleOptions(sourceDirectory: string, sourcePaths: string[], dev: boolean) {
  const input: InputOptions = {
    input: Object.fromEntries(
      sourcePaths.map((sourcePath) => [
        path.relative(sourceDirectory, sourcePath).replace(/\.[jt]sx?$/, ''),
        sourcePath,
      ]),
    ),
    platform: 'browser',
    external: NODE_ONLY_EXTERNALS,
    onLog(level, log, defaultHandler) {
      // React libraries mark modules with "use client", which only matters for
      // server components and is meaningless in these browser bundles.
      if (log.code === 'MODULE_LEVEL_DIRECTIVE') return;
      defaultHandler(level, log);
    },
    transform: {
      target: 'es2022',
      jsx: 'react-jsx',
      define: {
        'process.env.NODE_ENV': dev ? '"development"' : '"production"',
      },
    },
  };
  const output: OutputOptions = {
    format: 'esm',
    sourcemap: dev ? 'inline' : true,
    minify: !dev,
    entryFileNames: dev ? '[name].js' : '[name]-[hash].js',
    // The dev handler routes all shared and dynamically imported chunks by this prefix.
    chunkFileNames: 'chunk-[hash].js',
  };
  return { input, output };
}

async function serveEsbuildContext(context: esbuild.BuildContext): Promise<esbuild.ServeResult> {
  // This must stay in sync with the Host header workaround in `handler()`.
  // esbuild 0.25+ validates proxied requests against the server's listening host.
  return context.serve({
    host: '0.0.0.0',
    // Use an OS-assigned port to avoid esbuild's default port 8000, which
    // conflicts with mkdocs when running `make dev-docs`.
    port: 0,
  });
}

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
      target: 'es2022',
      format: 'iife',
      sourcemap: 'inline',
      bundle: true,
      write: false,
      loader: {
        '.woff': 'file',
        '.woff2': 'file',
        '.ttf': 'file',
      },
      outbase: options.sourceDirectory,
      outdir: options.buildDirectory,
      entryNames: '[dir]/[name]',
      define: {
        'process.env.NODE_ENV': '"development"',
      },
      external: NODE_ONLY_EXTERNALS,
    });
    esbuildServer = await serveEsbuildContext(esbuildContext);

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

    // Rolldown's watcher rebuilds on change and writes to a directory that
    // `handler()` serves once the latest build has settled. The directory is
    // derived from the source directory and emptied on startup, so output left
    // behind by a server that didn't shut down cleanly doesn't accumulate.
    const sourceHash = createHash('sha256')
      .update(path.resolve(options.sourceDirectory))
      .digest('hex')
      .slice(0, 12);
    const outputDirectory = path.join(os.tmpdir(), `compiled-assets-${sourceHash}`);
    await fs.emptyDir(outputDirectory);
    splitOutputDirectory = outputDirectory;
    const { input, output } = splitBundleOptions(options.sourceDirectory, splitSourcePaths, true);
    // Requests that arrive before the initial build has started must still wait for it.
    startSplitBuild();
    splitWatcher = watch({ ...input, output: { ...output, dir: outputDirectory } });
    splitWatcher.on('event', async (event) => {
      if (event.code === 'START') {
        startSplitBuild();
      } else if (event.code === 'BUNDLE_END') {
        await event.result.close();
        endSplitBuild(null);
      } else if (event.code === 'ERROR') {
        await event.result.close();
        console.error(event.error);
        endSplitBuild(event.error);
      }
    });
  }
}

/**
 * Shuts down the development assets compiler if it is running.
 */
export async function close() {
  await Promise.all([esbuildContext?.dispose(), splitWatcher?.close()]);
  endSplitBuild(new Error('Development asset server closed'));
  splitBuild = Promise.resolve(null);
  // Keep `splitOutputDirectory` set: callers (e.g. test servers that restart
  // without re-running `init()`) may still create a handler after closing.
  if (splitOutputDirectory) await fs.remove(splitOutputDirectory);
  splitWatcher = null;
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

  if (!esbuildServer || !splitOutputDirectory) {
    throw new Error('Development asset servers not initialized');
  }

  const { port } = esbuildServer;
  const serveSplitBundles = expressStaticGzip(splitOutputDirectory, {
    // 404 immediately if the file is not found.
    serveStatic: { fallthrough: false },
  });

  // We're running in dev mode, so assets are built on the fly as they change.
  return function (...[req, res, next]: Parameters<typeof serveSplitBundles>) {
    const isSplitBundle =
      req.url?.startsWith('/scripts/esm-bundles') ||
      // Chunked assets must be served by the split server.
      req.url?.startsWith('/chunk-');

    if (isSplitBundle) {
      splitBuild
        .then((error) => {
          if (error) {
            res.writeHead(503, { 'Content-Type': 'text/plain' });
            res.end(stripVTControlCharacters(error.message));
            return;
          }
          serveSplitBundles(req, res, next);
        })
        .catch((err: unknown) => next(err));
      return;
    }

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
        port,
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

async function buildAssets(sourceDirectory: string, buildDirectory: string): Promise<BuildOutputs> {
  await fs.ensureDir(buildDirectory);

  const scriptFiles = await globby(path.join(sourceDirectory, 'scripts', '*.{js,jsx,ts,tsx}'));
  const styleFiles = await globby(path.join(sourceDirectory, 'stylesheets', '*.css'));
  const files = [...scriptFiles, ...styleFiles];
  const buildResult = await esbuild.build({
    entryPoints: files,
    target: 'es2022',
    format: 'iife',
    sourcemap: 'linked',
    bundle: true,
    minify: true,
    loader: {
      '.woff': 'file',
      '.woff2': 'file',
      '.ttf': 'file',
    },
    entryNames: '[dir]/[name]-[hash]',
    outbase: sourceDirectory,
    outdir: buildDirectory,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    external: NODE_ONLY_EXTERNALS,
    metafile: true, // Write metadata about the build
  });

  // We only build ESM bundles for scripts that are split into chunks (i.e. React components). The classic
  // (IIFE) bundles can't yet be switched to `type=module` due to load-ordering constraints; see the blockers
  // tracked in https://github.com/PrairieLearn/PrairieLearn/issues/15151.
  const scriptBundleFiles = await globby(
    path.join(sourceDirectory, 'scripts', 'esm-bundles', '**/*.{js,jsx,ts,tsx}'),
  );
  const { input, output } = splitBundleOptions(sourceDirectory, scriptBundleFiles, false);
  const bundle = await rolldown(input);
  let esmBundleOutput: RolldownOutput;
  try {
    esmBundleOutput = await bundle.write({ ...output, dir: buildDirectory });
  } finally {
    await bundle.close();
  }

  return { ...buildResult.metafile.outputs, ...rolldownOutputs(esmBundleOutput, buildDirectory) };
}

/** The parts of each output file that the manifest needs, keyed by output path. */
type BuildOutputs = Record<
  string,
  {
    entryPoint?: string;
    imports: { path: string; kind: string; external?: boolean }[];
  }
>;

function rolldownOutputs(output: RolldownOutput, buildDirectory: string): BuildOutputs {
  const outputs: BuildOutputs = {};
  const fileNames = new Set(output.output.map((file) => file.fileName));
  for (const chunk of output.output) {
    if (chunk.type !== 'chunk') continue;
    const isEntry = chunk.isEntry || chunk.isDynamicEntry;
    // Imports of external modules are listed by module ID rather than file name.
    const toImport = (kind: string) => (fileName: string) => ({
      path: path.join(buildDirectory, fileName),
      kind,
      external: !fileNames.has(fileName),
    });
    outputs[path.join(buildDirectory, chunk.fileName)] = {
      entryPoint: isEntry && chunk.facadeModuleId ? chunk.facadeModuleId : undefined,
      imports: [
        ...chunk.imports.map(toImport('import-statement')),
        ...chunk.dynamicImports.map(toImport('dynamic-import')),
      ],
    };
  }
  return outputs;
}

function makeManifest(
  outputs: BuildOutputs,
  sourceDirectory: string,
  buildDirectory: string,
): AssetsManifest {
  const manifest: AssetsManifest = {};

  Object.entries(outputs).forEach(([outputPath, meta]) => {
    if (!meta.entryPoint) return;

    // Preload the static dependency graph without crossing dynamic import
    // boundaries, so that lazy code isn't fetched before it's needed.
    const preloads = new Set<string>();

    // Recursively walk the `imports` dependency tree
    const visit = (entry: (typeof meta)['imports'][number]) => {
      if (entry.kind !== 'import-statement') return;
      // External imports aren't emitted to disk,
      // so they shouldn't be added to preloads.
      if (entry.external) return;
      const preloadPath = path.relative(buildDirectory, entry.path);
      if (preloads.has(preloadPath)) return;
      preloads.add(preloadPath);
      for (const imp of outputs[entry.path]?.imports ?? []) {
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

  const outputs = await buildAssets(sourceDirectory, buildDirectory);
  const manifest = makeManifest(outputs, sourceDirectory, buildDirectory);
  const manifestPath = path.join(buildDirectory, 'manifest.json');
  await fs.writeJSON(manifestPath, manifest);

  return manifest;
}
