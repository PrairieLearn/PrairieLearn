import { defineConfig } from 'vitest/config';

defineConfig({
  plugins: [
    {
      name: 'whats-choking',
      transform(code, id) {
        if (code.includes('with')) {
          console.log('is this it?', { id });
        }
      },
    },
  ],
});
