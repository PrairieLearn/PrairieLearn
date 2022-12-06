import tmp from 'tmp-promise';
import fs from 'fs-extra';
import path from 'path';
import getPort from 'get-port';
import { assert } from 'chai';

import { init, compiledScriptPath, compiledScriptTag, handler, build } from './index';

async function withProject(fn: (dir: string) => Promise<void>) {
  await tmp.withDir(async (dir) => {
    const scriptsRoot = path.join(dir.path, 'assets', 'scripts');
    await fs.mkdir(scriptsRoot);

    const jsScriptPath = path.join(scriptsRoot, 'foo.js');
    const tsScriptPath = path.join(scriptsRoot, 'bar.ts');
    fs.writeFile(jsScriptPath, 'console.log("foo")');
    fs.writeFile(tsScriptPath, 'interface Foo {};\n\nconsole.log("bar")');

    await fn(dir.path);
  });
}

describe('compiled-assets', () => {
  it('serves files in dev mode', async () => {
    await withProject(async (dir) => {
      init({
        dev: false,
        sourceDirectory: '',
        buildDirectory: '',
        publicPath: '/build',
      });

      const port = await getPort();
    });
  });

  it('serves files in prod mode', async () => {
    await withProject(async (dir) => {
      const sourceDirectory = path.join(dir, 'assets');
      const buildDirectory = path.join(dir, 'public', 'build');
      await build(sourceDirectory, buildDirectory);

      assert.isTrue(await fs.pathExists(buildDirectory));
      assert.isTrue(await fs.pathExists(path.join(buildDirectory, 'scripts', 'foo.js')));
      assert.isTrue(await fs.pathExists(path.join(buildDirectory, 'scripts', 'bar.js')));
    });
  });
});
