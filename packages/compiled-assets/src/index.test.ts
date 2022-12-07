import tmp from 'tmp-promise';
import fs from 'fs-extra';
import path from 'path';
import getPort from 'get-port';
import { assert } from 'chai';
import express from 'express';
import fetch from 'node-fetch';

import { init, compiledScriptPath, handler, CompiledAssetsOptions, build } from './index';

async function testProject(options: CompiledAssetsOptions) {
  await tmp.withDir(
    async (dir) => {
      const scriptsRoot = path.join(dir.path, 'assets', 'scripts');
      await fs.ensureDir(scriptsRoot);

      const jsScriptPath = path.join(scriptsRoot, 'foo.js');
      const tsScriptPath = path.join(scriptsRoot, 'bar.ts');
      fs.writeFile(jsScriptPath, 'console.log("foo")');
      fs.writeFile(tsScriptPath, 'interface Foo {};\n\nconsole.log("bar")');

      if (!options.dev) {
        await build(path.join(dir.path, 'assets'), path.join(dir.path, 'public', 'build'));
      }

      init({
        sourceDirectory: path.join(dir.path, 'assets'),
        buildDirectory: path.join(dir.path, 'public', 'build'),
        publicPath: '/build',
        ...options,
      });

      const port = await getPort();
      const app = express();
      app.use('/build', handler());
      const server = app.listen(port);

      try {
        const res = await fetch(`http://localhost:${port}${compiledScriptPath('foo.js')}`);
        assert.isTrue(res.ok);
        assert.match(await res.text(), /console\.log\("foo"\)/);
      } finally {
        server.close();
      }
    },
    {
      unsafeCleanup: true,
    }
  );
}

describe('compiled-assets', () => {
  it('works in dev mode', async () => {
    await testProject({ dev: true });
  });

  it('works in prod mode', async () => {
    await testProject({ dev: false });
  });
});
