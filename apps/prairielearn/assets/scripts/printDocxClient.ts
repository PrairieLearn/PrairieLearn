import { Packer } from 'docx';

import { createDocxDocument } from '../../src/lib/printing/docxDocument.js';
import type { DocxSource } from '../../src/lib/printing/docxBrowser.js';
import type { PrintedPageGeometry } from '../../src/lib/printing/docxDocument.js';
import type { PrintableCover } from '../../src/lib/printing/printableCover.js';

window.__PL_BUILD_PRINT_DOCX__ = async ({ geometry, cover, footerLabel, source, figures }) => {
  const document = createDocxDocument({
    geometry,
    cover,
    footerLabel,
    source,
    figures: figures.map((figure) => ({ ...figure, png: new Uint8Array(figure.png) })),
  });
  return Array.from(new Uint8Array(await (await Packer.toBlob(document)).arrayBuffer()));
};

declare global {
  interface Window {
    __PL_BUILD_PRINT_DOCX__?: (options: {
      geometry: PrintedPageGeometry;
      cover?: PrintableCover;
      footerLabel: string;
      source: DocxSource;
      figures: (DocxSource['figures'][number] & { png: number[] })[];
    }) => Promise<number[]>;
  }
}
