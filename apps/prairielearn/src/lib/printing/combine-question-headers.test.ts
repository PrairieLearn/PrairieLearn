import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import { combineQuestionHeaders } from './combine-question-headers.js';

describe('combineQuestionHeaders', () => {
  it('combines question import maps before loading element scripts', () => {
    const result = combineQuestionHeaders([
      '<script type="importmap">{"imports":{"marked":"/marked.js"}}</script>\n<script src="/element.js"></script>',
      '<script type="importmap">{"imports":{"marked":"/marked.js","pl-excalidraw-js":"/pl-excalidraw.js"}}</script>\n<script src="/element.js"></script>',
    ]);

    const $ = load(result);
    expect($('script[type="importmap"]')).toHaveLength(1);
    expect(JSON.parse($('script[type="importmap"]').text())).toEqual({
      imports: { marked: '/marked.js', 'pl-excalidraw-js': '/pl-excalidraw.js' },
    });
    expect($('script').first().attr('type')).toBe('importmap');
    expect($('script[src="/element.js"]')).toHaveLength(1);
  });

  it('rejects conflicting URLs for the same question import', () => {
    expect(() =>
      combineQuestionHeaders([
        '<script type="importmap">{"imports":{"marked":"/marked-201.js"}}</script>',
        '<script type="importmap">{"imports":{"marked":"/marked-203.js"}}</script>',
      ]),
    ).toThrow('Questions use conflicting import maps for marked');
  });
});
