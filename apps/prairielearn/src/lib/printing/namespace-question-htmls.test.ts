import { runInNewContext } from 'node:vm';

import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import { namespaceQuestionHtmls } from './namespace-question-htmls.js';

describe('namespaceQuestionHtmls', () => {
  it('namespaces duplicate IDs and their references while preserving unique IDs', () => {
    const [first, second] = namespaceQuestionHtmls([
      {
        namespace: 'question-1',
        html: `
          <label for="ans-a" aria-describedby="help shared-help">First</label>
          <input id="ans-a" aria-controls="details" />
          <div id="help"></div>
          <div id="shared-help"></div>
          <div id="details"></div>
          <a href="#details">Details</a>
          <style>
            #details { clip-path: url("#clip"); }
          </style>
          <svg>
            <clipPath id="clip"></clipPath>
            <rect
              clip-path="url(#clip)"
              stroke='url("#clip")'
              style="fill: url('#clip')"
            />
            <use xlink:href="#clip"></use>
          </svg>
          <div id="unique-1"></div>
          <script>
            document.getElementById("ans-a");
            document.querySelector('#details .value');
            document.querySelectorAll('.thing#details');
            $('#help > span');
          </script>
        `,
      },
      {
        namespace: 'question-2',
        html: `
          <label for="ans-a" aria-describedby="help shared-help">Second</label>
          <input id="ans-a" aria-controls="details" />
          <div id="help"></div>
          <div id="shared-help"></div>
          <div id="details"></div>
          <a href="#details">Details</a>
          <svg>
            <clipPath id="clip"></clipPath>
            <rect clip-path="url(#clip)" />
            <use xlink:href="#clip"></use>
          </svg>
          <div id="unique-2"></div>
        `,
      },
    ]);

    const $first = load(first, undefined, false);
    const $second = load(second, undefined, false);

    expect($first('label').attr('for')).toBe('question-1-ans-a');
    expect($first('label').attr('aria-describedby')).toBe('question-1-help question-1-shared-help');
    expect($first('input').attr('aria-controls')).toBe('question-1-details');
    expect($first('a').attr('href')).toBe('#question-1-details');
    expect($first('rect').attr('clip-path')).toBe('url(#question-1-clip)');
    expect($first('rect').attr('stroke')).toBe('url(#question-1-clip)');
    expect($first('rect').attr('style')).toBe('fill:url(#question-1-clip)');
    expect($first('use').attr('href')).toBe('#question-1-clip');
    expect($first('style').html()).toBe('#question-1-details{clip-path:url(#question-1-clip)}');
    expect($first('#unique-1')).toHaveLength(1);
    expect($first('script').html()).toContain('getElementById("question-1-ans-a")');
    expect($first('script').html()).toContain("querySelector('#question-1-details .value')");
    expect($first('script').html()).toContain("querySelectorAll('.thing#question-1-details')");
    expect($first('script').html()).toContain("$('#question-1-help>span')");

    expect($second('label').attr('for')).toBe('question-2-ans-a');
    expect($second('#unique-2')).toHaveLength(1);
  });

  it('does not rewrite unrelated script string literals that match duplicate IDs', () => {
    const [first] = namespaceQuestionHtmls([
      {
        namespace: 'question-1',
        html: '<div id="answer"></div><script>const mode = "answer";</script>',
      },
      {
        namespace: 'question-2',
        html: '<div id="answer"></div>',
      },
    ]);

    const $first = load(first, undefined, false);
    expect($first('#question-1-answer')).toHaveLength(1);
    expect($first('script').html()).toContain('const mode = "answer"');
  });

  it('rewrites script selectors with quotes inside the argument', () => {
    const [first] = namespaceQuestionHtmls([
      {
        namespace: 'question-1',
        html: `
          <div id="details"></div>
          <script>
            document.querySelector("[data-x='a'] #details");
            $("[name='ans'] #details");
          </script>
        `,
      },
      {
        namespace: 'question-2',
        html: '<div id="details"></div>',
      },
    ]);

    const script = load(first, undefined, false)('script').html();
    expect(script).toContain(String.raw`querySelector("[data-x=\"a\"] #question-1-details")`);
    expect(script).toContain(String.raw`$("[name=\"ans\"] #question-1-details")`);
  });

  it('decodes JavaScript escapes before rewriting selectors', () => {
    const script = String.raw`document.querySelector('#answer\\:part #details');`;
    const [first] = namespaceQuestionHtmls([
      {
        namespace: 'question-1',
        html: `<div id="answer:part"><span id="details"></span></div><script>${script}</script>`,
      },
      {
        namespace: 'question-2',
        html: '<div id="details"></div>',
      },
    ]);

    const selectors: string[] = [];
    runInNewContext(load(first, undefined, false)('script').html()!, {
      document: { querySelector: (selector: string) => selectors.push(selector) },
    });
    expect(selectors).toEqual([String.raw`#answer\:part #question-1-details`]);
  });

  it('does not rewrite call-like text inside script strings', () => {
    const script = String.raw`const source = "document.querySelector('#details')"; document.querySelector('#details');`;
    const [first] = namespaceQuestionHtmls([
      {
        namespace: 'question-1',
        html: `<div id="details"></div><script>${script}</script>`,
      },
      {
        namespace: 'question-2',
        html: '<div id="details"></div>',
      },
    ]);

    const rewrittenScript = load(first, undefined, false)('script').html();
    expect(rewrittenScript).toContain('const source = "document.querySelector(\'#details\')";');
    expect(rewrittenScript).toContain("document.querySelector('#question-1-details');");
  });

  it('preserves template selectors in scripts', () => {
    const interpolationPrefix = '$';
    const script = `document.querySelector(\`#${interpolationPrefix}{id}\`);`;
    const [first] = namespaceQuestionHtmls([
      {
        namespace: 'question-1',
        html: `<div id="details"></div><script>${script}</script>`,
      },
      {
        namespace: 'question-2',
        html: '<div id="details"></div>',
      },
    ]);

    const $first = load(first, undefined, false);
    expect($first('#question-1-details')).toHaveLength(1);
    expect($first('script').html()).toBe(script);
  });

  it('preserves CSS with parse errors', () => {
    const [first] = namespaceQuestionHtmls([
      {
        namespace: 'question-1',
        html: `
          <div id="details"></div>
          <style>#details { color: red; ??? }</style>
          <script>document.querySelector('#details #?');</script>
        `,
      },
      {
        namespace: 'question-2',
        html: '<div id="details"></div>',
      },
    ]);

    const $first = load(first, undefined, false);
    expect($first('#question-1-details')).toHaveLength(1);
    expect($first('style').html()).toBe('#details { color: red; ??? }');
    expect($first('script').html()).toBe("document.querySelector('#details #?');");
  });

  it('allocates generated IDs without colliding with existing IDs', () => {
    const [first, second] = namespaceQuestionHtmls([
      {
        namespace: 'question-1',
        html: '<label for="answer">First</label><input id="answer" />',
      },
      {
        namespace: 'question-2',
        html: '<input id="answer" /><div id="question-1-answer"></div>',
      },
    ]);

    const $first = load(first, undefined, false);
    const $combined = load(first + second, undefined, false);
    expect($first('input').attr('id')).toBe('question-1-answer-2');
    expect($first('label').attr('for')).toBe('question-1-answer-2');
    expect($combined('[id="question-1-answer"]')).toHaveLength(1);
    expect($combined('[id="question-1-answer-2"]')).toHaveLength(1);
    expect($combined('[id="question-2-answer"]')).toHaveLength(1);
  });

  it('keeps answer names stable when IDs collide across questions', () => {
    const [first, second] = namespaceQuestionHtmls([
      {
        namespace: 'question-1',
        html: '<input name="ans" id="answer" />',
      },
      {
        namespace: 'question-2',
        html: '<input name="ans" id="answer" />',
      },
    ]);
    const $first = load(first, undefined, false);
    const $second = load(second, undefined, false);

    expect($first('input').attr('id')).toBe('question-1-answer');
    expect($second('input').attr('id')).toBe('question-2-answer');
    expect($first('input').attr('name')).toBe('ans');
    expect($second('input').attr('name')).toBe('ans');
  });

  it('rejects duplicate or invalid namespaces', () => {
    expect(() =>
      namespaceQuestionHtmls([
        { namespace: 'question', html: '' },
        { namespace: 'question', html: '' },
      ]),
    ).toThrow('Question HTML namespaces must be unique');
    expect(() => namespaceQuestionHtmls([{ namespace: '1 invalid', html: '' }])).toThrow(
      'Invalid question HTML namespace: 1 invalid',
    );
  });

  it('rejects duplicate IDs within one question fragment', () => {
    expect(() =>
      namespaceQuestionHtmls([
        {
          namespace: 'question-1',
          html: '<div id="answer"></div><span id="answer"></span>',
        },
      ]),
    ).toThrow('Question HTML for namespace "question-1" contains duplicate IDs: answer');
  });
});
