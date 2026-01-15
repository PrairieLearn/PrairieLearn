import he from 'he';
import { assert, describe, it } from 'vitest';

import { renderText } from './assessment.js';

describe('assessment', () => {
  describe('renderText', () => {
    it('returns null for null text', () => {
      assert.isNull(renderText({ id: '1', text: null }, '/pl'));
    });

    it('renders assessment text with URL prefix', () => {
      const result = renderText(
        { id: '123', text: 'File: <%= clientFilesAssessment %>/test.txt' },
        '/pl',
      );
      assert.equal(result, 'File: /pl/assessment/123/clientFilesAssessment/test.txt');
    });

    it('decodes HTML entities in rendered text', () => {
      const result = renderText({ id: '1', text: '&lt;p&gt;Hello &amp; world&lt;/p&gt;' }, '/pl');
      const decoded = he.decode(result ?? '');
      assert.equal(decoded, '<p>Hello & world</p>');
    });
  });
});
