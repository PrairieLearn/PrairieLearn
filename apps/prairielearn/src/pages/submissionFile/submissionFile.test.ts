import { assert, describe, it } from 'vitest';

import { guessMimeType } from './submissionFile.js';

describe('guessMimeType', () => {
  it('returns media mime types for typical image, video, and PDF extensions', async () => {
    assert.equal(await guessMimeType('image.png', Buffer.from('not-real-image')), 'image/png');
    assert.equal(await guessMimeType('photo.jpeg', Buffer.from('not-real-image')), 'image/jpeg');
    assert.equal(await guessMimeType('music.mp3', Buffer.from('not-real-audio')), 'audio/mpeg');
    assert.equal(await guessMimeType('video.mp4', Buffer.from('not-real-video')), 'video/mp4');
    assert.equal(
      await guessMimeType('document.pdf', Buffer.from('not-real-pdf')),
      'application/pdf',
    );
  });

  it('falls back to text/plain for text content with non-media extensions', async () => {
    const mimeType = await guessMimeType('notes.py', Buffer.from('hello world'));
    assert.equal(mimeType, 'text/plain');
  });

  it('falls back to application/octet-stream for binary content with non-media extensions', async () => {
    const mimeType = await guessMimeType('file.zip', Buffer.from([0x00, 0xff, 0x10, 0x80]));
    assert.equal(mimeType, 'application/octet-stream');
  });

  it('treats .ts as text when content is text (video/mp2t exception)', async () => {
    const mimeType = await guessMimeType('script.ts', Buffer.from('const x = 1;'));
    assert.equal(mimeType, 'text/plain');
  });

  it('treats .ts as binary when content is binary (video/mp2t exception)', async () => {
    const mimeType = await guessMimeType('segment.ts', Buffer.from([0x00, 0xff, 0x10, 0x80]));
    assert.equal(mimeType, 'application/octet-stream');
  });
});
