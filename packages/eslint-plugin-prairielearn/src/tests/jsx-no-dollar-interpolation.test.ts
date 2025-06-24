import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

import rule from '../rules/jsx-no-dollar-interpolation';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});

ruleTester.run('jsx-no-dollar-interpolation', rule, {
  valid: [
    {
      code: '<div>hello</div>',
    },
    {
      code: '<div>100$</div>',
    },
    {
      code: '<div>$100</div>',
    },
    {
      code: '<div>$</div>',
    },
  ],
  invalid: [
    {
      // eslint-disable-next-line no-template-curly-in-string
      code: '<div>${message}</div>',
      errors: [
        {
          messageId: 'dollarInterpolationNotAllowed',
          line: 1,
          column: 6,
          endLine: 1,
          endColumn: 16,
        },
      ],
    },
    {
      code: '<div>$ {message}</div>',
      errors: [
        {
          messageId: 'dollarInterpolationNotAllowed',
          line: 1,
          column: 6,
          endLine: 1,
          endColumn: 17,
        },
      ],
    },
  ],
});
