import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

import rule from '../rules/no-current-target-in-callback.js';

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

ruleTester.run('no-current-target-in-callback', rule, {
  valid: [
    // Direct access to currentTarget (no nesting) is fine
    {
      code: '<input onChange={(e) => console.log(e.currentTarget.value)} />',
    },
    // Destructuring at the handler level is the recommended pattern
    {
      code: '<input onChange={({ currentTarget }) => setChecks((c) => ({ ...c, value: currentTarget.checked }))} />',
    },
    // Using a local variable is fine
    {
      code: `<input onChange={(e) => {
        const target = e.currentTarget;
        setChecks((c) => ({ ...c, value: target.checked }));
      }} />`,
    },
    // Non-event handlers are not checked
    {
      code: '<Component render={(e) => setFoo(() => e.currentTarget)} />',
    },
    // Direct setState without callback
    {
      code: '<input onChange={(e) => setChecks({ value: e.currentTarget.checked })} />',
    },
    // Event target (not currentTarget) - different issue, not covered by this rule
    {
      code: '<input onChange={(e) => setChecks((c) => ({ ...c, value: e.target.checked }))} />',
    },
  ],
  invalid: [
    // Basic case: accessing e.currentTarget inside setState callback
    {
      code: '<input onChange={(e) => setChecks((c) => ({ ...c, value: e.currentTarget.checked }))} />',
      errors: [{ messageId: 'noCurrentTargetInCallback' }],
    },
    // Multiple accesses
    {
      code: `<input onChange={(e) => setChecks((c) => ({
        ...c,
        value: e.currentTarget.checked,
        name: e.currentTarget.name
      }))} />`,
      errors: [
        { messageId: 'noCurrentTargetInCallback' },
        { messageId: 'noCurrentTargetInCallback' },
      ],
    },
    // Different event parameter names
    {
      code: '<input onChange={(event) => setChecks((c) => ({ ...c, value: event.currentTarget.checked }))} />',
      errors: [{ messageId: 'noCurrentTargetInCallback' }],
    },
    {
      code: '<input onChange={(evt) => setChecks((c) => ({ ...c, value: evt.currentTarget.checked }))} />',
      errors: [{ messageId: 'noCurrentTargetInCallback' }],
    },
    // onClick handler
    {
      code: '<button onClick={(e) => setFoo((prev) => ({ ...prev, clicked: e.currentTarget.id }))} />',
      errors: [{ messageId: 'noCurrentTargetInCallback' }],
    },
    // Nested arrow function in array method
    {
      code: '<input onChange={(e) => items.map(() => e.currentTarget.value)} />',
      errors: [{ messageId: 'noCurrentTargetInCallback' }],
    },
    // Function expression callback
    {
      code: '<input onChange={(e) => setChecks(function(c) { return { ...c, value: e.currentTarget.checked }; })} />',
      errors: [{ messageId: 'noCurrentTargetInCallback' }],
    },
    // Deeply nested
    {
      code: '<input onChange={(e) => outer(() => inner(() => e.currentTarget.value))} />',
      errors: [{ messageId: 'noCurrentTargetInCallback' }],
    },
    // With block body
    {
      code: `<input onChange={(e) => {
        setChecks((c) => {
          return { ...c, value: e.currentTarget.checked };
        });
      }} />`,
      errors: [{ messageId: 'noCurrentTargetInCallback' }],
    },
  ],
});
