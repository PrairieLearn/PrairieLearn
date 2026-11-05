import { describe, expect, it } from 'vitest';

import { htmlToTextBlocks } from './printable-cover.js';

describe('htmlToTextBlocks', () => {
  it('maps headings, paragraphs, and lists to text blocks', () => {
    expect(
      htmlToTextBlocks(
        '<h2>Academic integrity pledge</h2>\n<p>I, <strong>____</strong>, pledge that\n the work is my own.</p><ol><li>First</li><li>Second <em>item</em></li></ol><ul><li>Bullet</li></ul>',
      ),
    ).toEqual([
      { type: 'heading', runs: [{ text: 'Academic integrity pledge' }] },
      {
        type: 'paragraph',
        runs: [
          { text: 'I, ' },
          { text: '____', bold: true },
          { text: ', pledge that the work is my own.' },
        ],
      },
      {
        type: 'list',
        ordered: true,
        items: [[{ text: 'First' }], [{ text: 'Second ' }, { text: 'item', italic: true }]],
      },
      { type: 'list', ordered: false, items: [[{ text: 'Bullet' }]] },
    ]);
  });

  it('keeps bare text and flattens nested lists', () => {
    expect(
      htmlToTextBlocks('Plain text<ul><li>Outer <ul><li>Inner</li></ul></li><li>  </li></ul>'),
    ).toEqual([
      { type: 'paragraph', runs: [{ text: 'Plain text' }] },
      { type: 'list', ordered: false, items: [[{ text: 'Outer Inner' }]] },
    ]);
  });

  it('separates line breaks and paragraphs inside author-provided wrappers', () => {
    expect(
      htmlToTextBlocks(
        '<div><p>Bring a pen<br>Show your work.</p><p>Answer every question.</p><script>ignored()</script></div>',
      ),
    ).toEqual([
      { type: 'paragraph', runs: [{ text: 'Bring a pen Show your work.' }] },
      { type: 'paragraph', runs: [{ text: 'Answer every question.' }] },
    ]);
  });

  it('ignores empty and whitespace-only content', () => {
    expect(htmlToTextBlocks('  \n<p> </p><div></div><ol></ol>')).toEqual([]);
  });

  it('omits hidden cover instructions', () => {
    expect(
      htmlToTextBlocks(`
        <p>Visible <span style="display: none">secret</span> instructions</p>
        <div hidden><p>Hidden paragraph</p></div>
        <h2>Title</h2>
        <ul><li>Keep this <span style="visibility: hidden">private</span></li></ul>
      `),
    ).toEqual([
      { type: 'paragraph', runs: [{ text: 'Visible instructions' }] },
      { type: 'heading', runs: [{ text: 'Title' }] },
      { type: 'list', ordered: false, items: [[{ text: 'Keep this' }]] },
    ]);
  });

  it('ignores images in cover instructions', () => {
    expect(
      htmlToTextBlocks(
        '<p>Read <img src="/diagram.png" alt="Diagram"> carefully.</p><svg><title>Graph</title></svg><h2>Rules <svg><title>Chart</title></svg></h2><ul><li>Show <img src="/icon.png"> your work.</li></ul>',
      ),
    ).toEqual([
      { type: 'paragraph', runs: [{ text: 'Read carefully.' }] },
      { type: 'heading', runs: [{ text: 'Rules' }] },
      { type: 'list', ordered: false, items: [[{ text: 'Show your work.' }]] },
    ]);
  });
});
