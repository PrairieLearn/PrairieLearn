import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { normalizeResponseControls } from './print-response-controls.js';

function printQuestion(html: string): HTMLElement {
  const dom = new JSDOM(
    `<section class="printing-question"><div class="question-block"><div class="question-body">${html}</div></div></section>`,
  );
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  const question = dom.window.document.body;
  normalizeResponseControls(question);
  return question;
}

afterEach(() => vi.unstubAllGlobals());

describe('printable response controls', () => {
  it('keeps subpart prompts and their controls in one group after a horizontal rule', () => {
    const question = printQuestion(
      '<p>Shared introduction</p><hr><p>First subpart</p><input name="first"><hr><p>Second subpart</p><input name="second">',
    );
    const first = question
      .querySelector('[data-print-answer-name="first"]')!
      .closest('.printing-subsection');
    const second = question
      .querySelector('[data-print-answer-name="second"]')!
      .closest('.printing-subsection');
    expect(first?.textContent).toBe('First subpart');
    expect(second?.textContent).toBe('Second subpart');
    expect(first).not.toBe(second);
    expect(first?.textContent).not.toContain('Shared introduction');
  });
  it('replaces text and symbolic editors with empty lines while preserving labels, suffixes, and tolerances', () => {
    const question = printQuestion(`
      <h3>pl-number-input</h3>
      <span class="input-group"><span>Force =</span><input name="force" value="123" placeholder="number ±1%" size="35"><span>N</span></span>
      <span class="input-group"><span>Derivative =</span><math-field id="derivative" data-placeholder-text="symbolic expression">x^2</math-field></span>
    `);
    expect(question.querySelectorAll('[data-print-response-line]')).toHaveLength(2);
    expect(question.querySelector('input, math-field')).toBeNull();
    expect(question.textContent).toContain('Force =');
    expect(question.textContent).toContain('number ±1%');
    expect(question.textContent).toContain('Derivative =');
    expect(question.textContent).not.toContain('symbolic expression');
    expect(question.textContent).not.toContain('123');
    expect(question.textContent).not.toContain('x^2');
    expect(question.querySelector('h3')?.textContent).toBe('pl-number-input');
    expect(question.querySelector('[data-print-response-area]')).toBeNull();
  });

  it('omits generic field types while preserving custom instructions and answer requirements', () => {
    const question = printQuestion(`
      <input placeholder="integer">
      <input placeholder="Number">
      <input placeholder="matrix">
      <input placeholder="Unit">
      <input placeholder="Number + Unit">
      <input placeholder="string">
      <textarea placeholder=" text "></textarea>
      <math-field placeholder="asymptotic expression"></math-field>
      <math-field data-placeholder-text="Symbolic expression"></math-field>
      <input placeholder="number (3 sig figs)">
      <input placeholder="integer in base 2">
      <math-field data-placeholder-text="symbolic expression (blank is allowed)"></math-field>
      <input placeholder="Enter the name of the enzyme">
    `);
    expect(
      [...question.querySelectorAll('.printing-response-placeholder')].map(
        (hint) => hint.textContent,
      ),
    ).toEqual([
      'number (3 sig figs)',
      'integer in base 2',
      'symbolic expression (blank is allowed)',
      'Enter the name of the enzyme',
    ]);
    expect(question.querySelectorAll('[data-print-response-line]')).toHaveLength(12);
    expect(question.querySelectorAll('.printing-textarea-response')).toHaveLength(1);
  });

  it('preserves each matrix entry and its row and column label', () => {
    const question = printQuestion(
      '<div class="input-group"><span>A =</span><table><tr><td><input size="8" aria-label="Row 1, Column 1"></td><td><input size="8" aria-label="Row 1, Column 2"></td></tr></table></div>',
    );
    expect(question.querySelectorAll('td [data-print-response-line]')).toHaveLength(2);
    expect(question.querySelector('[aria-label="Row 1, Column 2"]')).not.toBeNull();
  });

  it('replaces the whole image-capture interface with one drawing area', () => {
    const question = printQuestion(
      '<p>Show your work.</p><script>initializeCapture();</script><div class="image-capture-card"><input type="file"><div>No image captured yet.</div><input type="range"><video></video><button>Use phone</button></div>',
    );
    expect(question.querySelectorAll('[data-print-response-area]')).toHaveLength(1);
    expect(question.querySelector('.printing-drawing-response')).not.toBeNull();
    expect(question.querySelector('input, video, button, .image-capture-card')).toBeNull();
    expect(question.textContent).not.toContain('No image captured');
    const section = question.querySelector('.printing-subsection');
    expect(section?.querySelector('p')?.textContent).toBe('Show your work.');
    expect(section?.querySelector('.printing-drawing-response')).not.toBeNull();
  });

  it('keeps sketch geometry and removes the interactive toolbar', () => {
    const question = printQuestion(
      '<div class="sketchresponse"><div class="si-container"><menu>Draw</menu><svg class="si-canvas" width="800" height="450"><path d="M0 0 L800 450"/></svg></div></div>',
    );
    expect(question.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 800 450');
    expect(question.querySelector('path')?.getAttribute('d')).toBe('M0 0 L800 450');
    expect(question.querySelector('menu, .si-container')).toBeNull();
  });

  it('preserves ordering options, alternatives, and provided blocks without drag controls', () => {
    const question =
      printQuestion(`<div class="pl-order-blocks-question-uuid"><button data-bs-content="&lt;p&gt;Your answer ordering does not matter.&lt;/p&gt;&lt;p&gt;Keyboard Controls: arrows&lt;/p&gt;&lt;p&gt;&lt;strong&gt;Your answer should be indented.&lt;/strong&gt; Indent your tiles by dragging them.&lt;/p&gt;"></button>
      <ul id="order-blocks-options-uuid">
        <li class="pl-order-block"><div class="pl-order-block-content">First</div></li>
        <li class="pl-order-blocks-pairing-indicator"><ul>
          <li class="pl-order-block"><div class="pl-order-block-content">Option one</div></li>
          <li class="pl-order-block"><div class="pl-order-block-content">Option two</div></li>
        </ul></li>
        <li class="pl-order-block"><div class="pl-order-block-content">Middle</div></li>
        <li class="pl-order-blocks-pairing-indicator"><ul>
          <li class="pl-order-block"><div class="pl-order-block-content"><em>Option three</em></div></li>
          <li class="pl-order-block"><div class="pl-order-block-content">Option four</div></li>
        </ul></li>
        <li class="pl-order-block"><div class="pl-order-block-content">Last</div></li>
      </ul>
      <ul id="order-blocks-dropzone-uuid"><li class="pl-order-block"><div class="pl-order-block-content">Given</div></li></ul>
      <input type="hidden" value="student order">
    </div>`);
    expect(
      [...question.querySelectorAll('.printing-order-options')].map((list) =>
        [...list.children].map(
          (block) => block.querySelector('.printing-order-block-content')?.textContent,
        ),
      ),
    ).toEqual([
      ['First'],
      ['Option one', 'Option two'],
      ['Middle'],
      ['Option three', 'Option four'],
      ['Last'],
      ['Given'],
    ]);
    expect(question.textContent).toContain('The order of the selected blocks does not matter.');
    expect(question.textContent).toContain('write 0 for no indentation, 1 for one level');
    expect(question.textContent).not.toContain('dragging');
    expect(question.textContent).not.toContain('Keyboard Controls');
    const groups = question.querySelectorAll(
      '[role="group"][aria-label="Choose only one block from this group"]',
    );
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.querySelectorAll('.printing-order-choice-heading')).toHaveLength(1);
      expect(group.querySelectorAll('li')).toHaveLength(2);
    }
    expect(question.textContent).not.toContain('Alternative group');
    expect(question.querySelector('em')?.textContent).toBe('Option three');
    expect(
      question.querySelector('.printing-order-provided .printing-order-block-content')?.textContent,
    ).toBe('Given');
    const positions = question.querySelectorAll('[aria-label="Include block"]');
    expect(positions).toHaveLength(8);
    for (const position of positions) expect(position.textContent).toBe('');
    expect(question.textContent).toContain('Mark any provided blocks you want to include too.');
    expect(question.querySelectorAll('[aria-label="Indentation level"]')).toHaveLength(8);
    expect(question.querySelector('.printing-order-blocks > .printing-response-area')).toBeNull();
    expect(question.textContent).not.toContain('Solution with indentation');
    expect(question.querySelector('[id^="order-blocks-"], input')).toBeNull();
  });

  it('uses blank number boxes without a duplicate written response for unindented ordering', () => {
    const question = printQuestion(`<div class="pl-order-blocks-question-uuid">
      <ul id="order-blocks-options-uuid">
        <li class="pl-order-block"><div class="pl-order-block-content">First</div></li>
        <li class="pl-order-block"><div class="pl-order-block-content">Second</div></li>
      </ul>
    </div>`);
    expect(question.querySelectorAll('.printing-order-options')).toHaveLength(1);
    expect(question.querySelectorAll('.printing-order-options > li')).toHaveLength(2);
    expect(question.querySelectorAll('[aria-label="Order number"]')).toHaveLength(2);
    expect(question.querySelector('ol')).toBeNull();
    expect(question.querySelector('[role="group"]')).toBeNull();
    expect(question.querySelector('.printing-order-blocks > .printing-response-area')).toBeNull();
    expect(question.textContent).not.toContain('Choose only one block from this group');
    expect(question.textContent).toContain(
      'Write 1 beside the first block, 2 beside the next, and so on. Leave unused blocks blank.',
    );
  });

  it('retains matching choices when a dropdown is the only source of options', () => {
    const question = printQuestion(
      '<div class="pl-matching-container"><div class="pl-matching-statement"><select><option value="" aria-label="Blank"></option><option value="1">Mercury</option><option value="2">Venus</option></select><span>Closest planet</span></div></div>',
    );
    expect(question.querySelectorAll('.printing-select-options li')).toHaveLength(2);
    expect(question.textContent).toContain('Mercury');
    expect(question.textContent).toContain('Venus');
    expect(question.querySelector('select')).toBeNull();
  });

  it('clears selected choices without dropping their labels', () => {
    const question = printQuestion(
      '<fieldset><label><input type="radio" checked value="secret">Choice A</label><label><input type="radio">Choice B</label></fieldset>',
    );
    expect(question.querySelector<HTMLInputElement>('input')?.checked).toBe(false);
    expect(question.querySelector('input')?.getAttribute('value')).toBeNull();
    expect(question.textContent).toContain('Choice A');
    expect(question.textContent).toContain('Choice B');
  });

  it('keeps rich-text limits, file names, and Unicode starter code with written response areas', () => {
    const encoded = Buffer.from('def greet():\n    return "café"\n').toString('base64');
    const question = printQuestion(
      `<div id="file-editor-test"><div class="card-header">answer.py<button>Help</button></div><input type="hidden" value="${encoded}"></div><div class="pl-rich-text-editor-container"><div contenteditable="true">Existing response</div><div class="pl-rich-text-editor-counter-container"><span class="small text-danger"></span><div class="text-secondary"><span class="small">Minimum 20 words</span></div></div></div>`,
    );
    expect(question.querySelector('pre')?.textContent).toBe('def greet():\n    return "café"\n');
    expect(question.textContent).toContain('answer.py');
    expect(question.textContent).not.toContain('Existing response');
    expect(question.textContent).toContain('Minimum 20 words');
    expect(question.querySelectorAll('[data-print-response-area]')).toHaveLength(2);
  });
});
