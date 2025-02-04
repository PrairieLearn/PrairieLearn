import { reloader } from '@vavite/reloader';
import { defineConfig, type Plugin, type UserConfig } from 'vite';

import { config } from './src/lib/config.js';

function ssrNoExternalPlugin(additionalNoExternals: string[] = []): Plugin {
  return {
    name: 'ssr-no-external-modifier',
    enforce: 'post',
    config(config: UserConfig) {
      // config.ssr = config.ssr || {};
      // config.ssr.noExternal = [
      //   ...(Array.isArray(config.ssr.noExternal) ? config.ssr.noExternal : []),
      //   ...additionalNoExternals,
      // ];
      console.log(config);
      return config;
    },
  };
}

export default defineConfig({
  server: {
    port: +config.serverPort + 1,
  },
  ssr: {
    noExternal: ['@vavite/reloader'],
  },
  plugins: [
    reloader({
      entry: '/src/server',
      // Options, see below
    }),
    // ssrNoExternalPlugin(['@fortawesome/fontawesome-free', 'jquery-ui-touch-punch']),
  ],
});
