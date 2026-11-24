import { type RefObject } from 'react';
import { Dropdown } from 'react-bootstrap';

import type { PrintDocument } from '../../../lib/printing/index.js';

export function PrintDownloadMenu({
  buttonRef,
  hidden,
  canDownload,
  selectedFormName,
  hasMultipleForms,
  mixedPaperSizes,
  onDownloadPdf,
  onDownloadWord,
  onOpenCombined,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  hidden: boolean;
  canDownload: boolean;
  /** The selected form's name, such as "Form A1", or null without a selected form. */
  selectedFormName: string | null;
  hasMultipleForms: boolean;
  mixedPaperSizes: boolean;
  onDownloadPdf: (document: PrintDocument) => void;
  onDownloadWord: (document: PrintDocument) => void;
  onOpenCombined: (document: PrintDocument) => void;
}) {
  return (
    <div className="print-preparation-download" hidden={hidden}>
      <Dropdown align="end">
        <Dropdown.Toggle ref={buttonRef} id="print-download-menu" size="sm" disabled={!canDownload}>
          <i className="bi bi-file-earmark-arrow-down me-2" aria-hidden="true" />
          Download…
        </Dropdown.Toggle>
        <Dropdown.Menu>
          {selectedFormName && (
            <>
              <Dropdown.Item onClick={() => onDownloadPdf('assessment')}>
                Download {selectedFormName} (PDF)
              </Dropdown.Item>
              <Dropdown.Item onClick={() => onDownloadWord('assessment')}>
                Download {selectedFormName} Word (.docx)
              </Dropdown.Item>
              <Dropdown.Item onClick={() => onDownloadPdf('answer_key')}>
                Download {selectedFormName} answer key (PDF)
              </Dropdown.Item>
              <Dropdown.Item onClick={() => onDownloadWord('answer_key')}>
                Download {selectedFormName} answer key Word (.docx)
              </Dropdown.Item>
            </>
          )}
          {hasMultipleForms && (
            <>
              <Dropdown.Divider />
              <Dropdown.Item
                disabled={mixedPaperSizes}
                onClick={() => onOpenCombined('assessment')}
              >
                Download all forms PDF
              </Dropdown.Item>
              <Dropdown.Item
                disabled={mixedPaperSizes}
                onClick={() => onOpenCombined('answer_key')}
              >
                Download all answer keys PDF
              </Dropdown.Item>
            </>
          )}
        </Dropdown.Menu>
      </Dropdown>
    </div>
  );
}
