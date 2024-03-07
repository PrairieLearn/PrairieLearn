import { assert } from 'chai';

import { renderEjs } from './index';

describe('renderEjs', () => {
  it('renders EJS template without data', () => {
    assert.equal(renderEjs(__filename, '<p>Hello</p>', {}).toString(), '<p>Hello</p>');
  });

  it('renders EJS template with data', () => {
    assert.equal(
      renderEjs(__filename, '<p>Hello <%= name %></p>', { name: 'Divya' }).toString(),
      '<p>Hello Divya</p>',
    );
  });
});
