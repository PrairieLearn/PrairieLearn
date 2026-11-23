/* oxlint-disable react/iframe-missing-sandbox -- The print preview needs same-origin DOM access. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';

import type { PrintDocument } from '../../../lib/printing/index.js';
import type { PaperSize } from '../../../lib/printing/paper-size.js';

export type PreviewState =
  | { status: 'loading' }
  | {
      status: 'ready';
      pages: number;
      questions: number;
      points: number;
      warnings: { code: string; question_number: string; message: string }[];
    }
  | { status: 'error'; message: string };

/** One form and document as previewed with particular saved settings. */
export interface PreviewTarget {
  /** Changes whenever the form, document, or saved settings do. */
  id: string;
  formId: string | null;
  url: string;
  document: PrintDocument;
  paperSize: PaperSize;
}

/** A preview target plus a version, so applying the same settings again renders it again. */
export interface PreviewEntry extends PreviewTarget {
  key: string;
}

/** Reads a finished preview. The server only responds once the page is laid out. */
function readPreviewState(doc: Document): PreviewState {
  const data = doc.documentElement.dataset;
  if (data.printStatus === 'ready') {
    return {
      status: 'ready',
      pages: Number(data.printPageCount),
      questions: Number(data.printQuestionCount),
      points: Number(data.printMaxPoints),
      warnings: JSON.parse(data.printWarnings ?? '[]'),
    };
  }
  return {
    status: 'error',
    message:
      data.printStatus === 'error'
        ? (data.printError ?? 'Unable to lay out this assessment.')
        : 'The preview could not be loaded. Try again or contact support if this issue persists.',
  };
}

function PrintPreview({
  url,
  document,
  active,
  paperWidth,
  selectedQuestion,
  onStateChange,
}: {
  url: string;
  document: PrintDocument;
  active: boolean;
  paperWidth: number;
  selectedQuestion: { number: string } | null;
  onStateChange: (state: PreviewState) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [state, setState] = useState<PreviewState>({ status: 'loading' });

  // Fit the full paper width inside the preview without changing its print layout.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === 0) return;
      setScale(Math.min(1, entry.contentRect.width / (paperWidth + 64)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [paperWidth]);

  // A failed iframe navigation may be blocked by response headers and never fire a load event.
  useEffect(() => {
    if (state.status !== 'loading') return;
    const timeout = window.setTimeout(() => {
      const next: PreviewState = {
        status: 'error',
        message: 'The preview is taking longer than expected. Try again.',
      };
      setState(next);
      onStateChange(next);
    }, 180_000);
    return () => window.clearTimeout(timeout);
  }, [onStateChange, state.status]);

  // Selecting a question in the review list moves to its printed location.
  useEffect(() => {
    if (!active || !selectedQuestion || state.status !== 'ready') return;
    frameRef.current?.contentDocument
      ?.querySelector(`[data-question-number="${CSS.escape(selectedQuestion.number)}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [active, selectedQuestion, state.status]);

  const readPreview = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.URL !== new URL(url, window.location.href).href || doc.readyState !== 'complete') {
      return;
    }
    const next = readPreviewState(doc);
    setState(next);
    onStateChange(next);
  }, [onStateChange, url]);

  // The frame can finish loading before the page hydrates and attaches its load handler.
  useEffect(() => {
    readPreview();
    // Only the initial render can miss the load event.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="print-preparation-preview"
      aria-busy={state.status === 'loading'}
      aria-hidden={!active}
      data-active={active}
      inert={!active}
    >
      {state.status === 'loading' && (
        <div className="print-preparation-overlay" role="status">
          <Spinner size="sm" className="me-2" /> Laying out your{' '}
          {document === 'answer_key' ? 'answer key' : 'assessment'}…
        </div>
      )}
      {state.status === 'error' && (
        <Alert variant="danger" className="m-3 position-relative z-1">
          <Alert.Heading as="h3" className="h6">
            Preview needs attention
          </Alert.Heading>
          {state.message}
        </Alert>
      )}
      <iframe
        ref={frameRef}
        title="Printable document preview"
        src={url}
        className="print-preparation-frame"
        style={{
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
          transform: `scale(${scale})`,
          visibility: state.status === 'error' ? 'hidden' : undefined,
        }}
        onLoad={readPreview}
      />
    </div>
  );
}

/** Binds a cached preview to its entry so the page can track each preview's state. */
export function PreviewFrame({
  entry,
  active,
  selectedQuestion,
  onStateChange,
}: {
  entry: PreviewEntry;
  active: boolean;
  selectedQuestion: { number: string } | null;
  onStateChange: (key: string, state: PreviewState) => void;
}) {
  const handleStateChange = useCallback(
    (state: PreviewState) => onStateChange(entry.key, state),
    [entry.key, onStateChange],
  );

  return (
    <PrintPreview
      url={entry.url}
      document={entry.document}
      paperWidth={entry.paperSize === 'Letter' ? 816 : 794}
      active={active}
      selectedQuestion={selectedQuestion}
      onStateChange={handleStateChange}
    />
  );
}
