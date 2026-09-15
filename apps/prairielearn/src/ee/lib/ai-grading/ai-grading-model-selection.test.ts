import { describe, expect, it } from 'vitest';

import {
  encodeAiGradingModelSelection,
  parseAiGradingModelSelection,
} from './ai-grading-model-selection.js';

describe('parseAiGradingModelSelection', () => {
  it('parses first-party model ids', () => {
    expect(parseAiGradingModelSelection('gpt-5.6-terra')).toEqual({
      kind: 'first_party',
      modelId: 'gpt-5.6-terra',
    });
  });

  it('parses openai-compatible model ids that contain colons', () => {
    expect(parseAiGradingModelSelection('openai-compatible:42:meta/llama3:70b')).toEqual({
      kind: 'openai_compatible',
      endpointId: '42',
      modelId: 'meta/llama3:70b',
    });
  });

  it('rejects malformed values', () => {
    expect(parseAiGradingModelSelection('not-a-model')).toBeNull();
    expect(parseAiGradingModelSelection('openai-compatible:abc:gpt')).toBeNull();
    expect(parseAiGradingModelSelection('openai-compatible:12:')).toBeNull();
  });
});

describe('encodeAiGradingModelSelection', () => {
  it('round-trips custom endpoint selections', () => {
    const encoded = encodeAiGradingModelSelection({
      kind: 'openai_compatible',
      endpointId: '9',
      modelId: 'gpt-4o',
    });
    expect(encoded).toBe('openai-compatible:9:gpt-4o');
    expect(parseAiGradingModelSelection(encoded)).toEqual({
      kind: 'openai_compatible',
      endpointId: '9',
      modelId: 'gpt-4o',
    });
  });
});
