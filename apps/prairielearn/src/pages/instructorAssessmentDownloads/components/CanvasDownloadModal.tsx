import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';

import { downloadAsCSV } from '@prairielearn/browser-utils';

import {
  CanvasMatchingPanel,
  type CanvasMatchingState,
} from '../../../components/CanvasMatchingPanel.js';
import {
  type Student,
  buildCanvasLookup,
  parseCanvasCsv,
  parseCsvRows,
} from '../../../lib/canvas-matching.js';

interface CanvasDownloadModalProps {
  show: boolean;
  onHide: () => void;
  downloadUrl: string;
  filename: string;
  students: Student[];
}

export function CanvasDownloadModal({ show, ...rest }: CanvasDownloadModalProps) {
  return (
    <Modal show={show} size="lg" onHide={rest.onHide} onExited={() => {}}>
      {show && <CanvasDownloadModalContent {...rest} />}
    </Modal>
  );
}

function CanvasDownloadModalContent({
  onHide,
  downloadUrl,
  filename,
  students,
}: Omit<CanvasDownloadModalProps, 'show'>) {
  const [matchingState, setMatchingState] = useState<CanvasMatchingState | null>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!matchingState) {
      // No matching — download directly from the server
      window.location.href = downloadUrl;
      onHide();
      return;
    }

    setDownloading(true);
    try {
      const response = await fetch(downloadUrl);
      const csvText = await response.text();

      const lines = parseCsvWithHeaders(csvText);
      if (!lines) {
        window.location.href = downloadUrl;
        onHide();
        return;
      }

      const canvasLookup = buildCanvasLookup(matchingState.currentResult);
      const { headers, dataRows } = lines;

      const sisLoginIdx = headers.indexOf('SIS Login ID');
      const studentIdx = headers.indexOf('Student');
      const idIdx = headers.indexOf('ID');
      const sisUserIdx = headers.indexOf('SIS User ID');
      const sectionIdx = headers.indexOf('Section');

      const transformedData = dataRows.map((row) => {
        const uid = sisLoginIdx !== -1 ? row[sisLoginIdx] : null;
        const canvas = uid ? canvasLookup.get(uid) : null;

        const newRow = [...row];
        if (canvas) {
          if (studentIdx !== -1) newRow[studentIdx] = canvas.name;
          if (idIdx !== -1) newRow[idIdx] = canvas.id;
          if (sisUserIdx !== -1) newRow[sisUserIdx] = canvas.sisUserId;
          if (sisLoginIdx !== -1) newRow[sisLoginIdx] = canvas.sisLoginId;
          if (sectionIdx !== -1) newRow[sectionIdx] = canvas.section;
        }
        return newRow;
      });

      downloadAsCSV(headers, transformedData, filename);
      onHide();
    } catch {
      window.location.href = downloadUrl;
      onHide();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <Modal.Header closeButton>
        <Modal.Title>Download Canvas CSV</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <CanvasMatchingPanel
          students={students}
          matchingState={matchingState}
          onMatchingStateChange={setMatchingState}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" disabled={downloading} onClick={handleDownload}>
          {downloading ? 'Downloading...' : matchingState ? 'Download with matching' : 'Download'}
        </Button>
      </Modal.Footer>
    </>
  );
}

/**
 * Parses a PrairieLearn-generated Canvas CSV (which has a "Points Possible"
 * sentinel row) into headers + data rows. Returns null if parsing fails.
 */
function parseCsvWithHeaders(csvText: string): { headers: string[]; dataRows: string[][] } | null {
  const { students: _unused, error } = parseCanvasCsv(csvText);
  if (error) return null;

  const rows = parseCsvRows(csvText);
  if (rows.length === 0) return null;

  const [headers, ...dataRows] = rows;
  return { headers, dataRows };
}
