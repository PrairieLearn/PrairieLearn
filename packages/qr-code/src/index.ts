import jsQR from 'jsqr';
import QRCode from 'qrcode';

const OPTIONS = { errorCorrectionLevel: 'M', margin: 4, scale: 6 } as const;

/** Generates a vector QR code with a four-module quiet zone and medium error correction. */
export async function generateQrCodeSvg(value: string): Promise<string> {
  return await QRCode.toString(value, { ...OPTIONS, type: 'svg' });
}

/** Generates a PNG without requiring a browser, canvas, or an external service. */
export async function generateQrCodePng(value: string): Promise<Buffer> {
  return await QRCode.toBuffer(value, { ...OPTIONS, type: 'png' });
}

/** Reads one QR code from RGBA pixels. The returned text is untrusted input. */
export function readQrCode(pixels: Uint8ClampedArray, width: number, height: number) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    pixels.length !== width * height * 4
  ) {
    throw new Error('QR image dimensions must match the RGBA pixel buffer');
  }
  const result = jsQR.default(pixels, width, height);
  return result ? { text: result.data, location: result.location } : null;
}
