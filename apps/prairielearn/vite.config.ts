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
    // We need this so that we can detect if we are running in HMR mode.
    noExternal: ['@prairielearn/migrations'],
  },
  plugins: [
    ...VitePluginExpress({
      appPath: './src/server.ts',
      exportName: 'viteExpressApp',
      initAppOnBoot: true,
      watchFileChanges: false,
    }),
  ],
});
