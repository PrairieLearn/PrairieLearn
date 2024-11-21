// @ts-check
import { defineConfig } from 'astro/config';

import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  base: '/astro/',

  adapter: node({
    mode: 'middleware',
  }),
});
