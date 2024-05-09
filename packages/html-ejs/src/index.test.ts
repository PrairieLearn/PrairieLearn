import { assert } from 'chai';

import { renderEjs } from './index.js';

describe('renderEjs', () => {
  it('renders EJS template without data', () => {
    // eslint-disable-next-line no-restricted-globals -- Not yet native ESM
    assert.equal(renderEjs(__filename, '<p>Hello</p>', {}).toString(), '<p>Hello</p>');
  });

  it('renders EJS template with data', () => {
    assert.equal(
      // eslint-disable-next-line no-restricted-globals -- Not yet native ESM
      renderEjs(__filename, '<p>Hello <%= name %></p>', { name: 'Divya' }).toString(),
      '<p>Hello Divya</p>',
    );
  });
});
