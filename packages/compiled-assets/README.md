# `@prairielearn/compiled-assets`

This package enables the transpilation and bundling of client-side assets, namely JavaScript.

This tool is meant to produce many small, independent bundles that can then be included as needed on each page.

## Usage

### File structure

Create a directory of assets that you wish to bundle, e.g. `assets/`. Within that directory, create another directory `scripts/`. Any JavaScript or TypeScript files in the root of the `scripts/` directory will become a bundle that can be loaded on a page. For example, the following directory structure would produce bundles named `foo` and `bar`:

```
├── assets/
│   ├── scripts/
│   │   ├── foo.ts
│   │   └── bar.ts
```

You can locate shared code in directories inside this directory. As long as those files aren't in the root of the `scripts/` directory, they won't become separate bundles.

```
├── assets/
│   ├── scripts/
|   │   ├── lib/
|   │   │   ├── shared-code.ts
|   │   │   └── more-shared-code.ts
|   │   ├── foo.ts
│   |   └── bar.ts
```

### Application integration

Early in your application initialization process, initialize this library with the appropriate options:

```ts
import * as compiledAssets from '@prairielearn/compiled-assets';

assets.init({
  dev: process.env.NODE_ENV !== 'production',
  sourceDirectory: './assets',
  buildDirectory: './public/build',
  publicPath: '/build/',
});
```

Then, add the request handler. The path at which you mount it should match the `publicPath` that was configured above.

```ts
const app = express();

app.use('/build/', assets.handler());
```

To include a bundle on your page, you can use the `compiledScriptTag` or `compiledScriptPath` functions. The name of the bundle passed to this function is the filename of your bundle within the `scripts` directory.

```ts
import { html } from '@prairielearn/html';
import { compiledScriptTag, compiledScriptPath } from '@prairielearn/compiled-assets';

router.get(() => {
  return html`
    <html>
      <head>
        ${compiledScriptTag('foo.ts')}
        <script src="${compiledScriptPath('bar.ts')}"></script>
      </head>
      </body>
        Hello, world.
      </body>
    </html>
  `;
});
```

### Building assets for production

For production usage, assets must be precompiled with the `compiled-assets build` command. Note that the source directory and build directory should match the values provided to `assets.init`.

```sh
$ compiled-assets build ./assets ./public/build
```
