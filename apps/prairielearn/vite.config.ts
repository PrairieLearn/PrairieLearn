import { defineConfig } from 'vite';

import { VitePluginNode } from '@prairielearn/vite-plugin-express';

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    ...VitePluginNode({
      adapter: 'express',
      appPath: './src/server.ts',
      exportName: 'viteNodeApp',
      initAppOnBoot: true,
      tsCompiler: 'esbuild',
      swcOptions: {},
    }),
  ],
});
