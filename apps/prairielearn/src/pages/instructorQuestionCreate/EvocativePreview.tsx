/**
 * Evocative wireframe previews for basic template question cards.
 *
 * These are simple, wire-framey representations of what each question type
 * looks like. They're purely decorative (aria-hidden) and use basic CSS
 * shapes rather than real form elements or semantic HTML.
 */

const COLORS = {
  bg: '#f8f9fa',
  shape: '#dee2e6',
  shapeDark: '#ced4da',
};

function TextLines({ count = 2, widths }: { count?: number; widths?: string[] }) {
  const defaultWidths = ['80%', '60%', '45%'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            height: 8,
            width: widths?.[i] ?? defaultWidths[i % defaultWidths.length],
            backgroundColor: COLORS.shape,
            borderRadius: 4,
          }}
        />
      ))}
    </div>
  );
}

function RadioRow({ width = '55%' }: { width?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          border: `2px solid ${COLORS.shapeDark}`,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          height: 7,
          width,
          backgroundColor: COLORS.shape,
          borderRadius: 3,
        }}
      />
    </div>
  );
}

function CheckboxRow({ width = '55%' }: { width?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: 2,
          border: `2px solid ${COLORS.shapeDark}`,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          height: 7,
          width,
          backgroundColor: COLORS.shape,
          borderRadius: 3,
        }}
      />
    </div>
  );
}

function InputField({ width = '100%' }: { width?: string }) {
  return (
    <div
      style={{
        height: 24,
        width,
        border: `2px solid ${COLORS.shapeDark}`,
        borderRadius: 4,
        backgroundColor: 'white',
      }}
    />
  );
}

function LabeledInput({ labelWidth = '20%', inputWidth = '50%' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          height: 8,
          width: labelWidth,
          backgroundColor: COLORS.shapeDark,
          borderRadius: 4,
          flexShrink: 0,
        }}
      />
      <InputField width={inputWidth} />
    </div>
  );
}

function MultipleChoicePreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TextLines count={2} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        <RadioRow width="60%" />
        <RadioRow width="45%" />
        <RadioRow width="52%" />
        <RadioRow width="38%" />
      </div>
    </div>
  );
}

function CheckboxPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TextLines count={2} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        <CheckboxRow width="45%" />
        <CheckboxRow width="55%" />
        <CheckboxRow width="38%" />
        <CheckboxRow width="50%" />
      </div>
    </div>
  );
}

function IntegerInputPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TextLines count={2} />
      <LabeledInput labelWidth="15%" inputWidth="40%" />
    </div>
  );
}

function NumberInputPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TextLines count={2} />
      <LabeledInput labelWidth="15%" inputWidth="45%" />
    </div>
  );
}

function StringInputPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TextLines count={2} />
      <InputField width="70%" />
    </div>
  );
}

function SymbolicInputPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TextLines count={2} widths={['75%', '50%']} />
      <LabeledInput labelWidth="20%" inputWidth="55%" />
    </div>
  );
}

function RichTextEditorPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TextLines count={2} />
      <div>
        {/* Toolbar */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '4px 6px',
            backgroundColor: COLORS.shape,
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
            borderBottom: `1px solid ${COLORS.shapeDark}`,
          }}
        >
          <div
            style={{ width: 14, height: 10, backgroundColor: COLORS.shapeDark, borderRadius: 2 }}
          />
          <div
            style={{ width: 14, height: 10, backgroundColor: COLORS.shapeDark, borderRadius: 2 }}
          />
          <div
            style={{ width: 14, height: 10, backgroundColor: COLORS.shapeDark, borderRadius: 2 }}
          />
          <div
            style={{ width: 20, height: 10, backgroundColor: COLORS.shapeDark, borderRadius: 2 }}
          />
          <div
            style={{ width: 14, height: 10, backgroundColor: COLORS.shapeDark, borderRadius: 2 }}
          />
        </div>
        {/* Editor area */}
        <div
          style={{
            height: 48,
            border: `2px solid ${COLORS.shapeDark}`,
            borderTop: 'none',
            borderBottomLeftRadius: 4,
            borderBottomRightRadius: 4,
            backgroundColor: 'white',
          }}
        />
      </div>
    </div>
  );
}

function FallbackPreview() {
  return <TextLines count={3} widths={['80%', '65%', '50%']} />;
}

const PREVIEW_MAP: Record<string, () => React.JSX.Element> = {
  'multiple-choice': MultipleChoicePreview,
  checkbox: CheckboxPreview,
  'integer-input': IntegerInputPreview,
  'number-input': NumberInputPreview,
  'string-input': StringInputPreview,
  'symbolic-input': SymbolicInputPreview,
  'rich-text-editor': RichTextEditorPreview,
};

/**
 * Extracts the element type from a template question QID.
 * e.g. "template/multiple-choice/fixed" → "multiple-choice"
 */
function getElementType(qid: string): string {
  const parts = qid.split('/');
  return parts[1] ?? '';
}

export function EvocativePreview({ qid }: { qid: string }) {
  const elementType = getElementType(qid);
  const PreviewComponent = PREVIEW_MAP[elementType] ?? FallbackPreview;

  return (
    <div
      aria-hidden="true"
      style={{
        aspectRatio: '3 / 2',
        overflow: 'hidden',
        backgroundColor: COLORS.bg,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ width: '100%' }}>
        <PreviewComponent />
      </div>
    </div>
  );
}

EvocativePreview.displayName = 'EvocativePreview';
