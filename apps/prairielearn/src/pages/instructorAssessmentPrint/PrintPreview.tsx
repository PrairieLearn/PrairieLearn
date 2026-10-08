import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';

import { type PrintSnapshot, capturePrintSnapshot } from '../../lib/client/print-snapshot.js';

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

export function PrintPreview({
  url,
  paperWidth,
  selectedQuestion,
  onStateChange,
  onSnapshotReady,
}: {
  url: string;
  paperWidth: number;
  selectedQuestion: { number: string } | null;
  onStateChange: (state: PreviewState) => void;
  onSnapshotReady: (snapshot: PrintSnapshot, doc: Document) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const watchedDocumentRef = useRef<Document | null>(null);
  const cleanupRef = useRef<() => void>(() => {});
  const [scale, setScale] = useState(1);
  const [state, setState] = useState<PreviewState>({ status: 'loading' });

  // Fit the full paper width inside the preview without changing its print layout.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / (paperWidth + 64)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [paperWidth]);

  // Disconnect the frame’s readiness observer when a preview is replaced.
  useEffect(() => () => cleanupRef.current(), []);

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
    if (!selectedQuestion || state.status !== 'ready') return;
    frameRef.current?.contentDocument
      ?.querySelector(`[data-question-number="${CSS.escape(selectedQuestion.number)}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [selectedQuestion, state.status]);

  const watchPreview = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (
      doc?.URL !== new URL(url, window.location.href).href ||
      doc.readyState !== 'complete' ||
      watchedDocumentRef.current === doc
    ) {
      return;
    }
    watchedDocumentRef.current = doc;
    cleanupRef.current();
    const watchedDoc = doc;
    const root = watchedDoc.documentElement;

    function update(next: PreviewState) {
      setState(next);
      onStateChange(next);
    }
    if (!root.dataset.printStatus) {
      update({
        status: 'error',
        message: 'The preview could not be loaded. Try again or open it in a new tab.',
      });
      return;
    }
    const observer = new MutationObserver(readState);
    const timeout = window.setTimeout(() => {
      cleanupRef.current();
      update({
        status: 'error',
        message: 'The preview is taking longer than expected. Try again.',
      });
    }, 120_000);
    cleanupRef.current = () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };

    function readState() {
      if (root.dataset.printStatus === 'ready') {
        cleanupRef.current();
        try {
          onSnapshotReady(capturePrintSnapshot(watchedDoc), watchedDoc);
        } catch (error) {
          update({ status: 'error', message: String(error) });
          return;
        }
        update({
          status: 'ready',
          pages: Number(root.dataset.printPageCount),
          questions: Number(root.dataset.printQuestionCount),
          points: Number(root.dataset.printMaxPoints),
          warnings: JSON.parse(root.dataset.printWarnings ?? '[]'),
        });
      } else if (root.dataset.printStatus === 'error') {
        cleanupRef.current();
        update({
          status: 'error',
          message: root.dataset.printError ?? 'Unable to lay out this exam.',
        });
      }
    }
    observer.observe(root, { attributes: true, attributeFilter: ['data-print-status'] });
    readState();
  }, [onSnapshotReady, onStateChange, url]);

  // The frame can finish loading while the preparation page hydrates; observe its document even
  // if React missed the load event.
  useEffect(() => {
    const interval = window.setInterval(watchPreview, 250);
    const initialCheck = window.setTimeout(watchPreview, 0);
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
    };
  }, [watchPreview]);

  return (
    <div
      ref={containerRef}
      className="print-preparation-preview"
      aria-busy={state.status === 'loading'}
    >
      {state.status === 'loading' && (
        <div className="print-preparation-overlay" role="status">
          <Spinner size="sm" className="me-2" /> Laying out your exam…
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
        onLoad={watchPreview}
      />
    </div>
  );
}
