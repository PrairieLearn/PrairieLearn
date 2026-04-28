import path from 'node:path';

import fs from 'fs-extra';
import * as tmp from 'tmp-promise';
import { describe, expect, it } from 'vitest';

import { commentOutVideoReferences, serializeClientFiles } from './instructorQtiImport.js';

describe('commentOutVideoReferences', () => {
  it('comments out a self-closing img tag referencing a video', () => {
    const html = '<img src="clientFilesQuestion/video.mp4" />';
    const result = commentOutVideoReferences(html, ['video.mp4']);
    expect(result).toContain('<!--');
    expect(result).toContain('-->');
    expect(result).toContain('video.mp4');
  });

  it('comments out an open/close tag pair', () => {
    const html = '<a href="clientFilesQuestion/clip.webm">Watch</a>';
    const result = commentOutVideoReferences(html, ['clip.webm']);
    expect(result).toContain('<!--');
    expect(result).toContain('Watch');
  });

  it('does not modify HTML without matching video references', () => {
    const html = '<img src="clientFilesQuestion/image.png" />';
    const result = commentOutVideoReferences(html, ['video.mp4']);
    expect(result).toBe(html);
  });

  it('handles multiple video files', () => {
    const html = '<img src="clientFilesQuestion/a.mp4" /><img src="clientFilesQuestion/b.webm" />';
    const result = commentOutVideoReferences(html, ['a.mp4', 'b.webm']);
    // Both references should be wrapped in comments
    const commentCount = (result.match(/<!--/g) ?? []).length;
    expect(commentCount).toBe(2);
  });

  it('does not double-comment already commented references', () => {
    const html = '<!-- <img src="clientFilesQuestion/video.mp4" /> -->';
    const result = commentOutVideoReferences(html, ['video.mp4']);
    // Should not nest comments
    expect(result).toBe(html);
  });

  it('escapes regex special characters in filenames', () => {
    const html = '<img src="clientFilesQuestion/file (1).mp4" />';
    const result = commentOutVideoReferences(html, ['file (1).mp4']);
    expect(result).toContain('<!--');
  });
});

describe('serializeClientFiles', () => {
  it('encodes buffer content as base64', async () => {
    const files = new Map<string, Buffer | string>([['image.png', Buffer.from('fake png data')]]);
    const { files: result, skippedVideos } = await serializeClientFiles(files, '/nonexistent');
    expect(result['image.png']).toBe(Buffer.from('fake png data').toString('base64'));
    expect(skippedVideos).toEqual([]);
  });

  it('skips video files and reports them', async () => {
    const files = new Map<string, Buffer | string>([
      ['clip.mp4', Buffer.from('video')],
      ['image.png', Buffer.from('png')],
    ]);
    const { files: result, skippedVideos } = await serializeClientFiles(files, '/nonexistent');
    expect(result).not.toHaveProperty('clip.mp4');
    expect(result).toHaveProperty('image.png');
    expect(skippedVideos).toEqual(['clip.mp4']);
  });

  it('reads string content from web_resources directory', async () => {
    const { path: tempDir, cleanup } = await tmp.dir({ unsafeCleanup: true });
    try {
      await fs.outputFile(path.join(tempDir, 'asset.png'), 'fake asset content');

      const files = new Map<string, Buffer | string>([['asset.png', 'asset.png']]);
      const { files: result } = await serializeClientFiles(files, tempDir);
      expect(result['asset.png']).toBe(Buffer.from('fake asset content').toString('base64'));
    } finally {
      await cleanup();
    }
  });

  it('skips string paths that escape web_resources directory', async () => {
    const { path: tempDir, cleanup } = await tmp.dir({ unsafeCleanup: true });
    try {
      const files = new Map<string, Buffer | string>([['evil.txt', '../../etc/passwd']]);
      const { files: result } = await serializeClientFiles(files, tempDir);
      expect(result).not.toHaveProperty('evil.txt');
    } finally {
      await cleanup();
    }
  });

  it('skips files that do not exist', async () => {
    const { path: tempDir, cleanup } = await tmp.dir({ unsafeCleanup: true });
    try {
      const files = new Map<string, Buffer | string>([['missing.png', 'nonexistent.png']]);
      const { files: result } = await serializeClientFiles(files, tempDir);
      expect(result).not.toHaveProperty('missing.png');
    } finally {
      await cleanup();
    }
  });
});
