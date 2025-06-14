# `@prairielearn/compiled-assets`

This package enables the transpilation and bundling of client-side assets, namely JavaScript.

This tool is meant to produce many small, independent bundles that can then be included as needed on each page, as well as providing mechanisms for code splitting larger ESM bundles.

## Usage

### File structure

Create a directory of assets that you wish to bundle, e.g. `assets/`. Within that directory, create another directory `scripts/`. Any JavaScript or TypeScript files in the root of the `scripts/` directory will become a bundle that can be loaded on a page. For example, the following directory structure would produce bundles named `foo` and `bar`:

```text
├── assets/
│   ├── scripts/
│   │   ├── foo.ts
│   │   └── bar.ts
```

You can locate shared code in directories inside this directory. As long as those files aren't in the root of the `scripts/` directory, they won't become separate bundles.

```text
assets
└── scripts
    ├── bar.ts
    ├── foo.ts
    └── lib
        ├── more-shared-code.ts
        └── shared-code.ts
```

These assets will be output as an [IIFE](https://developer.mozilla.org/en-US/docs/Glossary/IIFE) for compatibility reasons. You can place additional assets in the `assets/scripts/esm-bundles/` directory, which will be output as ESM [module](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules#applying_the_module_to_your_html) files with code splitting. This is useful for libraries that can be loaded asynchronously, like Preact components.

```text
assets
└── scripts
    └── esm-bundles
        └── baz.tsx
```

The import tree of all files will be analyzed, and any code-split chunks or dynamically-imported files will be marked as preloads.

### Application integration

Early in your application initialization process, initialize this library with the appropriate options:

```ts
import * as compiledAssets from '@prairielearn/compiled-assets';

assets.init({
  // Assets will be watched for changes in development mode, and the latest version will be served.
  // In production mode, assets will be precompiled and served from the build directory.
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

If your file is located in the `esm-bundles` folder (and processed with ESM + code splitting), you can use the `compiledScriptModuleTag` function. You can use `compiledScriptModulePreloadTags` to get a list of tags that should be preloaded in the `<head>` of your HTML document.

```ts
import { html } from '@prairielearn/html';
import {
  compiledScriptTag,
  compiledScriptPath,
  compiledScriptModuleTag,
} from '@prairielearn/compiled-assets';

router.get(() => {
  return html`
    <html>
      <head>
        ${compiledScriptTag('foo.ts')}
        <script src="${compiledScriptPath('bar.ts')}"></script>

        ${compiledScriptModuleTag('baz.tsx')}
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
compiled-assets build ./assets ./public/build
```
