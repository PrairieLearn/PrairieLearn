import { describe, expect, it } from 'vitest';

import {
  computeAnthropicImageTokens,
  computeGoogleImageTokens,
  computeOpenAiGpt5ImageTokens,
  computeOpenAiGpt5MiniImageTokens,
} from './ai-grading-token-counting.js';

describe('computeOpenAiGpt5MiniImageTokens', () => {
  it('counts tokens for a medium image', () => {
    expect(computeOpenAiGpt5MiniImageTokens(1024, 1024)).toBe(1659);
  });

  it('resizes to patch budget for a large image', () => {
    expect(computeOpenAiGpt5MiniImageTokens(1800, 2400)).toBe(2353);
  });
});

describe('computeOpenAiGpt5ImageTokens', () => {
  it('counts tokens using 512x512 tiling and base tokens', () => {
    expect(computeOpenAiGpt5ImageTokens(1024, 1024)).toBe(630);
  });
});

describe('computeGoogleImageTokens', () => {
  it('uses flat token count for 384x384 images', () => {
    expect(computeGoogleImageTokens(384, 384)).toBe(258);
  });

  it('uses 768x768 tiling for larger images', () => {
    expect(computeGoogleImageTokens(769, 768)).toBe(516);
    expect(computeGoogleImageTokens(1536, 1536)).toBe(1032);
  });
});

describe('computeAnthropicImageTokens', () => {
  it('computes tokens for a 1 megapixel image', () => {
    expect(computeAnthropicImageTokens(1000, 1000)).toBe(1334);
  });

  it('downscales by megapixel constraint at 1568x1568', () => {
    expect(computeAnthropicImageTokens(1568, 1568)).toBe(1533);
  });
});
