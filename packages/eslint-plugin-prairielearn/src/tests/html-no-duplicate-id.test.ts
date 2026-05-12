import htmlParser from '@html-eslint/parser';
import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

import rule from '../rules/html-no-duplicate-id.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: htmlParser,
  },
});

ruleTester.run('html-no-duplicate-id', rule, {
  valid: [
    {
      code: '<div id="a"></div><div id="b"></div>',
    },
    // Duplicate `id` on `pl-*` elements is a tool/element identifier, not a
    // DOM id, so it should be ignored.
    {
      code: `
        <pl-sketch>
          <pl-sketch-tool id="fd" type="free-draw"></pl-sketch-tool>
        </pl-sketch>
        <pl-sketch>
          <pl-sketch-tool id="fd" type="free-draw"></pl-sketch-tool>
        </pl-sketch>`,
    },
  ],
  invalid: [
    {
      code: '<div id="x"></div><div id="x"></div>',
      errors: [
        { messageId: 'duplicateId', data: { id: 'x' } },
        { messageId: 'duplicateId', data: { id: 'x' } },
      ],
    },
    // Duplicate `id` on non-`pl-*` elements should be reported.
    {
      code: '<div id="fd"></div><span id="fd"></span>',
      errors: [
        { messageId: 'duplicateId', data: { id: 'fd' } },
        { messageId: 'duplicateId', data: { id: 'fd' } },
      ],
    },
  ],
});
