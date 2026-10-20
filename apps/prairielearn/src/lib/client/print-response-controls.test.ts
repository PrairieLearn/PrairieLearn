import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { getPythonPath } from '../code-caller/python-path.js';

import {
  normalizeAnswerPresentation,
  normalizeResponseControls,
  removeResponseControlsForAnswerKey,
} from './print-response-controls.js';

let rendered: Record<string, string>;

beforeAll(async () => {
  const python = await getPythonPath();
  const script = fileURLToPath(new URL('print-response-controls-fixtures.py', import.meta.url));
  rendered = JSON.parse(execFileSync(python, [script], { encoding: 'utf8' }));
});

afterEach(() => vi.unstubAllGlobals());

function printQuestion(html: string): HTMLElement {
  const dom = new JSDOM(
    `<section class="printing-question"><div class="question-block"><div class="question-body">${html}</div></div></section>`,
    { url: 'https://example.com/print/preview' },
  );
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  const question = dom.window.document.body;
  normalizeResponseControls(question);
  return question;
}

function renderedQuestion(name: string): HTMLElement {
  return printQuestion(rendered[name]);
}

describe('printable response controls', () => {
  it('shows only the selected tab of a rendered variable output in answer keys', () => {
    const dom = new JSDOM(rendered.variable_output);
    vi.stubGlobal('document', dom.window.document);
    normalizeAnswerPresentation(dom.window.document.body);
    expect(dom.window.document.querySelectorAll('.pl-variable-output .tab-pane')).toHaveLength(1);
    expect(
      dom.window.document.querySelector('.pl-variable-output .tab-pane.active'),
    ).not.toBeNull();
  });

  it('prints rendered multiple-choice dropdowns without interpreting literal text as markup', () => {
    const question = renderedQuestion('multiple_choice_dropdown');
    const choices = question.querySelectorAll('.printing-choice > span:last-child');
    expect(choices).toHaveLength(2);
    expect(choices[0].textContent).toContain('<em>Literal label</em>');
    expect(choices[0].querySelector('em')).toBeNull();
    expect(choices[1].querySelector('strong')?.textContent).toBe('Styled label');
    expect(question.querySelector('select')).toBeNull();
  });

  it('prints media without a source as plain text', () => {
    const question = printQuestion(`
      <iframe title="Reference"></iframe>
      <audio src="" title="Recording"></audio>
      <video><source src=" "></video>
    `);
    expect(question.querySelector('a, iframe, audio, video')).toBeNull();
    expect(
      [...question.querySelectorAll('.printing-media-reference')].map(
        (element) => element.textContent,
      ),
    ).toEqual(['Reference', 'Recording', 'Media reference']);
  });

  it('preserves media links and falls back to nonempty nested sources', () => {
    const question = printQuestion(`
      <iframe src="/reference" title="Reference"></iframe>
      <audio src="recording.mp3" title="Recording"></audio>
      <video src=""><source src=" "><source src="https://media.example.com/video"></video>
    `);
    expect(
      [...question.querySelectorAll<HTMLAnchorElement>('a')].map((link) => [
        link.href,
        link.textContent,
      ]),
    ).toEqual([
      ['https://example.com/reference', 'Reference: https://example.com/reference'],
      [
        'https://example.com/print/recording.mp3',
        'Recording: https://example.com/print/recording.mp3',
      ],
      ['https://media.example.com/video', 'Media reference: https://media.example.com/video'],
    ]);
  });

  it('prints options from a rendered dropdown without its blank choice', () => {
    const question = renderedQuestion('dropdown');
    expect(
      [...question.querySelectorAll('.printing-select-options li')].map((option) =>
        option.textContent.trim(),
      ),
    ).toEqual(['Positive association', 'Negative association']);
    expect(question.querySelector('select')).toBeNull();
  });

  it('keeps the labels, units, and useful hints from rendered numeric and symbolic inputs', () => {
    const question = renderedQuestion('inputs');
    expect(question.querySelectorAll('[data-print-response-line]')).toHaveLength(2);
    expect(question.textContent).toContain('Force:');
    expect(question.textContent).toContain('Derivative:');
    expect(question.textContent).toContain('N');
    expect(question.querySelector('.printing-response-placeholder')?.textContent).toBe(
      '3 significant figures',
    );
    expect(question.textContent).not.toContain('symbolic expression');
    expect(question.querySelector('input, math-field')).toBeNull();
  });

  it('keeps prompts and choices while removing rendered controls from answer keys', () => {
    const question = printQuestion(rendered.inputs + rendered.multiple_choice_radio);
    const questionBody = question.querySelector<HTMLElement>('.question-body')!;
    removeResponseControlsForAnswerKey(questionBody);
    for (const text of ['Force:', 'Derivative:', 'Choice A', 'Choice B']) {
      expect(questionBody.textContent).toContain(text);
    }
    expect(questionBody.querySelector('[data-print-response-line], input')).toBeNull();
  });

  it('keeps each rendered matrix entry and its row and column label', () => {
    const question = renderedQuestion('matrix');
    expect(question.querySelectorAll('td [data-print-response-line]')).toHaveLength(2);
    expect(question.querySelector('[aria-label="Row 1, Column 2"]')).not.toBeNull();
    expect(question.textContent).toContain('A =');
  });

  it('replaces a rendered image-capture interface with one drawing area', () => {
    const question = printQuestion(`<p>Show your work.</p>${rendered.image_capture}`);
    expect(question.querySelectorAll('[data-print-response-area]')).toHaveLength(1);
    expect(question.querySelector('.printing-drawing-response')).not.toBeNull();
    expect(question.querySelector('input, video, button, .image-capture-card')).toBeNull();
    expect(question.querySelector('.printing-subsection p')?.textContent).toBe('Show your work.');
  });

  it('prints rendered ordering blocks with supplied blocks and indentation fields', () => {
    const question = renderedQuestion('order_blocks');
    const options = question.querySelector('.printing-order-options');
    for (const text of ['First', 'Alternative one', 'Alternative two', 'Last']) {
      expect(options?.textContent).toContain(text);
    }
    expect(question.querySelector('.printing-order-provided')?.textContent).toContain('Given');
    expect(question.querySelectorAll('[aria-label="Indentation level"]')).toHaveLength(5);
    expect(question.querySelector('[id^="order-blocks-"], input')).toBeNull();
  });

  it('prints rendered ordering blocks without duplicate blank responses', () => {
    const question = renderedQuestion('order_blocks_unindented');
    expect(question.querySelectorAll('.printing-order-options > li')).toHaveLength(2);
    expect(question.querySelectorAll('[aria-label="Order number"]')).toHaveLength(2);
    expect(question.querySelector('[aria-label="Indentation level"]')).toBeNull();
    expect(question.querySelector('.printing-order-blocks > .printing-response-area')).toBeNull();
  });

  it('retains rendered matching statements and options without their dropdowns', () => {
    const question = renderedQuestion('matching');
    expect(question.querySelectorAll('.pl-matching-options li')).toHaveLength(3);
    for (const text of ['Iron', 'Sodium', 'Ag']) expect(question.textContent).toContain(text);
    expect(question.querySelector('select')).toBeNull();
  });

  it('clears selected rendered choices without dropping their labels', () => {
    const radio = renderedQuestion('multiple_choice_radio');
    const checkbox = renderedQuestion('checkbox_fieldset');
    for (const question of [radio, checkbox]) {
      expect(question.querySelector('input[checked], input[value]')).toBeNull();
      expect(question.querySelector<HTMLInputElement>('input')?.checked).toBe(false);
    }
    for (const text of ['Choice A', 'Choice B']) expect(radio.textContent).toContain(text);
    for (const text of ['First', 'Second']) expect(checkbox.textContent).toContain(text);
  });

  it.each(['checkbox_fieldset', 'checkbox_inline'])(
    'moves instructions before rendered %s options',
    (fixture) => {
      const question = renderedQuestion(fixture);
      const group = question.querySelector('fieldset, [role="group"]')!;
      const instructions = group.querySelector('.printing-checkbox-instructions');
      expect(instructions?.nextElementSibling?.classList).toContain('form-check');
    },
  );

  it('keeps file names, starter code, and rich-text limits from rendered editors', () => {
    const question = printQuestion(rendered.file_editor + rendered.rich_text);
    expect(question.querySelector('pre')?.textContent).toBe('def greet():\n    return "café"');
    expect(question.textContent).toContain('answer.py');
    expect(question.textContent).toContain('Minimum 20 words');
    expect(question.querySelectorAll('[data-print-response-area]')).toHaveLength(2);
  });

  it.each(['not base64!', '/w=='])('rejects unreadable starter code (%s)', (encoded) => {
    expect(() =>
      printQuestion(`<div id="file-editor-test"><input type="hidden" value="${encoded}"></div>`),
    ).toThrow('Starter code could not be read. Check the question’s file editor before printing.');
  });
});
