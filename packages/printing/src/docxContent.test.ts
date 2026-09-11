import { load } from 'cheerio';
import { Document, Packer } from 'docx';
import JSZip from 'jszip';
import { expect, it } from 'vitest';

import { buildDocxContent } from './docxContent.js';

it('preserves mathematical symbols and XML punctuation in native Office Math', async () => {
  const mathml =
    '<math><mi>x</mi><mo>&lt;</mo><mn>2</mn><mo>&#x2227;</mo><mi>y</mi><mo>&gt;</mo><mn>0</mn><mo>&amp;</mo><mi>α</mi></math>';
  const $ = load(
    '<article class="printing-question" data-question-number="1"><div class="question-body"><span></span></div></article>',
  );
  $('span').attr('data-docx-math', mathml);
  const content = buildDocxContent($.html(), [], 700);
  const zip = await JSZip.loadAsync(
    await Packer.toBuffer(new Document({ sections: [{ children: content.children }] })),
  );
  const xml = await zip.file('word/document.xml')!.async('string');
  const word = load(xml, { xmlMode: true });
  expect(word('m\\:t').text()).toBe('x<2∧y>0&α');
  expect(word('m\\:oMath')).toHaveLength(1);
  expect(xml).not.toContain('&#x');
});

it('preserves response areas and matrix tables nested inside input groups', async () => {
  const html = `<article class="printing-question" data-question-number="1"><div class="question-body">
    <div class="input-group"><div class="printing-response-area"><div class="printing-response-lines" data-docx-height="128"></div></div></div>
    <div class="input-group"><table><tr><td>top left</td><td>top right</td></tr><tr><td>bottom left</td><td>bottom right</td></tr></table></div>
  </div></article>`;
  const content = buildDocxContent(html, [], 700);
  const zip = await JSZip.loadAsync(
    await Packer.toBuffer(new Document({ sections: [{ children: content.children }] })),
  );
  const xml = await zip.file('word/document.xml')!.async('string');
  const word = load(xml, { xmlMode: true });
  expect(word('w\\:tbl')).toHaveLength(2);
  expect(word('w\\:tbl').last().find('w\\:tr')).toHaveLength(2);
  expect(word('w\\:tbl').first().find('w\\:tr')).toHaveLength(4);
});

it('keeps selection options separate and preserves lettered answer references', async () => {
  const html = `<article class="printing-question" data-question-number="1"><div class="question-body">
    <span class="printing-selection-group" data-docx-block="true">
      <div class="printing-selection-option"><input type="checkbox"><label><div class="pl-checkbox-key-label">(a)</div><div class="pl-checkbox-answer">First choice</div></label></div>
      <div class="printing-selection-option"><input type="radio"><label><div class="pl-multiple-choice-key-label">(b)</div><div class="pl-multiple-choice-answer">Second choice</div></label></div>
    </span>
    <ol type="A"><li>Mercury</li><li>Venus</li></ol>
  </div></article>`;
  const content = buildDocxContent(html, [], 700);
  const zip = await JSZip.loadAsync(
    await Packer.toBuffer(
      new Document({
        numbering: { config: content.numbering },
        sections: [{ children: content.children }],
      }),
    ),
  );
  const word = load(await zip.file('word/document.xml')!.async('string'), { xmlMode: true });
  expect(word('w\\:tbl')).toHaveLength(2);
  expect(word('w\\:tbl').first().find('w\\:t').text()).toBe('☐(a)First choice');
  expect(word('w\\:tbl').last().find('w\\:t').text()).toBe('○(b)Second choice');
  expect(word('w\\:cantSplit')).toHaveLength(2);
  const numbering = load(await zip.file('word/numbering.xml')!.async('string'), { xmlMode: true });
  expect(numbering('w\\:numFmt[w\\:val="upperLetter"]')).toHaveLength(1);
});

it('separates answer key labels from inline prompts and keeps labels with their answers', async () => {
  const html = `<article class="printing-question" data-question-number="1"><div class="question-body">
    Score = <span><small>number ±1%</small><div class="printing-answer-key" data-docx-block="true">
      <div class="printing-answer-key-label">Correct answer</div>
      <div data-docx-block="true">Score = <samp>100</samp>%</div>
    </div></span>
  </div></article>`;
  const content = buildDocxContent(html, [], 700);
  const zip = await JSZip.loadAsync(
    await Packer.toBuffer(new Document({ sections: [{ children: content.children }] })),
  );
  const word = load(await zip.file('word/document.xml')!.async('string'), { xmlMode: true });
  const paragraphs = word('w\\:p').toArray();
  const label = paragraphs.find((node) => word(node).find('w\\:t').text() === 'Correct answer')!;
  expect(word(label).find('w\\:keepNext')).toHaveLength(1);
  expect(word(label).next().find('w\\:t').text()).toBe('Score = 100%');
  expect(paragraphs.map((node) => word(node).find('w\\:t').text())).toContain('number ±1%');
});

it('preserves ordering solution indentation without adding list bullets', async () => {
  const html = `<article class="printing-question" data-question-number="1"><div class="question-body">
    <ul><li class="pl-order-block" data-docx-indent="0" data-docx-mono="true">def sum(a, b):</li>
      <li class="pl-order-block" data-docx-indent="28" data-docx-mono="true">return a + b</li></ul>
  </div></article>`;
  const content = buildDocxContent(html, [], 700);
  const zip = await JSZip.loadAsync(
    await Packer.toBuffer(new Document({ sections: [{ children: content.children }] })),
  );
  const word = load(await zip.file('word/document.xml')!.async('string'), { xmlMode: true });
  const paragraphs = word('w\\:p').toArray();
  const definition = paragraphs.find(
    (node) => word(node).find('w\\:t').text() === 'def sum(a, b):',
  )!;
  const body = paragraphs.find((node) => word(node).find('w\\:t').text() === 'return a + b')!;
  expect(word(definition).find('w\\:ind').attr('w:left')).toBe('100');
  expect(word(body).find('w\\:ind').attr('w:left')).toBe('520');
  expect(word(body).find('w\\:rFonts').attr('w:ascii')).toBe('Courier New');
  expect(word('w\\:numPr')).toHaveLength(0);
});
