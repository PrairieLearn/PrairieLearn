import { load } from 'cheerio';
import { assert, describe, it } from 'vitest';

import { AIGradingExplanation } from './QuestionContainer.js';

function renderExplanation(explanation: string) {
  return load(
    AIGradingExplanation({
      explanation,
      hasImage: false,
      rotationCorrectionDegrees: null,
    }).toString(),
  )('pre');
}

describe('AI grading explanation', () => {
  it('excludes fenced code from MathJax while preserving plain text and math elsewhere', () => {
    const before = '**Math**: $x_1 + x_2$. Interface: `lo`.\n';
    const code = '```text\nuser@host:~$ echo $HOME\n<img src="x">\n```';
    const after = '\nMore math: $y_2$.';
    const explanation = before + code + after;
    const pre = renderExplanation(explanation);

    assert.isTrue(pre.hasClass('mathjax_process'));
    assert.equal(pre.text(), explanation + '\n');
    assert.equal(pre.find('.mathjax_ignore').length, 1);
    assert.equal(pre.find('.mathjax_ignore').text(), code);
    assert.equal(pre.contents().first().text(), before);
    assert.equal(pre.contents().last().text(), after + '\n');
    assert.equal(pre.find('code, img, strong').length, 0);
  });

  it.each(['````', '~~~~'])('keeps shorter or different fences inside a %s block', (fence) => {
    const code = `${fence}text\n$prompt\n\`\`\`\n~~~\n${fence}`;
    const pre = renderExplanation(code + '\nMath: $x$.');

    assert.equal(pre.find('.mathjax_ignore').length, 1);
    assert.equal(pre.find('.mathjax_ignore').text(), code);
    assert.equal(pre.contents().last().text(), '\nMath: $x$.\n');
  });

  it('excludes an unclosed fence through the end of the explanation', () => {
    const code = '```text\nuser@host:~$ echo $HOME';
    const pre = renderExplanation('Math: $x$.\n' + code);

    assert.equal(pre.find('.mathjax_ignore').text(), code);
    assert.equal(pre.contents().first().text(), 'Math: $x$.\n');
  });
});
