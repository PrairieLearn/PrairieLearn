import { assert, describe, it } from 'vitest';

import {
  ROOT_SELECTION,
  parseSelectionQueryParam,
  selectionEquals,
  selectionParser,
} from './selection.js';

describe('selectionParser', () => {
  it('round-trips file and directory selections', () => {
    for (const selection of [
      { kind: 'file' as const, path: 'tests/foo.py' },
      { kind: 'dir' as const, path: 'tests' },
      { kind: 'dir' as const, path: null },
    ]) {
      assert.deepEqual(selectionParser.parse(selectionParser.serialize(selection)), selection);
    }
  });

  it('serializes the root by writing an empty dir prefix', () => {
    assert.equal(selectionParser.serialize(ROOT_SELECTION), 'dir:');
  });
});

describe('parseSelectionQueryParam', () => {
  it('decodes file and directory prefixes', () => {
    assert.deepEqual(parseSelectionQueryParam('file:tests/foo.py'), {
      kind: 'file',
      path: 'tests/foo.py',
    });
    assert.deepEqual(parseSelectionQueryParam('dir:tests'), { kind: 'dir', path: 'tests' });
  });

  it('treats an empty dir as the root', () => {
    assert.deepEqual(parseSelectionQueryParam('dir:'), ROOT_SELECTION);
  });

  it('falls back to the root for malformed input', () => {
    for (const raw of [undefined, null, '', 'tests/foo.py', 'file:', 'unknown:x', 42]) {
      assert.deepEqual(parseSelectionQueryParam(raw), ROOT_SELECTION);
    }
  });

  it('falls back to the root for paths that escape the question root', () => {
    for (const raw of [
      'file:../infoCourse.json',
      'file:foo/../../bar',
      'file:/etc/passwd',
      'file:foo\\bar',
      'file:foo\0bar',
      'dir:..',
      'dir:../tests',
      'dir:/tmp',
    ]) {
      assert.deepEqual(parseSelectionQueryParam(raw), ROOT_SELECTION);
    }
  });
});

describe('selectionEquals', () => {
  it('compares by kind and path', () => {
    assert.isTrue(selectionEquals({ kind: 'file', path: 'a' }, { kind: 'file', path: 'a' }));
    assert.isFalse(selectionEquals({ kind: 'file', path: 'a' }, { kind: 'dir', path: 'a' }));
    assert.isFalse(selectionEquals({ kind: 'dir', path: null }, { kind: 'dir', path: '' }));
  });
});
