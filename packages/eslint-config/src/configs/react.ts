import eslintReact from '@eslint-react/eslint-plugin';
import type { TSESLint } from '@typescript-eslint/utils';
import jsxA11yX from 'eslint-plugin-jsx-a11y-x';
import reactHooks from 'eslint-plugin-react-hooks';
import reactYouMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect';

// The eslint-react config has plugins/settings/rules but the type doesn't expose them all
const eslintReactConfig = eslintReact.configs['recommended-typescript'] as {
  plugins?: TSESLint.FlatConfig.Plugins;
  rules?: TSESLint.FlatConfig.Rules;
  settings?: TSESLint.FlatConfig.Settings;
};

/**
 * React, React hooks, accessibility, and related rules.
 */
export function reactConfig(): TSESLint.FlatConfig.ConfigArray {
  return [
    {
      plugins: {
        'jsx-a11y-x': jsxA11yX,
        'react-hooks': reactHooks,
        'react-you-might-not-need-an-effect': reactYouMightNotNeedAnEffect,
        ...eslintReactConfig.plugins,
      },

      rules: {
        // React hooks
        'react-hooks/exhaustive-deps': 'error',
        'react-hooks/rules-of-hooks': 'error',

        // react-you-might-not-need-an-effect rules as errors
        ...Object.fromEntries(
          Object.keys(reactYouMightNotNeedAnEffect.configs?.recommended?.rules ?? {}).map(
            (ruleName: string) => [ruleName, 'error'],
          ),
        ),

        // eslint-react recommended rules as errors
        ...Object.fromEntries(
          Object.entries(eslintReactConfig.rules ?? {}).map(
            ([ruleName, severity]: [string, unknown]) => [
              ruleName,
              severity === 'off' ? 'off' : 'error',
            ],
          ),
        ),
        // We want to be able to use `useState` without the setter function for
        // https://tkdodo.eu/blog/react-query-fa-qs#2-the-queryclient-is-not-stable
        '@eslint-react/naming-convention/use-state': 'off',
        // Forbid `snake_case` props.
        '@eslint-react/no-forbidden-props': ['error', { forbid: ['/_/'] }],

        // jsx-a11y strict rules
        ...jsxA11yX.configs.strict.rules,
        'jsx-a11y-x/anchor-ambiguous-text': 'error',
        'jsx-a11y-x/lang': 'error',
        'jsx-a11y-x/no-aria-hidden-on-focusable': 'error',
        // Bootstrap turns some elements into interactive elements.
        'jsx-a11y-x/no-noninteractive-element-to-interactive-role': [
          'error',
          {
            li: ['menuitem', 'option', 'row', 'tab', 'treeitem'],
            ol: ['listbox', 'menu', 'menubar', 'radiogroup', 'tablist', 'tree', 'treegrid'],
            table: ['grid'],
            td: ['gridcell'],
            ul: ['listbox', 'menu', 'menubar', 'radiogroup', 'tablist', 'tree', 'treegrid', 'role'],
          },
        ],
      },

      settings: {
        'jsx-a11y-x': {
          attributes: {
            for: ['htmlFor'],
          },
        },
        ...eslintReactConfig.settings,
      },
    },
  ];
}
