import { defineConfig } from 'vite';

import { VitePluginExpress } from '@prairielearn/vite-plugin-express';

export default defineConfig({
  server: {
    port: 3000,
  },
  ssr: {
    // Force Vite to externalize even linked dependencies. For us, this means
    // things in the `packages/` directory at the root of the repo.
    external: true,
    noExternal: [],
  },
  plugins: [
    ...VitePluginExpress({
      appPath: './src/server.ts',
      fullRestartPaths: [
        // SQL files aren't part of Vite's module graph. We need to fully reload
        // all modules to pick up changes to them.
        '**/*.sql',

        // These modules maintain state that can't be hot-reloaded. This should
        // generally match the list of modules that need to be explicitly closed
        // in the `close` function of `src/server.ts`.
        //
        // This doesn't include things like `@prairielearn/postgres` and
        // `@prairielearn/named-locks`. Changes to dependencies aren't picked up
        // by Vite, so they'll always require a manual restart of the Vite process itself.
        './src/lib/cron.ts',
        './src/lib/server-jobs.ts',
        './src/lib/socket-server.ts',
        './src/lib/assets.ts',
        './src/lib/code-caller/index.ts',
        './src/lib/load.ts',

        // We'll always reload after config changes.
        './config.json',
        '../../config.json',
      ],
    }),
  ],
});
