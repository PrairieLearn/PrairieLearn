import { PDFContext, PDFDict } from 'pdf-lib';
import { expect, it } from 'vitest';

import { type PdfContentOptions, rewritePdfContent } from './pdf-content-stream.js';

it('preserves text containing PDF syntax while marking only declared decoration', () => {
  const context = PDFContext.create();
  const propertyReference = context.register(context.obj({ MCID: 1 }));
  const options: PdfContentOptions = {
    classify: (mcid) =>
      mcid === 0
        ? { tagged: true, artifact: null }
        : mcid === 1
          ? { tagged: false, artifact: 'decoration' }
          : undefined,
    resolveProperties: (name) =>
      name === 'Decoration' ? context.lookup(propertyReference, PDFDict) : undefined,
    visitForm: () => {},
    location: 'test page',
  };
  const source = String.raw`% /Artifact BMC is a comment
/Span << /MCID 0 /Nested [true null << /Text (nested \(string\)) >>] >> BDC
BT [(BDC EMC BI \) (nested) <</MCID 1>>) -12 <45 4d 43>] TJ ET
EMC
/Span /Decoration BDC
0 0 m 10 10 l S
EMC
`;
  const rewritten = rewritePdfContent(Buffer.from(source), options);
  expect(Buffer.from(rewritten).toString()).toBe(
    source.replace('/Span /Decoration BDC', '/Artifact BMC'),
  );

  for (const [content, error] of [
    ['(untagged) Tj', /Unclassified/],
    ['/Span /Decoration BDC (meaningful) Tj EMC', /CSS decoration/],
    ['/Artifact BMC /Span <</MCID 0>> BDC (text) Tj EMC EMC', /nested inside an artifact/],
    ['BI /W 1 /H 1 ID binary EMC EI', /Inline PDF images/],
    ['/Span <</MCID null>> BDC EMC', /nonnegative integer/],
    ['EMC', /Unbalanced/],
  ] as const) {
    expect(() => rewritePdfContent(Buffer.from(content), options)).toThrow(error);
  }
});
