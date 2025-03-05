import { RuleTester } from '@typescript-eslint/rule-tester';

import rule from '../rules/jsx-no-dollar-interpolation';

RuleTester.afterAll = after;

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
      errors: [{ messageId: 'dollarInterpolationNotAllowed' }],
    },
    {
      code: '<div>$ {message}</div>',
      errors: [{ messageId: 'dollarInterpolationSuspect' }],
    },
  ],
});
