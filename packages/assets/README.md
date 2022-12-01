# `@prairielearn/assets`

This package enables the transpilation and bundling of client-side assets, namely JavaScript.

This tool is meant to produce many small, independent bundles that can then be included

## Usage

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
