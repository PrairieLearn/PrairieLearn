import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Select Workers' JSON-RPC transport without applying browser conditions to PL's Node dependencies.
  resolve: {
    alias: {
      'vscode-jsonrpc/browser': fileURLToPath(
        new URL('../browser/main.js', import.meta.resolve('vscode-jsonrpc')),
      ),
    },
  },
  ssr: { noExternal: ['vscode-jsonrpc'] },
  test: {
    name: 'course-agent',
    dir: import.meta.dirname,
  },
});
