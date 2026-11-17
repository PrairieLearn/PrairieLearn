import { useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import { createPortal } from 'react-dom';

import type { CalculatorType } from '../schemas/infoAssessment.js';

export function CalculatorPreviewButton({ type }: { type: CalculatorType }) {
  const [mounted, setMounted] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <Button
        variant="outline-secondary"
        size="sm"
        onClick={() => {
          if (previewRef.current) {
            previewRef.current.querySelector<HTMLButtonElement>('#calculatorFab')!.click();
          } else {
            setMounted(true);
          }
        }}
      >
        <i className="bi bi-calculator me-1" aria-hidden="true" />
        Calculator
      </Button>
      {mounted &&
        createPortal(<div ref={previewRef} data-calculator-preview={type} />, document.body)}
    </>
  );
}
