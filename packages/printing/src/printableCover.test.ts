import { describe, expect, it } from 'vitest';

import { htmlToTextBlocks } from './printableCover.js';

describe('htmlToTextBlocks', () => {
  it('maps headings, paragraphs, and lists to text blocks', () => {
    expect(
      htmlToTextBlocks(
        '<h2>Academic integrity pledge</h2>\n<p>I, <strong>____</strong>, pledge that\n the work is my own.</p><ol><li>First</li><li>Second <em>item</em></li></ol><ul><li>Bullet</li></ul>',
      ),
    ).toEqual([
      { type: 'heading', text: 'Academic integrity pledge' },
      { type: 'paragraph', text: 'I, ____, pledge that the work is my own.' },
      { type: 'list', ordered: true, items: ['First', 'Second item'] },
      { type: 'list', ordered: false, items: ['Bullet'] },
    ]);
  });

  it('keeps bare text and flattens nested lists', () => {
    expect(
      htmlToTextBlocks('Plain text<ul><li>Outer <ul><li>Inner</li></ul></li><li>  </li></ul>'),
    ).toEqual([
      { type: 'paragraph', text: 'Plain text' },
      { type: 'list', ordered: false, items: ['Outer Inner'] },
    ]);
  });

  it('ignores empty and whitespace-only content', () => {
    expect(htmlToTextBlocks('  \n<p> </p><div></div><ol></ol>')).toEqual([]);
  });
});
