import { useEffect, useRef, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';

export type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; pages: number; questions: number; points: number }
  | { status: 'error'; message: string };

export function PrintPreview({
  url,
  paperWidth,
  selectedQuestion,
  onStateChange,
}: {
  url: string;
  paperWidth: number;
  selectedQuestion: { number: string } | null;
  onStateChange: (state: PreviewState) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Selecting a question in the review list moves to its printed location.
  useEffect(() => {
    if (!selectedQuestion || state.status !== 'ready') return;
    frameRef.current?.contentDocument
      ?.querySelector(`[data-question-number="${CSS.escape(selectedQuestion.number)}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [selectedQuestion, state.status]);

  function watchPreview() {
    cleanupRef.current();
    const doc = frameRef.current?.contentDocument;
    const root = doc?.documentElement;

    function update(next: PreviewState) {
      setState(next);
      onStateChange(next);
    }
    if (!root?.dataset.printStatus) {
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
      if (!root) return;
      if (root.dataset.printStatus === 'ready') {
        cleanupRef.current();
        update({
          status: 'ready',
          pages: Number(root.dataset.printPageCount),
          questions: Number(root.dataset.printQuestionCount),
          points: Number(root.dataset.printMaxPoints),
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
  }

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
