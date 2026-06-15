import { assert, describe, it } from 'vitest';

import { isRenderableComment } from '../lib/comments.js';

describe('isRenderableComment', function () {
  it('should return true for non-empty string', () => {
    assert.isTrue(isRenderableComment('Test comment'));
  });

  it('should return true for non-empty array', () => {
    assert.isTrue(isRenderableComment(['test', 'comment']));
  });

  it('should return true for non-empty object', () => {
    assert.isTrue(isRenderableComment({ comment: 'test' }));
  });

  it('should return false for null', () => {
    assert.isFalse(isRenderableComment(null));
  });

  it('should return false for empty string', () => {
    assert.isFalse(isRenderableComment(''));
  });

  it('should return false for empty array', () => {
    assert.isFalse(isRenderableComment([]));
  });

  it('should return false for empty object', () => {
    assert.isFalse(isRenderableComment({}));
  });

  it('should return false for whitespace string', () => {
    assert.isFalse(isRenderableComment('   '));
  });
});
