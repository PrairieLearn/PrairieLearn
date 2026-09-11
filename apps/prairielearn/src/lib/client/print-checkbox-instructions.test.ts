import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { moveCheckboxInstructions } from './print-checkbox-instructions.js';

describe('moveCheckboxInstructions', () => {
  it.each(['fieldset', 'role-group'])(
    'moves %s checkbox instructions ahead of the options',
    (groupType) => {
      const groupStart = groupType === 'fieldset' ? '<fieldset>' : '<div role="group">';
      const groupEnd = groupType === 'fieldset' ? '</fieldset>' : '</div>';
      const dom = new JSDOM(`
        <div id="question-body">
          ${groupStart}
            <div class="form-check" data-order="first">
              <input type="checkbox" />
            </div>
            <div class="form-check" data-order="second">
              <input type="checkbox" />
            </div>
            <div data-order="instructions">
              <small class="form-text text-muted">Select all possible options.</small>
              <button type="button">Help</button>
            </div>
          ${groupEnd}
        </div>
      `);
      const questionBody = dom.window.document.querySelector<HTMLElement>('#question-body')!;

      moveCheckboxInstructions(questionBody);

      const group = questionBody.querySelector('fieldset, [role="group"]')!;
      expect([...group.children].map((child) => child.getAttribute('data-order'))).toEqual([
        'instructions',
        'first',
        'second',
      ]);
      expect(group.firstElementChild?.classList.contains('printing-checkbox-instructions')).toBe(
        true,
      );
    },
  );
});
