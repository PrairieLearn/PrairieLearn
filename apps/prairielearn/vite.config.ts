import { reloader } from '@vavite/reloader';
import { defineConfig } from 'vite';

import { config } from './src/lib/config.js';

export default defineConfig({
  server: {
    port: +config.serverPort,
  },
  plugins: [
    reloader({
      entry: '/src/server',
      // Options, see below
    }),
  ],
});
