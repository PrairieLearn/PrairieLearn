import { promises } from 'fs';

import * as esbuild from 'esbuild';

/* Export and embed JSON as JS */
const JSONLoader = {
  name: 'json-loader',
  setup({ onLoad }) {
    onLoad({ filter: /\.json$/ }, async (args) => {
      const text = await promises.readFile(args.path, 'utf8');
      return { contents: `export default ${text}`, loader: 'js' };
    });
  },
};

const TextReplacer = ({ include, pattern, loader }) => ({
  name: 'text-replacer',
  setup({ onLoad }) {
    onLoad({ filter: include }, async (args) => {
      let contents = await promises.readFile(args.path, 'utf-8');
      for (const [from, to] of pattern) {
        contents = contents.replaceAll(from, to);
      }
      return { contents, loader };
    });
  },
});

await esbuild.build({
  entryPoints: ['./src/index.js'],
  outdir: './dist',
  bundle: true,
  splitting: true,
  minify: true,
  format: 'esm',
  define: {
    'process.env.IS_PREACT': 'false',
    /* We don't need this because we are statically bundling everything but just to be safe
       against future version upgrades... */
    'window.EXCALIDRAW_ASSET_PATH':
      '"/node_modules/@prairielearn/excalidraw/dist/excalidraw-dist/"',
  },
  plugins: [
    JSONLoader,
    TextReplacer({
      include: /.js$/,
      loader: 'js',
      pattern: [
        /* Prevent bootstrap style from hijacking visibility
         * https://github.com/excalidraw/excalidraw/issues/3825 */
        ['dropdown-menu', 'ex-dropdown-menu'],
      ],
    }),
  ],
});

await esbuild.build({
  entryPoints: ['./src/index.css'],
  outdir: './dist',
  bundle: true,
  minify: true,
  loader: { '.woff2': 'dataurl' },
  plugins: [
    TextReplacer({
      include: /.css$/,
      loader: 'css',
      pattern: [
        /* Prevent bootstrap style from hijacking visibility
         * https://github.com/excalidraw/excalidraw/issues/3825 */
        ['.dropdown-menu', '.ex-dropdown-menu'],
      ],
    }),
  ],
});
