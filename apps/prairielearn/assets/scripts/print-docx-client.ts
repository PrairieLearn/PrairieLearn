import { Packer } from 'docx';

import { type DocxSource, captureDocxCoverFigures } from '../../src/lib/printing/docx-browser.js';
import {
  type PrintedPageGeometry,
  createDocxDocument,
} from '../../src/lib/printing/docx-document.js';
import type { PrintableCover } from '../../src/lib/printing/printable-cover.js';

window.__PL_BUILD_PRINT_DOCX__ = async ({ geometry, cover, footerLabel, source, figures }) => {
  const document = createDocxDocument({
    geometry,
    cover: await captureDocxCoverFigures(cover),
    footerLabel,
    source,
    figures: figures.map((figure) => ({
      ...figure,
      png: Uint8Array.from(atob(figure.png), (character) => character.charCodeAt(0)),
    })),
  });
  return Packer.toBase64String(document);
};

declare global {
  interface Window {
    __PL_BUILD_PRINT_DOCX__?: (options: {
      geometry: PrintedPageGeometry;
      cover?: PrintableCover;
      footerLabel: string;
      source: DocxSource;
      figures: (DocxSource['figures'][number] & { png: string })[];
    }) => Promise<string>;
  }
}
