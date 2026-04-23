import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

import rule from '../rules/no-hydrate-reslocals';

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

ruleTester.run('no-hydrate-reslocals', rule, {
  valid: [
    {
      code: '<Hydrate><Child foo={1} bar="baz" /></Hydrate>',
    },
    {
      code: '<Hydrate><Child course={course} assessment={assessment} /></Hydrate>',
    },
    {
      code: '<SomeOther resLocals={res.locals}><Child /></SomeOther>',
    },
    {
      code: '<Hydrate><Child {...otherProps} /></Hydrate>',
    },
    {
      code: '<Hydrate resLocals={foo}><Child /></Hydrate>',
    },
    {
      code: 'hydrateHtml(<Child foo={1} bar="baz" />)',
    },
    {
      code: 'hydrateHtml(<Child {...otherProps} />)',
    },
    {
      code: 'otherFunction(<Child resLocals={res.locals} />)',
    },
  ],
  invalid: [
    {
      code: '<Hydrate><Child resLocals={res.locals} /></Hydrate>',
      errors: [{ messageId: 'forbiddenProp', data: { name: 'resLocals' } }],
    },
    {
      code: '<Hydrate><Child locals={res.locals} /></Hydrate>',
      errors: [{ messageId: 'forbiddenProp', data: { name: 'locals' } }],
    },
    {
      code: '<Hydrate><Child {...res.locals} /></Hydrate>',
      errors: [{ messageId: 'forbiddenSpread' }],
    },
    {
      code: '<Hydrate><Child {...resLocals} /></Hydrate>',
      errors: [{ messageId: 'forbiddenSpread' }],
    },
    {
      code: '<Hydrate><Child {...locals} /></Hydrate>',
      errors: [{ messageId: 'forbiddenSpread' }],
    },
    {
      code: '<Hydrate fullHeight><Child foo={1} resLocals={res.locals} /></Hydrate>',
      errors: [{ messageId: 'forbiddenProp', data: { name: 'resLocals' } }],
    },
    {
      code: 'hydrateHtml(<Child resLocals={res.locals} />)',
      errors: [{ messageId: 'forbiddenProp', data: { name: 'resLocals' } }],
    },
    {
      code: 'hydrateHtml(<Child locals={res.locals} />)',
      errors: [{ messageId: 'forbiddenProp', data: { name: 'locals' } }],
    },
    {
      code: 'hydrateHtml(<Child {...res.locals} />)',
      errors: [{ messageId: 'forbiddenSpread' }],
    },
    {
      code: 'hydrateHtml(<Child {...resLocals} />, { fullHeight: true })',
      errors: [{ messageId: 'forbiddenSpread' }],
    },
  ],
});
