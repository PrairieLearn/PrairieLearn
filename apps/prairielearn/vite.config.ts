import { defineConfig } from 'vite';

import { VitePluginExpress } from '@prairielearn/vite-plugin-express';

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    ...VitePluginExpress({
      appPath: './src/server.ts',
      exportName: 'viteExpressApp',
      initAppOnBoot: true,
      watchFileChanges: true,
    }),
  ],
});
