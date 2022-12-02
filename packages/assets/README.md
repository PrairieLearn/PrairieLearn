# `@prairielearn/assets`

This package enables the transpilation and bundling of client-side assets, namely JavaScript.

This tool is meant to produce many small, independent bundles that can then be included

## Usage

### File structure

Create a directory of assets that you wish to bundle, e.g. `assets/`. Any JavaScript or TypeScript files in the root of this directory will become a bundle that can be loaded on a page. For example, the following directory structure would produce bundles named `foo` and `bar`:

```
├── assets/
│   ├── foo.ts
│   └── bar.ts
```

You can locate shared code in directories inside this directory. As long as those files aren't in the root of the assets directory, they won't become separate bundles.

```
├── assets/
│   ├── lib/
│   │   ├── shared-code.ts
│   │   └── more-shared-code.ts
│   ├── foo.ts
│   └── bar.ts
```

### Application integration

Early in your application initialization process, initialize this library with the appropriate options:

```ts
import * as assets from '@prairielearn/assets';

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

### Building assets

For production usage, assets should be precompiled. Note that the source directory and build directory should match the values provided to `assets.init`. For example, you can add a `build` command to your `package.json`:

```json
{
  "scripts": {
    "build": "pl-assets TODO CONFIG"
  }
}
```
