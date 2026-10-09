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

  it('separates line breaks and paragraphs inside author-provided wrappers', () => {
    expect(
      htmlToTextBlocks(
        '<div><p>Bring a pen<br>Show your work.</p><p>Answer every question.</p><script>ignored()</script></div>',
      ),
    ).toEqual([
      { type: 'paragraph', text: 'Bring a pen Show your work.' },
      { type: 'paragraph', text: 'Answer every question.' },
    ]);
  });

  it('ignores empty and whitespace-only content', () => {
    expect(htmlToTextBlocks('  \n<p> </p><div></div><ol></ol>')).toEqual([]);
  });

  it('preserves authored images and SVGs among cover instructions', () => {
    const blocks = htmlToTextBlocks(
      '<p>Use the diagram <img src="/clientFilesAssessment/diagram.png" alt="Circuit diagram"> below.</p><svg viewBox="0 0 20 10" aria-label="Graph"><path d="M0 0L20 10"/></svg>',
    );
    expect(blocks.slice(0, 3)).toEqual([
      { type: 'paragraph', text: 'Use the diagram' },
      {
        type: 'figure',
        src: '/clientFilesAssessment/diagram.png',
        alt: 'Circuit diagram',
      },
      { type: 'paragraph', text: 'below.' },
    ]);
    expect(blocks[3]).toMatchObject({ type: 'figure', alt: 'Graph' });
    expect(decodeURIComponent((blocks[3] as { src: string }).src)).toContain('viewBox="0 0 20 10"');
  });

  it('preserves figures inside inline wrappers and headings', () => {
    const blocks = htmlToTextBlocks(
      '<p>See <a href="#"><img src="/diagram.png" alt="Diagram"></a> here.</p><h2>Chart <span><svg viewBox="0 0 2 2" aria-label="Chart"><circle cx="1" cy="1" r="1"/></svg></span></h2>',
    );
    expect(blocks).toMatchObject([
      { type: 'paragraph', text: 'See' },
      { type: 'figure', src: '/diagram.png', alt: 'Diagram' },
      { type: 'paragraph', text: 'here.' },
      { type: 'heading', text: 'Chart' },
      { type: 'figure', alt: 'Chart' },
    ]);
  });
});
