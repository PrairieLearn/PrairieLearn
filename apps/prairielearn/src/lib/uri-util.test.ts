import { assert } from 'chai';

import { encodePath } from './uri-util.js';

describe('uri-util', () => {
  describe('encodePath', () => {
    it('handles simple file names', () => {
      assert.equal(encodePath('test.txt'), 'test.txt');
      assert.equal(encodePath('dir'), 'dir');
    });

    it('handles simple file paths', () => {
      assert.equal(encodePath('dir/test.txt'), 'dir/test.txt');
      assert.equal(
        encodePath('dir/with/multiple/names/file.py'),
        'dir/with/multiple/names/file.py',
      );
      assert.equal(encodePath('../file.bin'), '../file.bin');
      assert.equal(encodePath('.git/HEAD'), '.git/HEAD');
    });

    it('normalizes paths', () => {
      assert.equal(encodePath('dirA/../dirB/test.txt'), 'dirB/test.txt');
    });

    it('encodes same characters as encodeURLComponent except /', () => {
      assert.equal(encodePath('dir/test%with%percent.txt'), 'dir/test%25with%25percent.txt');
      assert.equal(encodePath('dir;2/file&3.txt'), 'dir%3B2/file%263.txt');
      assert.equal(
        encodePath("-_.!~*'();/?:@&=+$,#.json"),
        "-_.!~*'()%3B/%3F%3A%40%26%3D%2B%24%2C%23.json",
      );
    });

    it('encodes ASCII non-printable characters', () => {
      assert.equal(
        encodePath('dir/\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f.txt'),
        'dir/%00%01%02%03%04%05%06%07%08%09%0A%0B%0C%0D%0E%0F.txt',
      );
    });

    it('encodes non-ASCII Unicode characters', () => {
      assert.equal(encodePath('dir/áéíóú.txt'), 'dir/%C3%A1%C3%A9%C3%AD%C3%B3%C3%BA.txt');
    });
  });
});
