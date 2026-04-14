import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';

import { downloadAsCSV } from '@prairielearn/browser-utils';

import {
  CanvasMatchingPanel,
  type CanvasMatchingState,
} from '../../../components/CanvasMatchingPanel.js';
import { type PlStudent, buildCanvasLookup, parseCanvasCsv } from '../../../lib/canvas-matching.js';

interface CanvasDownloadModalProps {
  show: boolean;
  onHide: () => void;
  downloadUrl: string;
  filename: string;
  plStudents: PlStudent[];
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
  plStudents,
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
          plStudents={plStudents}
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

  // Re-parse manually to get all rows including Points Possible
  const lines = csvText.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;

  const headers = parseSimpleCsvRow(lines[0]);

  const dataRows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    dataRows.push(parseSimpleCsvRow(lines[i]));
  }

  return { headers, dataRows };
}

/**
 * Parses a single CSV row, handling quoted fields.
 */
function parseSimpleCsvRow(line: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (i <= line.length) {
    if (i === line.length) {
      fields.push('');
      break;
    }

    if (line[i] === '"') {
      let value = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
      if (i < line.length && line[i] === ',') i++;
    } else {
      const commaIdx = line.indexOf(',', i);
      if (commaIdx === -1) {
        fields.push(line.slice(i));
        break;
      } else {
        fields.push(line.slice(i, commaIdx));
        i = commaIdx + 1;
      }
    }
  }

  return fields;
}
