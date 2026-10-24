import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: { resolve: { conditions: ['browser'] }, noExternal: ['vscode-jsonrpc'] },
  test: {
    name: 'course-agent',
    dir: `${import.meta.dirname}/src`,
  },
});
