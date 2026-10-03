import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'course-agent', include: ['test/*.test.ts'], testTimeout: 10000 },
});
