import { assert } from 'chai';

import { renderEjs } from './index.js';

describe('renderEjs', () => {
  it('renders EJS template without data', () => {
    assert.equal(renderEjs(import.meta.url, '<p>Hello</p>', {}).toString(), '<p>Hello</p>');
  });

  it('renders EJS template with data', () => {
    assert.equal(
      renderEjs(import.meta.url, '<p>Hello <%= name %></p>', { name: 'Divya' }).toString(),
      '<p>Hello Divya</p>',
    );
  });
});
