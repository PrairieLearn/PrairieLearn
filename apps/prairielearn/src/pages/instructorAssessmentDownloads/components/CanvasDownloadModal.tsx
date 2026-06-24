import { useState } from 'react';
import Alert from 'react-bootstrap/Alert';
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

export function CanvasDownloadModal({
  show,
  onHide,
  downloadUrl,
  filename,
  students,
}: CanvasDownloadModalProps) {
  const [matchingState, setMatchingState] = useState<CanvasMatchingState | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch CSV: ${response.status}`);
      }
      const csvText = await response.text();

      const lines = parseCsvWithHeaders(csvText);
      if (!lines) {
        throw new Error('Failed to parse CSV');
      }

      const canvasLookup = matchingState
        ? buildCanvasLookup(matchingState.bestResult.result)
        : null;
      const { headers, dataRows } = lines;

      const sisLoginIdx = headers.indexOf('SIS Login ID');
      const studentIdx = headers.indexOf('Student');
      const idIdx = headers.indexOf('ID');
      const sisUserIdx = headers.indexOf('SIS User ID');
      const sectionIdx = headers.indexOf('Section');

      const transformedData = dataRows.map((row) => {
        const uid = sisLoginIdx !== -1 ? row[sisLoginIdx] : null;
        const canvas = uid ? (canvasLookup?.get(uid) ?? null) : null;

        const newRow = [...row];
        if (canvas) {
          if (studentIdx !== -1) newRow[studentIdx] = canvas.name;
          if (idIdx !== -1) newRow[idIdx] = canvas.id;
          if (sisUserIdx !== -1) newRow[sisUserIdx] = canvas.sisUserId;
          if (sisLoginIdx !== -1) newRow[sisLoginIdx] = canvas.sisLoginId;
          if (sectionIdx !== -1) newRow[sectionIdx] = canvas.section;
        } else {
          if (idIdx !== -1) newRow[idIdx] = '';
          if (sisUserIdx !== -1) newRow[sisUserIdx] = '';
          if (sisLoginIdx !== -1) newRow[sisLoginIdx] = '';
          if (sectionIdx !== -1) newRow[sectionIdx] = '';
        }
        return newRow;
      });

      downloadAsCSV(headers, transformedData, filename);
      onHide();
    } catch (err) {
      setDownloadError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred while preparing the CSV.',
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal show={show} size="lg" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Download Canvas CSV</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <CanvasMatchingPanel
          students={students}
          matchingState={matchingState}
          onMatchingStateChange={setMatchingState}
        />
        {downloadError && (
          <Alert variant="danger" className="mt-3">
            {downloadError}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" disabled={downloading} onClick={handleDownload}>
          {downloading ? 'Downloading...' : 'Download'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

/**
 * Parses a PrairieLearn-generated Canvas CSV (which has a "Points Possible"
 * sentinel row) into headers + data rows. Skips the sentinel row so only
 * actual student rows are returned. Returns null if parsing fails.
 */
function parseCsvWithHeaders(csvText: string): { headers: string[]; dataRows: string[][] } | null {
  const { error } = parseCanvasCsv(csvText);
  if (error) return null;

  const rows = parseCsvRows(csvText);
  if (rows.length === 0) return null;

  const [headers, ...rest] = rows;
  const dataRows = rest.filter((row) => {
    const name = row[0]?.trim() ?? '';
    return name !== '' && !name.startsWith('Points Possible');
  });
  return { headers, dataRows };
}
