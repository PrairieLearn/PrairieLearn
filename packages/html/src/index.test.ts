import { assert } from 'chai';

import { escapeHtml, html } from './index';

describe('html', () => {
  it('escapes string value', () => {
    assert.equal(html`<p>${'<script>'}</p>`.toString(), '<p>&lt;script&gt;</p>');
  });

  it('interpolates multiple values', () => {
    assert.equal(html`<p>${'cats'} and ${'dogs'}</p>`.toString(), '<p>cats and dogs</p>');
  });

  it('interpolates a number', () => {
    assert.equal(html`<p>${123}</p>`.toString(), '<p>123</p>');
  });

  it('interpolates a bigint', () => {
    assert.equal(html`<p>${123n}</p>`.toString(), '<p>123</p>');
  });

  it('escapes values when rendering array', () => {
    const arr = ['cats>', '<dogs'];
    assert.equal(
      // prettier-ignore
      html`<ul>${arr}</ul>`.toString(),
      '<ul>cats&gt;&lt;dogs</ul>'
    );
  });

  it('does not double-escape values when rendering array', () => {
    const arr = ['cats', 'dogs'];
    assert.equal(
      // prettier-ignore
      html`<ul>${arr.map((e) => html`<li>${e}</li>`)}</ul>`.toString(),
      '<ul><li>cats</li><li>dogs</li></ul>'
    );
  });

  it('errors when interpolating object', () => {
    assert.throws(
      // @ts-expect-error -- Testing runtime behavior of bad input.
      () => html`<p>${{ foo: 'bar' }}</p>`.toString(),
      'Cannot interpolate object in template'
    );
  });

  it('omits boolean values from template', () => {
    assert.equal(html`<p>${true}${false}</p>`.toString(), '<p></p>');
  });

  it('omits nullish values from template', () => {
    assert.equal(html`<p>${null}${undefined}</p>`.toString(), '<p></p>');
  });
});

describe('escapeHtml', () => {
  it('escapes rendered HTML', () => {
    assert.equal(escapeHtml(html`<p>Hello</p>`).toString(), '&lt;p&gt;Hello&lt;/p&gt;');
  });

  it('works when nested inside html tag', () => {
    assert.equal(html`a${escapeHtml(html`<p></p>`)}b`.toString(), 'a&lt;p&gt;&lt;/p&gt;b');
  });
});
