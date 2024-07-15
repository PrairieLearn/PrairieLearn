import { Plugin } from 'esbuild';

/**
 * ESBuild plugin that will forbid certain packages from being imported in a
 * module graph. This is used to ensure that certain packages don't accidentally
 * end up being used in client-side code.
 */
export function forbidPackages(packages: string[]): Plugin {
  return {
    name: 'forbid-packages',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (packages.includes(args.path)) {
          return {
            errors: [
              {
                text: `Package "${args.path}" is forbidden in client-side code`,
              },
            ],
          };
        }
      });
    },
  };
}
