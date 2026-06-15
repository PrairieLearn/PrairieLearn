import { describe, expect, it } from 'vitest';

import { run } from '@prairielearn/run';

import {
  b64DecodeUnicode,
  b64DecodeUnicodeBrowser,
  b64DecodeUnicodeNode,
  b64EncodeUnicode,
  b64EncodeUnicodeBrowser,
  b64EncodeUnicodeNode,
} from './base64-util.js';

describe('base64 encoding/decoding equivalence', () => {
  const testCases: { name: string; value: string }[] = [
    // ASCII cases
    { name: 'simple ASCII string', value: 'hello' },
    { name: 'string with punctuation', value: 'Hello, World!' },
    { name: 'numeric string', value: '123456789' },

    // Whitespace and escapes
    { name: 'whitespace characters', value: '\n\t\r' },
    { name: 'escaped whitespace strings', value: '\\n\\t\\r' },

    // Symbols and specials
    { name: 'special characters', value: 'special!@#$%^&*()<>?"\'`=+\\' },
    { name: 'symbols', value: '©®™' },
    { name: 'null character', value: 'null\x00char' },

    // Non-Latin scripts
    { name: 'Arabic characters', value: 'مرحبا بالعالم' },
    { name: 'Chinese characters', value: '你好世界' },
    { name: 'Greek characters', value: 'Ελληνικά' },
    { name: 'Japanese hiragana', value: 'あ' },
    { name: 'Russian characters', value: 'Привет мир' },

    // Emoji and mixed
    { name: 'emoji', value: '🎉🎊🎈' },
    { name: 'mixed scripts', value: 'Mixed: hello 世界 مرحبا' },

    // Edge cases
    { name: 'empty string', value: '' },
    { name: 'single character', value: 'a' },
  ];

  it.each(testCases)('Handles $name correctly', ({ value: testStr }) => {
    run(() => {
      // Check that we can round-trip using Node functions.
      const encoded = b64EncodeUnicodeNode(testStr);
      const decoded = b64DecodeUnicodeNode(encoded);
      expect(decoded).toBe(testStr);
    });

    run(() => {
      // Check that we can round-trip using browser functions.
      const encoded = b64EncodeUnicodeBrowser(testStr);
      const decoded = b64DecodeUnicodeBrowser(encoded);
      expect(decoded).toBe(testStr);
    });

    run(() => {
      // Check that Node and browser functions produce the same encoded output.
      const nodeEncoded = b64EncodeUnicodeNode(testStr);
      const browserEncoded = b64EncodeUnicodeBrowser(testStr);
      expect(browserEncoded).toBe(nodeEncoded);
    });

    run(() => {
      // Check that we can encode with Node and decode with the browser function.
      const nodeEncoded = b64EncodeUnicodeNode(testStr);
      const browserDecoded = b64DecodeUnicodeBrowser(nodeEncoded);
      expect(browserDecoded).toBe(testStr);
    });

    run(() => {
      // Check that we can encode with the browser function and decode with Node.
      const browserEncoded = b64EncodeUnicodeBrowser(testStr);
      const nodeDecoded = b64DecodeUnicodeNode(browserEncoded);
      expect(nodeDecoded).toBe(testStr);
    });

    run(() => {
      // Check that isomorphic functions work correctly in a Node environment.
      // We'll assume that the browser functions are tested sufficiently above.
      const encoded = b64EncodeUnicode(testStr);
      const decoded = b64DecodeUnicode(encoded);
      expect(decoded).toBe(testStr);
    });
  });
});
