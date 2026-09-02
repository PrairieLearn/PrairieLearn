import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import { namespaceQuestionHtmls } from './namespaceQuestionHtmls.js';

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
            document.querySelector('#details');
            $('#help');
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
    expect($first('script').html()).toContain("querySelector('#question-1-details')");
    expect($first('script').html()).toContain("$('#question-1-help')");

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

  it('namespaces formula-editor symbolic inputs and their initializer', () => {
    const [html] = namespaceQuestionHtmls([
      {
        namespace: 'question-7',
        html: `
          <script>$(function () { window.PLSymbolicInput("ans"); });</script>
          <input name="ans" id="symbolic-input-sub-ans" />
          <input name="ans-latex" id="symbolic-input-latex-ans" />
          <math-field id="symbolic-input-ans"></math-field>
        `,
      },
    ]);
    const $ = load(html, undefined, false);

    expect($('script').html()).toContain('window.PLSymbolicInput("question-7-ans")');
    expect($('#symbolic-input-question-7-ans')).toHaveLength(1);
    expect($('#symbolic-input-sub-question-7-ans').attr('name')).toBe('question-7-ans');
    expect($('#symbolic-input-latex-question-7-ans').attr('name')).toBe('question-7-ans-latex');
  });

  it('uses a collision-free base name for formula-editor symbolic inputs', () => {
    const [first, second] = namespaceQuestionHtmls([
      {
        namespace: 'question-1',
        html: `
          <script>window.PLSymbolicInput("ans");</script>
          <input name="ans" id="symbolic-input-sub-ans" />
          <input name="ans-latex" id="symbolic-input-latex-ans" />
          <math-field id="symbolic-input-ans"></math-field>
        `,
      },
      {
        namespace: 'question-2',
        html: '<div id="symbolic-input-question-1-ans"></div>',
      },
    ]);
    const $first = load(first, undefined, false);
    const $combined = load(first + second, undefined, false);

    expect($first('script').html()).toContain('window.PLSymbolicInput("question-1-ans-2")');
    expect($first('#symbolic-input-question-1-ans-2')).toHaveLength(1);
    expect($combined('[id="symbolic-input-question-1-ans"]')).toHaveLength(1);
    expect($combined('[id="symbolic-input-question-1-ans-2"]')).toHaveLength(1);
  });

  it('namespaces sketch input IDs and their base-name initializer', () => {
    const [first, second] = namespaceQuestionHtmls([
      {
        namespace: 'question-1',
        html: `
          <div id="answer-sketchresponse-data"></div>
          <input id="answer-sketchresponse-submission" name="answer-sketchresponse-submission" />
          <div id="answer-si-container"></div>
          <script>window.SketchInput('answer', false)</script>
        `,
      },
      {
        namespace: 'question-2',
        html: `
          <div id="answer-sketchresponse-data"></div>
          <input id="answer-sketchresponse-submission" name="answer-sketchresponse-submission" />
          <div id="answer-si-container"></div>
          <script>window.SketchInput('answer', true)</script>
        `,
      },
    ]);
    const $first = load(first, undefined, false);
    const $second = load(second, undefined, false);

    expect($first('#question-1-answer-si-container')).toHaveLength(1);
    expect($first('#question-1-answer-sketchresponse-data')).toHaveLength(1);
    expect($first('#question-1-answer-sketchresponse-submission').attr('name')).toBe(
      'question-1-answer-sketchresponse-submission',
    );
    expect($first('script').html()).toContain("window.SketchInput('question-1-answer', false)");
    expect($second('#question-2-answer-si-container')).toHaveLength(1);
    expect($second('script').html()).toContain("window.SketchInput('question-2-answer', true)");
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
