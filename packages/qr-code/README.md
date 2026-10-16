# QR codes

Reusable QR generation and image decoding without an external service.

- `generateQrCodeSvg(text)` returns a scalable SVG.
- `generateQrCodePng(text)` returns a PNG buffer.
- `readQrCode(rgbaPixels, width, height)` returns the decoded text and corner coordinates, or
  `null` when no code is found. It reads one code per image.

Generated codes use medium error correction and a four-module quiet zone. Keep the quiet zone
intact when printing or embedding them. Applications own their payload format, versioning, and
validation. Decoded text is untrusted input; scanning a code does not authenticate its creator.

The decoder accepts RGBA pixels so camera capture, file uploads, and PDF rasterization can be
added independently of the QR implementation. No scanner UI or upload endpoint is included.
