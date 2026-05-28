import pluginQuery from '@tanstack/eslint-plugin-query';
import type { TSESLint } from '@typescript-eslint/utils';

/**
 * TanStack Query (React Query) rules.
 */
export function tanstackConfig(): TSESLint.FlatConfig.ConfigArray {
  return [
    {
      plugins: {
        '@tanstack/query': pluginQuery,
      },

      rules: {
        // https://github.com/TanStack/query/blob/6402d756b702ac560b69a5ce84d6e4e764b96451/packages/eslint-plugin-query/src/index.ts#L43
        ...pluginQuery.configs['flat/recommended'][0].rules,
        // Disabled: tRPC proxy objects in query keys trigger false positives
        // since the proxy is not serializable and the rule can't introspect it.
        '@tanstack/query/exhaustive-deps': 'off',
        '@tanstack/query/no-rest-destructuring': 'error',
      },
    },
  ];
}
