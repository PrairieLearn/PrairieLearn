/**
 * This is a workaround to allow the use of path aliases to work with depcruise,
 * which doesn't support getting alias information from TypeScript config files.
 * PrairieLearn does not actually use webpack for bundling.
 */
import path from 'path';

export default {
  resolve: {
    alias: {
      '@pages': path.resolve(import.meta.dirname, 'pages'),
      '@components': path.resolve(import.meta.dirname, 'components'),
      '@lib': path.resolve(import.meta.dirname, 'lib'),
    },
  },
};
