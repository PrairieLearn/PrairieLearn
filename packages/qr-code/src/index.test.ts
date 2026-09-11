import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { generateQrCodePng, generateQrCodeSvg, readQrCode } from './index.js';

describe('QR codes', () => {
  it('round trips Unicode and structured data through an actual PNG', async () => {
    const value = JSON.stringify({ name: 'Zoë 李', course: '9007199254740993', page: 17 });
    const png = PNG.sync.read(await generateQrCodePng(value));
    expect(readQrCode(new Uint8ClampedArray(png.data), png.width, png.height)?.text).toBe(value);
    expect(await generateQrCodeSvg(value)).toContain('<svg');
  });

  it('returns null when no code is present and rejects mismatched dimensions', () => {
    const blank = new Uint8ClampedArray(100 * 100 * 4).fill(255);
    expect(readQrCode(blank, 100, 100)).toBeNull();
    expect(() => readQrCode(blank, 100, 99)).toThrow('dimensions');
  });
});
