import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import mustache from 'mustache';
import { assert, describe, it } from 'vitest';

import { parseMustacheTemplate } from './mustache-parse.js';
import { APP_ROOT_PATH, EXAMPLE_COURSE_PATH, TEST_COURSE_PATH } from './paths.js';

// The parser must be a drop-in replacement, so compare it against mustache.js
// itself, including the messages of any errors thrown.
const upstream = new mustache.Writer();
// @ts-expect-error `templateCache` is missing from the type definitions.
upstream.templateCache = undefined;

function parseResult(parse: () => unknown) {
  try {
    return { tokens: parse() };
  } catch (err) {
    return { error: String(err) };
  }
}

function assertMatchesUpstream(template: string) {
  assert.deepStrictEqual(
    parseResult(() => parseMustacheTemplate(template)),
    parseResult(() => upstream.parse(template)),
    JSON.stringify(template),
  );
}

describe('parseMustacheTemplate', () => {
  it('matches mustache.js for templates in the example course, test course, and elements', async () => {
    const roots = [EXAMPLE_COURSE_PATH, TEST_COURSE_PATH, path.join(APP_ROOT_PATH, 'elements')];
    let count = 0;
    for (const root of roots) {
      for (const file of await fs.readdir(root, { recursive: true })) {
        if (!/\.(html|mustache|md)$/.test(file)) continue;
        assertMatchesUpstream(await fs.readFile(path.join(root, file), 'utf8'));
        count++;
      }
    }
    assert.isAbove(count, 300);
  });

  it('matches mustache.js for generated templates', () => {
    // Fragments that exercise standalone lines, delimiter changes, partial
    // indentation, syntax errors, and non-ASCII whitespace inside tags.
    const unicodeWhitespace = [0x00a0, 0x1680, 0x2028, 0x2029, 0x205f, 0x3000, 0xfeff];
    const notWhitespace = [0x0085, 0x180e, 0x200b, 0xd83d];
    const fragments = [
      '{{',
      '}}',
      '{{{',
      '}}}',
      '{{#a}}',
      '{{/a}}',
      '{{^a}}',
      '{{/b}}',
      '{{!c}}',
      '{{! multi\nline }}',
      '{{>p}}',
      '{{> p }}',
      '{{=<% %>=}}',
      '<%a%>',
      '<%#a%>',
      '<%/a%>',
      '<%={{ }}=%>',
      '{{= | | =}}',
      '|a|',
      '{{a}}',
      '{{ a }}',
      '{{&a}}',
      '{{{ a }}}',
      '{{a.b}}',
      '{{.}}',
      ' ',
      '\t',
      '\n',
      '\r\n',
      'x',
      '{',
      '}',
      '=',
      '{{=',
      '=}}',
      '{{=a b=}}',
      '{{=[ ]=}}',
      '[a]',
      '[#a]',
      '[/a]',
      '  {{#a}}  \n',
      '  {{/a}}',
      '{{!x}}\n',
      '  {{>p}}\n',
      '{{a\n}}',
      '{{\va\f}}',
      '{{={{ }}=}}',
      '{{=x=}}',
      '{{{a}}',
      ...[...unicodeWhitespace, ...notWhitespace].flatMap((code) => {
        const c = String.fromCharCode(code);
        return [
          c,
          `{{${c}a${c}}}`,
          `{{#${c}a}}`,
          `{{/a${c}}}`,
          `{{{a${c}}${c}}}`,
          `{{=${c}<%${c}%>${c}=}}`,
        ];
      }),
    ];
    // A fixed linear congruential generator keeps failures reproducible.
    let seed = 1;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let i = 0; i < 20_000; i++) {
      let template = '';
      const length = 1 + random(12);
      for (let j = 0; j < length; j++) template += fragments[random(fragments.length)];
      assertMatchesUpstream(template);
    }
  });

  it('parses long lines in linear time', () => {
    // Work that depends on the rest of the line or template, repeated for each
    // tag, makes these take minutes or exhaust memory instead of milliseconds.
    assert.lengthOf(parseMustacheTemplate('x{{&a}}'.repeat(500_000)), 1_000_000);
    assert.lengthOf(parseMustacheTemplate('x{{>p}}'.repeat(50_000)), 100_000);
  });

  it('rejects long delimiters', () => {
    assert.lengthOf(parseMustacheTemplate(`{{=${'<'.repeat(32)} >=}}`), 1);
    assert.throws(
      () => parseMustacheTemplate(`{{=${'<'.repeat(33)} >=}}`),
      'Unsupported tags: ' + '<'.repeat(33) + ',>',
    );
  });
});
