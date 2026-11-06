import path from 'path';

import express from 'express';
import fs from 'fs-extra';
import getPort from 'get-port';
import tmp from 'tmp-promise';
import { afterEach, assert, describe, it } from 'vitest';

import {
  type CompiledAssetsOptions,
  build,
  close,
  compiledScriptPath,
  compiledStylesheetPath,
  handler,
  init,
} from './index.js';

async function testProject(options: CompiledAssetsOptions) {
  await tmp.withDir(
    async (dir) => {
      // macOS does weird things with symlinks in its tmp directories. Resolve
      // the real path so that our asset-building machinery doesn't get confused.
      const tmpDir = await fs.realpath(dir.path);

      const scriptsRoot = path.join(tmpDir, 'assets', 'scripts');
      await fs.ensureDir(scriptsRoot);

      const stylesRoot = path.join(tmpDir, 'assets', 'stylesheets');
      await fs.ensureDir(stylesRoot);

      const jsScriptPath = path.join(scriptsRoot, 'foo.js');
      await fs.writeFile(jsScriptPath, 'console.log("foo")');

      const tsScriptPath = path.join(scriptsRoot, 'bar.ts');
      await fs.writeFile(tsScriptPath, 'interface Foo {};\n\nconsole.log("bar")');

      const stylesPath = path.join(stylesRoot, 'baz.css');
      await fs.writeFile(stylesPath, 'body { color: red; }');

      await fs.copy(
        path.join(import.meta.dirname, 'test-fixtures/lazy-loading'),
        path.join(tmpDir, 'assets'),
      );

      if (!options.dev) {
        await build(path.join(tmpDir, 'assets'), path.join(tmpDir, 'public', 'build'));
      }

      await init({
        sourceDirectory: path.join(tmpDir, 'assets'),
        buildDirectory: path.join(tmpDir, 'public', 'build'),
        publicPath: '/build',
        ...options,
      });

      const port = await getPort();
      const app = express();
      app.use('/build', handler());
      const server = app.listen(port);

      try {
        const jsRes = await fetch(`http://localhost:${port}${compiledScriptPath('foo.js')}`);
        assert.isTrue(jsRes.ok);
        assert.match(await jsRes.text(), /console\.log\("foo"\)/);

        const cssRes = await fetch(`http://localhost:${port}${compiledStylesheetPath('baz.css')}`);
        assert.isTrue(cssRes.ok);
        const cssText = await cssRes.text();
        assert.match(cssText, /body\s*\{/);
        assert.match(cssText, /color:\s*red/);

        const moduleUrl = `http://localhost:${port}${compiledScriptPath('esm-bundles/main.js')}`;
        const moduleRes = await fetch(moduleUrl);
        assert.isTrue(moduleRes.ok);
        const lazyImport = /import\("([^"]+)"\)/.exec(await moduleRes.text());
        assert.isNotNull(lazyImport);
        const lazyRes = await fetch(new URL(lazyImport[1], moduleUrl));
        assert.isTrue(lazyRes.ok);
        assert.include(await lazyRes.text(), 'lazy:');

        assert.throws(
          () => compiledScriptPath('nonexistent.js'),
          'Unknown scripts asset: nonexistent.js',
        );
        assert.throws(
          () => compiledStylesheetPath('nonexistent.css'),
          'Unknown stylesheets asset: nonexistent.css',
        );
      } finally {
        server.close();
      }
    },
    {
      unsafeCleanup: true,
    },
  );
}

describe('compiled-assets', () => {
  afterEach(async () => close());

  it('works in dev mode', async () => {
    await testProject({ dev: true });
  });

  it('works in prod mode', async () => {
    await testProject({ dev: false });
  });

  it('preloads shared static dependencies without crossing lazy boundaries', async () => {
    await tmp.withDir(
      async (dir) => {
        const sourceDirectory = path.join(import.meta.dirname, 'test-fixtures/lazy-loading');
        const buildDirectory = await fs.realpath(dir.path);
        const manifest = await build(sourceDirectory, buildDirectory);

        // Three entrypoints force separate eager and base chunks, with base
        // shared transitively by eager and directly by the lazy module.
        const main = manifest['scripts/esm-bundles/main.js'];
        const other = manifest['scripts/esm-bundles/other.js'];
        const base = manifest['scripts/esm-bundles/base.js'];
        const lazy = manifest['scripts/lib/lazy.js'];
        const nested = manifest['scripts/lib/nested.js'];

        assert.lengthOf(base.preloads, 1);
        assert.lengthOf(other.preloads, 2);
        assert.includeMembers(other.preloads, base.preloads);
        assert.sameMembers(main.preloads, other.preloads);

        // The dependency shared only by lazy modules stays out of initial preloads.
        assert.lengthOf(nested.preloads, 1);
        assert.notInclude(main.preloads, nested.preloads[0]);
        assert.sameMembers(lazy.preloads, [...base.preloads, ...nested.preloads]);
      },
      { unsafeCleanup: true },
    );
  });
});
