import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Match Workers' browser transport instead of JSON-RPC's Node streams in these tests.
  ssr: { resolve: { conditions: ['browser'] }, noExternal: ['vscode-jsonrpc'] },
  test: {
    name: 'course-agent',
    dir: `${import.meta.dirname}/src`,
  },
});
